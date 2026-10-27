/**
 * Integração ponta a ponta contra um PostgreSQL real (configurado em .env.test).
 * O banco é recriado pelo globalSetup; aqui só limpamos as tabelas.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { bancoDeTesteConfigurado } from '../testEnv.js';

const habilitado = bancoDeTesteConfigurado();

describe.skipIf(!habilitado)('integração (PostgreSQL)', async () => {
  const { createApp } = await import('../../src/app.js');
  const { prisma } = await import('../../src/lib/prisma.js');
  const { agoraNoFuso, dataISOParaDate, dateParaDataISO } = await import('../../src/shared/datetime.js');

  const app = createApp();
  const hoje = agoraNoFuso('America/Sao_Paulo').data;
  const emDias = (n: number) => {
    const d = dataISOParaDate(hoje);
    d.setUTCDate(d.getUTCDate() + n);
    return dateParaDataISO(d);
  };

  const tokens: Record<'admin' | 'professor' | 'aluno', string> = { admin: '', professor: '', aluno: '' };
  const itens: Record<'lab' | 'sala' | 'projetor', string> = { lab: '', sala: '', projetor: '' };
  const auth = (perfil: keyof typeof tokens) => ({ Authorization: `Bearer ${tokens[perfil]}` });

  const login = async (email: string, password: string) => {
    const res = await request(app).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    return res.body.token as string;
  };

  const novaReserva = (perfil: keyof typeof tokens, dados: Record<string, unknown>) =>
    request(app)
      .post('/api/reservas')
      .set(auth(perfil))
      .send({ finalidade: 'Atividade acadêmica', aceitouTermos: true, ...dados });

  beforeAll(async () => {
    await prisma.reserva.deleteMany();
    await prisma.item.deleteMany();
    await prisma.usuario.deleteMany();
    await prisma.usuario.create({
      data: { name: 'Admin Teste', email: 'admin@teste.br', role: Role.ADMIN, senhaHash: await bcrypt.hash('admin1234', 4) },
    });
    tokens.admin = await login('admin@teste.br', 'admin1234');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('autenticação e usuários', () => {
    it('rejeita senha incorreta', async () => {
      const res = await request(app).post('/api/auth/login').send({ email: 'admin@teste.br', password: 'errada' });
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Credenciais inválidas.');
    });

    it('admin cadastra professor e aluno; e-mail duplicado → 409', async () => {
      for (const [perfil, role] of [['professor', 'PROFESSOR'], ['aluno', 'ALUNO']] as const) {
        const res = await request(app)
          .post('/api/usuarios')
          .set(auth('admin'))
          .send({ name: `Usuário ${perfil}`, email: `${perfil}@teste.br`, role, senha: 'senha1234' });
        expect(res.status).toBe(201);
        expect(res.body).not.toHaveProperty('senhaHash');
        tokens[perfil] = await login(`${perfil}@teste.br`, 'senha1234');
      }

      const dup = await request(app)
        .post('/api/usuarios')
        .set(auth('admin'))
        .send({ name: 'Outro', email: 'ALUNO@teste.br', role: 'ALUNO', senha: 'senha1234' });
      expect(dup.status).toBe(409);
    });

    it('usuário altera a própria senha validando a atual', async () => {
      const errada = await request(app)
        .patch('/api/usuarios/me/senha')
        .set(auth('aluno'))
        .send({ senhaAtual: 'incorreta', novaSenha: 'novaSenha1', confirmarSenha: 'novaSenha1' });
      expect(errada.status).toBe(422);

      const ok = await request(app)
        .patch('/api/usuarios/me/senha')
        .set(auth('aluno'))
        .send({ senhaAtual: 'senha1234', novaSenha: 'novaSenha1', confirmarSenha: 'novaSenha1' });
      expect(ok.status).toBe(204);
      tokens.aluno = await login('aluno@teste.br', 'novaSenha1');
    });

    it('redefinição de senha por e-mail: link de uso único e com validade', async () => {
      const { notificacaoService } = await import('../../src/modules/notificacoes/notificacao.service.js');
      const { hashTokenRedefinicao } = await import('../../src/modules/auth/auth.service.js');
      const envioDoLink = vi.spyOn(notificacaoService, 'redefinicaoSenha');
      const esqueci = (email: string) => request(app).post('/api/auth/esqueci-senha').send({ email });
      const redefinir = (token: string, senha: string, confirmar = senha) =>
        request(app).post('/api/auth/redefinir-senha').send({ token, novaSenha: senha, confirmarSenha: confirmar });

      // E-mail inexistente: mesma resposta, nenhum envio.
      expect((await esqueci('ninguem@teste.br')).status).toBe(204);
      expect(envioDoLink).not.toHaveBeenCalled();

      expect((await esqueci('PROFESSOR@teste.br')).status).toBe(204);
      expect(envioDoLink).toHaveBeenCalledTimes(1);
      const link = envioDoLink.mock.calls[0]![1];
      const token = new URL(link).searchParams.get('token')!;
      expect(link).toContain('/redefinir-senha?token=');

      // Pedido repetido logo em seguida é ignorado (anti-spam).
      await esqueci('professor@teste.br');
      expect(envioDoLink).toHaveBeenCalledTimes(1);

      expect((await redefinir(token, 'novaSenha99', 'outraSenha99')).status).toBe(400);
      const invalido = await redefinir('token-inexistente', 'novaSenha99');
      expect(invalido.status).toBe(422);
      expect(invalido.body.code).toBe('TOKEN_REDEFINICAO_INVALIDO');

      expect((await redefinir(token, 'novaSenha99')).status).toBe(204);
      expect((await request(app).post('/api/auth/login').send({ email: 'professor@teste.br', password: 'senha1234' })).status).toBe(401);
      tokens.professor = await login('professor@teste.br', 'novaSenha99');

      // Uso único: o mesmo link não funciona de novo.
      expect((await redefinir(token, 'outraSenha99')).body.code).toBe('TOKEN_REDEFINICAO_INVALIDO');

      // Link expirado.
      const professor = await prisma.usuario.findUniqueOrThrow({ where: { email: 'professor@teste.br' } });
      await prisma.tokenRedefinicaoSenha.create({
        data: { usuarioId: professor.id, tokenHash: hashTokenRedefinicao('expirado'), expiraEm: new Date(Date.now() - 1000) },
      });
      expect((await redefinir('expirado', 'outraSenha99')).body.code).toBe('TOKEN_REDEFINICAO_INVALIDO');

      envioDoLink.mockRestore();
    });

    it('importa usuários via CSV', async () => {
      const csv = 'nome,email,matricula,perfil,departamento,senha\nZé,ze@teste.br,1,ALUNO,X,senha1234\nDup,aluno@teste.br,2,ALUNO,X,senha1234';
      const res = await request(app).post('/api/usuarios/importar').set(auth('admin')).send({ csv });
      expect(res.status).toBe(201);
      expect(res.body.imported).toHaveLength(1);
      expect(res.body.errors).toEqual([{ linha: 3, mensagem: 'E-mail duplicado: "aluno@teste.br".' }]);
    });
  });

  describe('itens', () => {
    it('admin cadastra itens e qualquer perfil lista com filtros', async () => {
      const criar = (nome: string, tipo: string, capacidade: number) =>
        request(app).post('/api/itens').set(auth('admin')).send({ nome, tipo, capacidade, localizacao: 'Bloco B' });

      itens.lab = (await criar('Lab 101', 'LABORATORIO', 35)).body.id;
      itens.sala = (await criar('Sala de Estudos 03', 'SALA', 10)).body.id;
      itens.projetor = (await criar('Projetor Epson', 'EQUIPAMENTO', 1)).body.id;

      const res = await request(app).get('/api/itens').query({ tipo: 'SALA' }).set(auth('aluno'));
      expect(res.status).toBe(200);
      expect(res.body.map((i: { id: string }) => i.id)).toEqual([itens.sala]);
    });
  });

  describe('reservas', () => {
    it('fluxo completo: solicitar → aprovar → check-in → check-out', async () => {
      const criada = await novaReserva('professor', {
        itemId: itens.lab,
        data: emDias(7),
        horaInicio: '07:30',
        horaFim: '11:00',
        quantidadePessoas: 30,
      });
      expect(criada.status).toBe(201);
      expect(criada.body).toMatchObject({ status: 'PENDENTE', turno: 'MANHA', horario: '07:30 - 11:00', itemNome: 'Lab 101' });
      const id = criada.body.id;

      const minhas = await request(app).get('/api/reservas/minhas').set(auth('professor'));
      expect(minhas.body.map((r: { id: string }) => r.id)).toContain(id);

      const conflito = await novaReserva('aluno', { itemId: itens.lab, data: emDias(7), horaInicio: '10:00', horaFim: '11:30' });
      expect(conflito.status).toBe(409);
      expect(conflito.body.code).toBe('CONFLITO_HORARIO');
      expect(conflito.body.details.sugestoes[0]).toEqual({ horaInicio: '11:10', horaFim: '12:40' });

      const aprovada = await request(app).patch(`/api/reservas/${id}/aprovar`).set(auth('admin')).send({});
      expect(aprovada.body).toMatchObject({ status: 'APROVADA', observacaoAdmin: 'Aprovado pela administração.' });

      const devolucaoAntes = await request(app).patch(`/api/reservas/${id}/devolucao`).set(auth('admin')).send({});
      expect(devolucaoAntes.status).toBe(422);

      const retirada = await request(app).patch(`/api/reservas/${id}/retirada`).set(auth('admin'));
      expect(retirada.body.retiradoEm).toEqual(expect.any(String));

      const devolucao = await request(app)
        .patch(`/api/reservas/${id}/devolucao`)
        .set(auth('admin'))
        .send({ condicao: 'DANIFICADO', observacao: 'Cabo HDMI rompido.' });
      expect(devolucao.body).toMatchObject({ condicaoDevolucao: 'DANIFICADO', observacaoDevolucao: 'Cabo HDMI rompido.' });

      const cancelarAprovada = await request(app).patch(`/api/reservas/${id}/cancelar`).set(auth('professor'));
      expect(cancelarAprovada.status).toBe(422);
    });

    it('RN01: aluno não reserva sala por mais de 2h', async () => {
      const res = await novaReserva('aluno', { itemId: itens.sala, data: emDias(3), horaInicio: '08:00', horaFim: '10:30' });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('RN01');
    });

    it('equipamentos exigem 24h de antecedência', async () => {
      const res = await novaReserva('professor', { itemId: itens.projetor, data: hoje, horaInicio: '23:58', horaFim: '23:59' });
      expect(res.status).toBe(422);
      expect(['ANTECEDENCIA_24H', 'DATA_PASSADA']).toContain(res.body.code);
    });

    it('admin reserva retroativamente se o horário estava livre; demais perfis não', async () => {
      const ontem = emDias(-1);
      const doProfessor = await novaReserva('professor', { itemId: itens.lab, data: ontem, horaInicio: '08:00', horaFim: '10:00' });
      expect(doProfessor.status).toBe(422);
      expect(doProfessor.body.code).toBe('DATA_PASSADA');

      const doAdmin = await novaReserva('admin', { itemId: itens.lab, data: ontem, horaInicio: '08:00', horaFim: '10:00' });
      expect(doAdmin.status).toBe(201);
      expect(doAdmin.body).toMatchObject({ data: ontem, status: 'PENDENTE' });

      const sobreposta = await novaReserva('admin', { itemId: itens.lab, data: ontem, horaInicio: '09:00', horaFim: '11:00' });
      expect(sobreposta.status).toBe(409);
      expect(sobreposta.body.code).toBe('CONFLITO_HORARIO');

      const equipamentoNoPassado = await novaReserva('admin', { itemId: itens.projetor, data: ontem, horaInicio: '14:00', horaFim: '15:00' });
      expect(equipamentoNoPassado.status).toBe(201);
    });

    it('RN02: professor tem prioridade sobre pedido pendente de aluno', async () => {
      const data = emDias(10);
      const doAluno = await novaReserva('aluno', { itemId: itens.projetor, data, horaInicio: '14:00', horaFim: '16:00' });
      expect(doAluno.status).toBe(201);

      const disp = await request(app)
        .get('/api/reservas/disponibilidade')
        .query({ itemId: itens.projetor, data, horaInicio: '15:00', horaFim: '17:00' })
        .set(auth('professor'));
      expect(disp.body.status).toBe('priority');

      const doProfessor = await novaReserva('professor', { itemId: itens.projetor, data, horaInicio: '15:00', horaFim: '17:00' });
      expect(doProfessor.status).toBe(201);
      expect(doProfessor.body.prioridadeDocente).toBe(true);

      await request(app).patch(`/api/reservas/${doProfessor.body.id}/aprovar`).set(auth('admin')).send({});
      const alunoDepois = await request(app).get(`/api/reservas/${doAluno.body.id}`).set(auth('admin'));
      expect(alunoDepois.body).toMatchObject({
        status: 'RECUSADA',
        observacaoAdmin: 'Recusada automaticamente: prioridade docente (RN02).',
      });
    });

    it('aluno não cancela reserva de outro usuário', async () => {
      const res = await novaReserva('professor', { itemId: itens.lab, data: emDias(8), horaInicio: '19:00', horaFim: '20:00' });
      const cancelar = await request(app).patch(`/api/reservas/${res.body.id}/cancelar`).set(auth('aluno'));
      expect(cancelar.status).toBe(403);
    });
  });

  describe('relatórios e exclusões', () => {
    it('relatório de ocupação considera reservas aprovadas do período', async () => {
      const res = await request(app)
        .get('/api/relatorios/ocupacao')
        .query({ dataInicio: hoje, dataFim: emDias(14) })
        .set(auth('admin'));
      expect(res.status).toBe(200);
      expect(res.body.totalReservasAprovadas).toBe(2);
      const lab = res.body.porItem.find((i: { itemId: string }) => i.itemId === itens.lab);
      expect(lab.horasOcupadas).toBe(3.5);
    });

    it('item com reservas não pode ser excluído', async () => {
      const res = await request(app).delete(`/api/itens/${itens.lab}`).set(auth('admin'));
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ITEM_COM_RESERVAS');
    });
  });
});
