import { Role } from '@prisma/client';
import { z, zQueryBoolean, zTexto } from '../../lib/zod.js';
import { SENHA_MIN_CARACTERES } from '../../shared/constants.js';

const zEmail = () => z.string().trim().toLowerCase().pipe(z.email('Informe um e-mail válido.'));
export const zSenha = () =>
  z.string().min(SENHA_MIN_CARACTERES, `A senha deve ter no mínimo ${SENHA_MIN_CARACTERES} caracteres.`).max(72);
const zRole = () => z.enum(Role, `Perfil inválido. Use ${Object.values(Role).join(', ')}.`);
/** Campo textual opcional: ausente/null viram string vazia. */
const zTextoOpcional = (max = 255) =>
  z.string().trim().max(max).nullish().transform((v) => v ?? '');

// ── Respostas ────────────────────────────────────────────────────────────────
export const UsuarioSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    email: z.email(),
    role: z.enum(Role),
    department: z.string(),
    matricula: z.string(),
    initials: z.string(),
    avatarUrl: z.string().nullable(),
    ativo: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Usuario' });
export type UsuarioDTO = z.infer<typeof UsuarioSchema>;

export const ImportacaoResultadoSchema = z
  .object({
    imported: z.array(UsuarioSchema),
    errors: z.array(z.object({ linha: z.number().int(), mensagem: z.string() })),
  })
  .meta({ id: 'ImportacaoUsuariosResultado' });

// ── Requisições ──────────────────────────────────────────────────────────────
export const ListarUsuariosQuerySchema = z.object({
  role: zRole().optional(),
  ativo: zQueryBoolean().optional(),
  search: z.string().trim().optional(),
});
export type ListarUsuariosQuery = z.infer<typeof ListarUsuariosQuerySchema>;

export const CriarUsuarioSchema = z
  .object({
    name: zTexto('nome', 120),
    email: zEmail(),
    role: zRole(),
    department: zTextoOpcional(),
    matricula: zTextoOpcional(50),
    senha: zSenha(),
  })
  .meta({ id: 'CriarUsuarioRequest' });
export type CriarUsuarioDTO = z.infer<typeof CriarUsuarioSchema>;

export const AtualizarUsuarioSchema = CriarUsuarioSchema.extend({
  // Em branco/omitida mantém a senha atual (mesmo comportamento da Gestão de Usuários).
  senha: z
    .union([z.literal(''), zSenha()])
    .nullish()
    .transform((v) => v || undefined),
}).meta({ id: 'AtualizarUsuarioRequest' });
export type AtualizarUsuarioDTO = z.infer<typeof AtualizarUsuarioSchema>;

export const AtualizarPerfilSchema = z
  .object({
    name: zTexto('nome', 120),
    email: zEmail(),
    matricula: zTexto('matrícula', 50),
    department: zTextoOpcional().optional(),
    // Aceita URL ou data URL (o frontend envia a foto lida via FileReader).
    avatarUrl: z.string().max(3_000_000, 'Imagem de perfil muito grande.').nullish(),
  })
  .meta({ id: 'AtualizarPerfilRequest' });
export type AtualizarPerfilDTO = z.infer<typeof AtualizarPerfilSchema>;

export const AlterarSenhaSchema = z
  .object({
    senhaAtual: z.string().min(1, 'Informe a senha atual.'),
    novaSenha: zSenha(),
    confirmarSenha: z.string(),
  })
  .refine((d) => d.novaSenha === d.confirmarSenha, {
    message: 'As senhas não coincidem.',
    path: ['confirmarSenha'],
  })
  .meta({ id: 'AlterarSenhaRequest' });
export type AlterarSenhaDTO = z.infer<typeof AlterarSenhaSchema>;

export const ImportarUsuariosSchema = z
  .object({
    csv: z
      .string()
      .min(1, 'Envie o conteúdo do arquivo CSV.')
      .max(2_000_000)
      .meta({ example: 'nome,email,matricula,perfil,departamento,senha\nAna Souza,ana@sg2ri.edu.br,2024001,ALUNO,Engenharia,senha1234' }),
  })
  .meta({ id: 'ImportarUsuariosRequest' });
export type ImportarUsuariosDTO = z.infer<typeof ImportarUsuariosSchema>;
