import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { BusinessRuleError, ForbiddenError, NotFoundError, UnauthorizedError } from '../../errors/index.js';
import {
  REDEFINICAO_SENHA_INTERVALO_SEGUNDOS,
  REDEFINICAO_SENHA_VALIDADE_MINUTOS,
} from '../../shared/constants.js';
import { notificacaoService } from '../notificacoes/notificacao.service.js';
import { toUsuarioDTO } from '../usuarios/usuario.mapper.js';
import { hashSenha } from '../usuarios/usuario.service.js';
import { gerarToken } from './token.js';
import type { EsqueciSenhaDTO, LoginDTO, RedefinirSenhaDTO } from './auth.schemas.js';

// Hash fictício usado quando o e-mail não existe, para que o tempo de resposta
// não revele quais contas estão cadastradas.
const HASH_FICTICIO = bcrypt.hashSync('senha-inexistente', 10);

/** Só o hash do token vai para o banco: um vazamento da tabela não expõe links válidos. */
export const hashTokenRedefinicao = (token: string) => createHash('sha256').update(token).digest('hex');

const tokenInvalido = () =>
  new BusinessRuleError(
    'Este link de redefinição é inválido ou expirou. Solicite um novo.',
    'TOKEN_REDEFINICAO_INVALIDO',
  );

export const authService = {
  async login({ email, password }: LoginDTO) {
    const usuario = await prisma.usuario.findUnique({ where: { email } });
    const senhaConfere = await bcrypt.compare(password, usuario?.senhaHash ?? HASH_FICTICIO);

    if (!usuario || !senhaConfere) {
      throw new UnauthorizedError('Credenciais inválidas.', 'CREDENCIAIS_INVALIDAS');
    }
    // Só revela que a conta está inativa depois de a senha estar correta.
    if (!usuario.ativo) {
      throw new ForbiddenError('Sua conta está inativa. Procure um administrador do sistema.', 'CONTA_INATIVA');
    }

    return { user: toUsuarioDTO(usuario), token: gerarToken(usuario) };
  },

  async me(usuarioId: string) {
    const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario) throw new NotFoundError('Usuário não encontrado.');
    return toUsuarioDTO(usuario);
  },

  /**
   * "Esqueci minha senha": gera um token de uso único e envia o link por e-mail.
   * Nunca informa se o e-mail existe — o controller responde igual em todos os casos.
   */
  async solicitarRedefinicaoSenha({ email }: EsqueciSenhaDTO) {
    const usuario = await prisma.usuario.findUnique({ where: { email } });
    if (!usuario || !usuario.ativo) return;

    const pedidoRecente = await prisma.tokenRedefinicaoSenha.findFirst({
      where: {
        usuarioId: usuario.id,
        createdAt: { gt: new Date(Date.now() - REDEFINICAO_SENHA_INTERVALO_SEGUNDOS * 1000) },
      },
      select: { id: true },
    });
    if (pedidoRecente) return;

    const token = randomBytes(32).toString('base64url');
    // Um novo pedido invalida os links anteriores ainda não usados.
    await prisma.$transaction([
      prisma.tokenRedefinicaoSenha.deleteMany({ where: { usuarioId: usuario.id, usadoEm: null } }),
      prisma.tokenRedefinicaoSenha.create({
        data: {
          usuarioId: usuario.id,
          tokenHash: hashTokenRedefinicao(token),
          expiraEm: new Date(Date.now() + REDEFINICAO_SENHA_VALIDADE_MINUTOS * 60_000),
        },
      }),
    ]);

    const link = `${env.frontendUrl}/redefinir-senha?token=${token}`;
    notificacaoService.redefinicaoSenha(usuario, link, REDEFINICAO_SENHA_VALIDADE_MINUTOS);
  },

  /** Define a nova senha a partir do token recebido por e-mail (uso único, com validade). */
  async redefinirSenha({ token, novaSenha }: RedefinirSenhaDTO) {
    const registro = await prisma.tokenRedefinicaoSenha.findUnique({
      where: { tokenHash: hashTokenRedefinicao(token) },
      include: { usuario: true },
    });
    if (!registro || registro.usadoEm || registro.expiraEm <= new Date() || !registro.usuario.ativo) {
      throw tokenInvalido();
    }

    const senhaHash = await hashSenha(novaSenha);
    await prisma.$transaction(async (tx) => {
      // Marca como usado só se ainda não foi: duas requisições simultâneas com o mesmo link não passam.
      const { count } = await tx.tokenRedefinicaoSenha.updateMany({
        where: { id: registro.id, usadoEm: null },
        data: { usadoEm: new Date() },
      });
      if (count === 0) throw tokenInvalido();

      await tx.usuario.update({ where: { id: registro.usuarioId }, data: { senhaHash } });
      await tx.tokenRedefinicaoSenha.deleteMany({ where: { usuarioId: registro.usuarioId, usadoEm: null } });
    });

    notificacaoService.senhaRedefinida(registro.usuario);
  },
};
