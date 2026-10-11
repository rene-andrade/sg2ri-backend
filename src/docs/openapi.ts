/**
 * Documento OpenAPI 3.1 montado a partir dos mesmos schemas zod usados na
 * validação: os schemas com `.meta({ id })` viram components via z.toJSONSchema
 * (JSON Schema 2020-12, o dialeto do OpenAPI 3.1).
 */
import { z } from '../lib/zod.js';
import type { ZodObject, ZodType } from 'zod';
import { ListarUsuariosQuerySchema } from '../modules/usuarios/usuario.schemas.js';
import { ListarItensQuerySchema } from '../modules/itens/item.schemas.js';
import {
  DisponibilidadeQuerySchema,
  ListarReservasQuerySchema,
} from '../modules/reservas/reserva.schemas.js';
import { RelatorioOcupacaoQuerySchema } from '../modules/relatorios/relatorio.schemas.js';
// Importados pelo efeito colateral de registrar seus schemas no globalRegistry.
import '../modules/auth/auth.schemas.js';

type JsonSchema = Record<string, unknown>;

const jsonSchemaOpts = { io: 'input', unrepresentable: 'any', target: 'draft-2020-12' } as const;

/** Remove $schema/$id: o dialeto vem do documento e os components são referenciados por caminho. */
function semDialeto(schema: JsonSchema): JsonSchema {
  const { $schema: _schema, $id: _id, ...resto } = schema;
  return resto;
}

const ref = (id: string) => ({ $ref: `#/components/schemas/${id}` });

/** Transforma cada campo de um schema de query em um parâmetro OpenAPI. */
function queryParams(schema: ZodType) {
  const shape = (schema as unknown as ZodObject).shape;
  return Object.entries(shape).map(([name, campo]) => ({
    name,
    in: 'query',
    required: !(campo as ZodType).safeParse(undefined).success,
    schema: semDialeto(z.toJSONSchema(campo as ZodType, jsonSchemaOpts) as JsonSchema),
  }));
}

const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};

const respostasErro = {
  400: 'Dados inválidos (validação).',
  401: 'Token ausente, inválido ou expirado.',
  403: 'Perfil sem permissão para a operação.',
  404: 'Registro não encontrado.',
  409: 'Conflito (duplicidade, conflito de horário ou registro vinculado).',
  422: 'Violação de regra de negócio.',
} as const;
type StatusErro = keyof typeof respostasErro;

interface Operacao {
  tag: string;
  summary: string;
  description?: string;
  publica?: boolean;
  perfis?: string[];
  path?: boolean;
  query?: ZodType;
  body?: string;
  resposta?: { status: number; descricao: string; schema?: JsonSchema };
  erros?: StatusErro[];
}

function op(o: Operacao) {
  const erros = new Set<StatusErro>(o.erros ?? []);
  if (!o.publica) erros.add(401);
  if (o.perfis) erros.add(403);
  if (o.path) erros.add(404);
  if (o.body || o.query || o.path) erros.add(400);

  const descricao = [o.description, o.perfis ? `**Perfis permitidos:** ${o.perfis.join(', ')}.` : undefined]
    .filter(Boolean)
    .join('\n\n');

  const resposta = o.resposta ?? { status: 200, descricao: 'Sucesso.' };
  return {
    tags: [o.tag],
    summary: o.summary,
    ...(descricao ? { description: descricao } : {}),
    ...(o.publica ? { security: [] } : {}),
    parameters: [...(o.path ? [idParam] : []), ...(o.query ? queryParams(o.query) : [])],
    ...(o.body
      ? { requestBody: { required: true, content: { 'application/json': { schema: ref(o.body) } } } }
      : {}),
    responses: {
      [resposta.status]: {
        description: resposta.descricao,
        ...(resposta.schema ? { content: { 'application/json': { schema: resposta.schema } } } : {}),
      },
      ...Object.fromEntries(
        [...erros]
          .sort()
          .map((s) => [s, { description: respostasErro[s], content: { 'application/json': { schema: ref('Erro') } } }]),
      ),
    },
  };
}

