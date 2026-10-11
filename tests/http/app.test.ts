/**
 * Testes HTTP que não dependem de banco: o Prisma é substituído por um mock,
 * exercitando roteamento, autenticação, autorização, validação e formato de erro.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';

const prismaMock = vi.hoisted(() => ({
  usuario: { findUnique: vi.fn() },
}));
vi.mock('../../src/lib/prisma.js', () => ({ prisma: prismaMock }));

const { createApp } = await import('../../src/app.js');
const { gerarToken } = await import('../../src/modules/auth/token.js');

const app = createApp();

const usuarios = {
  admin: { id: '11111111-1111-4111-8111-111111111111', name: 'Admin', email: 'admin@x.br', role: Role.ADMIN, ativo: true },
  aluno: { id: '22222222-2222-4222-8222-222222222222', name: 'Aluno', email: 'aluno@x.br', role: Role.ALUNO, ativo: true },
  inativo: { id: '33333333-3333-4333-8333-333333333333', name: 'Inativo', email: 'i@x.br', role: Role.ALUNO, ativo: false },
};
const bearer = (u: { id: string; role: Role }) => `Bearer ${gerarToken(u)}`;

beforeEach(() => {
  prismaMock.usuario.findUnique.mockReset();
  prismaMock.usuario.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
    Object.values(usuarios).find((u) => u.id === where.id) ?? null,
  );
});

describe('infraestrutura', () => {
  it('GET /api/health responde ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('rota inexistente → 404 no formato padrão', async () => {
    const res = await request(app).get('/api/nao-existe');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'ROTA_NAO_ENCONTRADA', message: expect.any(String) });
  });

  it('JSON malformado → 400', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('JSON_INVALIDO');
  });

  it('expõe documento OpenAPI 3.1 com todos os módulos', async () => {
    const res = await request(app).get('/api/docs.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining(['/auth/login', '/usuarios', '/itens', '/reservas', '/relatorios/ocupacao']),
    );
    expect(res.body.components.schemas).toHaveProperty('Reserva');
    expect(JSON.stringify(res.body)).not.toContain('"$id"');
  });

  it('serve a interface do Swagger UI', async () => {
    const res = await request(app).get('/api/docs/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger-ui');
  });
});

describe('autenticação', () => {
  it('sem token → 401', async () => {
    const res = await request(app).get('/api/itens');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Token de acesso não informado.');
  });

  it('token inválido → 401', async () => {
    const res = await request(app).get('/api/itens').set('Authorization', 'Bearer abc.def.ghi');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_INVALIDO');
  });

  it('token expirado → 401', async () => {
    const expirado = jwt.sign({ role: 'ADMIN' }, process.env.JWT_SECRET!, {
      subject: usuarios.admin.id,
      expiresIn: -10,
    });
    const res = await request(app).get('/api/itens').set('Authorization', `Bearer ${expirado}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_EXPIRADO');
  });

  it('conta inativada perde o acesso imediatamente', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', bearer(usuarios.inativo));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('CONTA_INATIVA');
  });

  it('login valida o payload', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'nao-e-email' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDACAO');
    expect(res.body.details.map((d: { campo: string }) => d.campo)).toEqual(['body.email', 'body.password']);
  });
});

describe('autorização por perfil', () => {
  it.each([
    ['get', '/api/usuarios'],
    ['post', '/api/itens'],
    ['get', '/api/relatorios/ocupacao?dataInicio=2026-09-01&dataFim=2026-09-30'],
    ['patch', '/api/reservas/44/aprovar'],
  ] as const)('aluno em %s %s → 403', async (metodo, url) => {
    const res = await request(app)[metodo](url).set('Authorization', bearer(usuarios.aluno));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACESSO_NEGADO');
  });
});

describe('validação de payloads', () => {
  it('item sem nome/localização e com tipo inválido → 400 com mensagens em português', async () => {
    const res = await request(app)
      .post('/api/itens')
      .set('Authorization', bearer(usuarios.admin))
      .send({ nome: '  ', tipo: 'PISCINA', capacidade: 0, localizacao: '' });
    expect(res.status).toBe(400);
    const campos = res.body.details.map((d: { campo: string }) => d.campo);
    expect(campos).toEqual(expect.arrayContaining(['body.nome', 'body.tipo', 'body.capacidade', 'body.localizacao']));
    expect(res.body.message).toBe('O nome da instalação ou recurso é obrigatório.');
  });

  it('reserva sem aceite dos termos e com horário invertido → 400', async () => {
    const res = await request(app)
      .post('/api/reservas')
      .set('Authorization', bearer(usuarios.aluno))
      .send({
        itemId: 55,
        data: '2026-02-30',
        horaInicio: '10:00',
        horaFim: '09:00',
        finalidade: 'Estudo',
        aceitouTermos: false,
      });
    expect(res.status).toBe(400);
    const campos = res.body.details.map((d: { campo: string }) => d.campo);
    expect(campos).toEqual(expect.arrayContaining(['body.data', 'body.aceitouTermos']));
  });

  it('horário invertido é rejeitado quando o restante é válido', async () => {
    const res = await request(app)
      .get('/api/reservas/disponibilidade')
      .query({ itemId: 55, data: '2026-09-10', horaInicio: '10:00', horaFim: '09:00' })
      .set('Authorization', bearer(usuarios.aluno));
    expect(res.status).toBe(400);
    expect(res.body.details[0]).toEqual({
      campo: 'query.horaFim',
      mensagem: 'O horário de fim deve ser posterior ao horário de início.',
    });
  });

  it('devolução danificada exige descrição da avaria', async () => {
    const res = await request(app)
      .patch('/api/reservas/44/devolucao')
      .set('Authorization', bearer(usuarios.admin))
      .send({ condicao: 'DANIFICADO' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Descreva a avaria identificada antes de confirmar o check-out.');
  });

  it('id de rota inválido → 400', async () => {
    const res = await request(app).get('/api/itens/abc').set('Authorization', bearer(usuarios.admin));
    expect(res.status).toBe(400);
    expect(res.body.details[0].campo).toBe('params.id');
  });

  it.each(['0', '-3', '1.5'])('itens e reservas exigem id inteiro positivo (%s → 400)', async (id) => {
    const res = await request(app).get(`/api/reservas/${id}`).set('Authorization', bearer(usuarios.admin));
    expect(res.status).toBe(400);
    expect(res.body.details[0]).toEqual({ campo: 'params.id', mensagem: 'Identificador inválido.' });
  });

  it('usuários continuam exigindo UUID', async () => {
    const res = await request(app).get('/api/usuarios/123').set('Authorization', bearer(usuarios.admin));
    expect(res.status).toBe(400);
    expect(res.body.details[0].campo).toBe('params.id');
  });

  it('troca de senha exige confirmação igual', async () => {
    const res = await request(app)
      .patch('/api/usuarios/me/senha')
      .set('Authorization', bearer(usuarios.aluno))
      .send({ senhaAtual: 'qualquer', novaSenha: 'novaSenha123', confirmarSenha: 'outra12345' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('As senhas não coincidem.');
  });
});

describe('devoluções pendentes', () => {
  it('somente administradores consultam ou notificam', async () => {
    const lista = await request(app).get('/api/reservas/devolucoes-pendentes').set('Authorization', bearer(usuarios.aluno));
    const notificar = await request(app)
      .post('/api/reservas/devolucoes-pendentes/notificar')
      .set('Authorization', bearer(usuarios.aluno));
    expect(lista.status).toBe(403);
    expect(notificar.status).toBe(403);
  });

  it('as novas rotas estão documentadas no OpenAPI', async () => {
    const res = await request(app).get('/api/docs.json');
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining(['/reservas/devolucoes-pendentes', '/reservas/devolucoes-pendentes/notificar']),
    );
  });
});
