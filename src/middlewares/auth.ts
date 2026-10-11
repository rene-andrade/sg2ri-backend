import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { ForbiddenError, UnauthorizedError } from '../errors/index.js';
import { prisma } from '../lib/prisma.js';
import { verificarToken } from '../modules/auth/token.js';

/**
 * Exige `Authorization: Bearer <token>` válido e carrega o usuário do banco,
 * para que contas inativadas/excluídas percam o acesso imediatamente.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const [scheme, token] = header?.split(' ') ?? [];
  if (scheme !== 'Bearer' || !token) {
    throw new UnauthorizedError('Token de acesso não informado.');
  }

  const payload = verificarToken(token);

  const usuario = await prisma.usuario.findUnique({
    where: { id: payload.sub },
    select: { id: true, name: true, email: true, role: true, ativo: true },
  });
  if (!usuario) {
    throw new UnauthorizedError('Sessão inválida. Faça login novamente.', 'TOKEN_INVALIDO');
  }
  if (!usuario.ativo) {
    throw new UnauthorizedError('Sua conta está inativa. Procure um administrador do sistema.', 'CONTA_INATIVA');
  }

  req.user = { id: usuario.id, name: usuario.name, email: usuario.email, role: usuario.role };
  next();
}

/** Restringe a rota aos perfis informados. Deve vir depois de `authenticate`. */
export function authorize(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new UnauthorizedError();
    if (!roles.includes(req.user.role)) throw new ForbiddenError();
    next();
  };
}

/** Usuário autenticado da requisição (lança 401 se a rota não passou por `authenticate`). */
export function usuarioAtual(req: Request): Express.AuthenticatedUser {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
}