const lista = (id: string) => ({ type: 'array', items: ref(id) });
const ADMIN = ['ADMIN'];

export function buildOpenApiDocument() {
  const { schemas } = z.toJSONSchema(z.globalRegistry, {
    ...jsonSchemaOpts,
    uri: (id) => `#/components/schemas/${id}`,
  }) as { schemas: Record<string, JsonSchema> };

  const components = Object.fromEntries(Object.entries(schemas).map(([id, s]) => [id, semDialeto(s)]));

  return {
    openapi: '3.1.0',
    info: {
      title: 'SG2RI API',
      version: '1.0.0',
      description:
        'API do Sistema de Gestão de Reserva de Recursos e Instalações. ' +
        'Autentique-se em `POST /auth/login` e use o token no botão **Authorize**. ' +
        'Erros seguem o formato `{ message, code, details? }`.',
    },
    servers: [{ url: '/api' }],
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Autenticação e sessão' },
      { name: 'Usuários', description: 'Perfil próprio e gestão de usuários' },
      { name: 'Itens', description: 'Catálogo de recursos reserváveis' },
      { name: 'Reservas', description: 'Solicitação, aprovação, check-in e check-out' },
      { name: 'Relatórios', description: 'Indicadores de ocupação e ociosidade' },
      { name: 'Sistema' },
    ],
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas: {
        ...components,
        Erro: {
          type: 'object',
          required: ['message', 'code'],
          properties: {
            message: { type: 'string', examples: ['Credenciais inválidas.'] },
            code: { type: 'string', examples: ['CREDENCIAIS_INVALIDAS'] },
            details: {},
          },
        },
      },
    },
    paths: {
      '/health': {
        get: op({ tag: 'Sistema', summary: 'Verifica se a API está no ar', publica: true }),
      },

      // ── Auth ──
      '/auth/login': {
        post: op({
          tag: 'Auth',
          summary: 'Autentica com e-mail e senha',
          publica: true,
          body: 'LoginRequest',
          resposta: { status: 200, descricao: 'Usuário e token JWT.', schema: ref('LoginResponse') },
          erros: [401, 403],
        }),
      },
      '/auth/me': {
        get: op({
          tag: 'Auth',
          summary: 'Dados do usuário autenticado',
          resposta: { status: 200, descricao: 'Usuário.', schema: ref('Usuario') },
        }),
      },

      // ── Usuários ──
      '/usuarios': {
        get: op({
          tag: 'Usuários',
          summary: 'Lista usuários',
          perfis: ADMIN,
          query: ListarUsuariosQuerySchema,
          resposta: { status: 200, descricao: 'Lista de usuários.', schema: lista('Usuario') },
        }),
        post: op({
          tag: 'Usuários',
          summary: 'Cadastra usuário',
          perfis: ADMIN,
          body: 'CriarUsuarioRequest',
          resposta: { status: 201, descricao: 'Usuário criado.', schema: ref('Usuario') },
          erros: [409],
        }),
      },
      '/usuarios/importar': {
        post: op({
          tag: 'Usuários',
          summary: 'Importação em massa via CSV',
          description: 'Cabeçalho esperado: `nome,email,matricula,perfil,departamento,senha`. Linhas inválidas são reportadas em `errors` sem abortar o lote.',
          perfis: ADMIN,
          body: 'ImportarUsuariosRequest',
          resposta: { status: 201, descricao: 'Resultado da importação.', schema: ref('ImportacaoUsuariosResultado') },
        }),
      },
      '/usuarios/me': {
        put: op({
          tag: 'Usuários',
          summary: 'Atualiza o próprio perfil',
          body: 'AtualizarPerfilRequest',
          resposta: { status: 200, descricao: 'Perfil atualizado.', schema: ref('Usuario') },
          erros: [409],
        }),
      },
      '/usuarios/me/senha': {
        patch: op({
          tag: 'Usuários',
          summary: 'Altera a própria senha',
          body: 'AlterarSenhaRequest',
          resposta: { status: 204, descricao: 'Senha alterada.' },
          erros: [422],
        }),
      },
      '/usuarios/{id}': {
        get: op({
          tag: 'Usuários',
          summary: 'Detalha usuário',
          perfis: ADMIN,
          path: true,
          resposta: { status: 200, descricao: 'Usuário.', schema: ref('Usuario') },
        }),
        put: op({
          tag: 'Usuários',
          summary: 'Atualiza usuário',
          description: 'Senha em branco ou omitida mantém a atual.',
          perfis: ADMIN,
          path: true,
          body: 'AtualizarUsuarioRequest',
          resposta: { status: 200, descricao: 'Usuário atualizado.', schema: ref('Usuario') },
          erros: [409, 422],
        }),
        delete: op({
          tag: 'Usuários',
          summary: 'Exclui usuário sem reservas',
          perfis: ADMIN,
          path: true,
          resposta: { status: 204, descricao: 'Usuário excluído.' },
          erros: [409, 422],
        }),
      },
      '/usuarios/{id}/ativo': {
        patch: op({
          tag: 'Usuários',
          summary: 'Ativa/inativa o acesso do usuário',
          perfis: ADMIN,
          path: true,
          resposta: { status: 200, descricao: 'Usuário com o novo status.', schema: ref('Usuario') },
          erros: [422],
        }),
      },

      // ── Itens ──
      '/itens': {
        get: op({
          tag: 'Itens',
          summary: 'Lista itens reserváveis',
          query: ListarItensQuerySchema,
          resposta: { status: 200, descricao: 'Lista de itens.', schema: lista('Item') },
        }),
        post: op({
          tag: 'Itens',
          summary: 'Cadastra item',
          perfis: ADMIN,
          body: 'SalvarItemRequest',
          resposta: { status: 201, descricao: 'Item criado.', schema: ref('Item') },
        }),
      },
      '/itens/{id}': {
        get: op({
          tag: 'Itens',
          summary: 'Detalha item',
          path: true,
          resposta: { status: 200, descricao: 'Item.', schema: ref('Item') },
        }),
        put: op({
          tag: 'Itens',
          summary: 'Atualiza item',
          perfis: ADMIN,
          path: true,
          body: 'SalvarItemRequest',
          resposta: { status: 200, descricao: 'Item atualizado.', schema: ref('Item') },
        }),
        delete: op({
          tag: 'Itens',
          summary: 'Exclui item sem reservas',
          perfis: ADMIN,
          path: true,
          resposta: { status: 204, descricao: 'Item excluído.' },
          erros: [409],
        }),
      },

      // ── Reservas ──
      '/reservas': {
        get: op({
          tag: 'Reservas',
          summary: 'Lista reservas (calendário, aprovações)',
          query: ListarReservasQuerySchema,
          resposta: { status: 200, descricao: 'Lista de reservas.', schema: lista('Reserva') },
        }),
        post: op({
          tag: 'Reservas',
          summary: 'Solicita uma reserva',
          description:
            'Regras aplicadas: item ATIVO; data/hora futura; fim > início; equipamentos com 24h de antecedência; ' +
            'RN01 (aluno reserva sala por no máximo 2h); conflito de horário com RN02 (professor tem prioridade ' +
            'sobre pedidos pendentes de alunos em equipamentos — a reserva é criada com `prioridadeDocente: true`). ' +
            'Em conflito (409), `details.sugestoes` traz horários livres próximos no mesmo dia. ' +
            'A administração é notificada por e-mail (RF06).',
          body: 'CriarReservaRequest',
          resposta: { status: 201, descricao: 'Reserva criada como PENDENTE.', schema: ref('Reserva') },
          erros: [404, 409, 422],
        }),
      },
      '/reservas/minhas': {
        get: op({
          tag: 'Reservas',
          summary: 'Reservas do usuário autenticado',
          resposta: { status: 200, descricao: 'Lista de reservas.', schema: lista('Reserva') },
        }),
      },
      '/reservas/disponibilidade': {
        get: op({
          tag: 'Reservas',
          summary: 'Verifica a disponibilidade de um item em um horário',
          query: DisponibilidadeQuerySchema,
          resposta: { status: 200, descricao: 'Situação, conflitos e sugestões de horário.', schema: ref('Disponibilidade') },
          erros: [404],
        }),
      },
      '/reservas/devolucoes-pendentes': {
        get: op({
          tag: 'Reservas',
          summary: 'Reservas retiradas cujo período terminou sem devolução',
          perfis: ADMIN,
          resposta: { status: 200, descricao: 'Lista de reservas.', schema: lista('Reserva') },
        }),
      },
      '/reservas/devolucoes-pendentes/notificar': {
        post: op({
          tag: 'Reservas',
          summary: 'Envia por e-mail o alerta de devolução pendente (RF06)',
          perfis: ADMIN,
          resposta: { status: 200, descricao: '`{ total, enviadas, falhas }`.' },
        }),
      },
      '/reservas/{id}': {
        get: op({
          tag: 'Reservas',
          summary: 'Detalha reserva',
          path: true,
          resposta: { status: 200, descricao: 'Reserva.', schema: ref('Reserva') },
        }),
      },
      '/reservas/{id}/aprovar': {
        patch: op({
          tag: 'Reservas',
          summary: 'Aprova uma reserva pendente',
          description:
            'Falha com 409 se houver reserva aprovada no mesmo horário. Ao aprovar um pedido com prioridade docente, ' +
            'os pedidos pendentes de alunos conflitantes são recusados automaticamente (RN02).',
          perfis: ADMIN,
          path: true,
          body: 'AprovarReservaRequest',
          resposta: { status: 200, descricao: 'Reserva aprovada.', schema: ref('Reserva') },
          erros: [409, 422],
        }),
      },
      '/reservas/{id}/recusar': {
        patch: op({
          tag: 'Reservas',
          summary: 'Recusa uma reserva pendente',
          perfis: ADMIN,
          path: true,
          body: 'RecusarReservaRequest',
          resposta: { status: 200, descricao: 'Reserva recusada.', schema: ref('Reserva') },
          erros: [422],
        }),
      },
      '/reservas/{id}/cancelar': {
        patch: op({
          tag: 'Reservas',
          summary: 'Cancela uma reserva pendente',
          description: 'Permitido ao dono da reserva ou a um administrador.',
          path: true,
          resposta: { status: 200, descricao: 'Reserva cancelada.', schema: ref('Reserva') },
          erros: [403, 422],
        }),
      },
      '/reservas/{id}/retirada': {
        patch: op({
          tag: 'Reservas',
          summary: 'Registra o check-in (retirada) de uma reserva aprovada',
          perfis: ADMIN,
          path: true,
          resposta: { status: 200, descricao: 'Reserva em uso.', schema: ref('Reserva') },
          erros: [422],
        }),
      },
      '/reservas/{id}/devolucao': {
        patch: op({
          tag: 'Reservas',
          summary: 'Registra o check-out (devolução) e a condição do recurso',
          perfis: ADMIN,
          path: true,
          body: 'DevolucaoRequest',
          resposta: { status: 200, descricao: 'Reserva concluída.', schema: ref('Reserva') },
          erros: [422],
        }),
      },

      // ── Relatórios ──
      '/relatorios/ocupacao': {
        get: op({
          tag: 'Relatórios',
          summary: 'Ocupação e ociosidade por recurso no período',
          perfis: ADMIN,
          query: RelatorioOcupacaoQuerySchema,
          resposta: { status: 200, descricao: 'Indicadores do período.', schema: ref('RelatorioOcupacao') },
        }),
      },
    },
  };
}
