import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../../config/env.js';
import { UnauthorizedError } from '../../errors/index.js';

export interface TokenPayload {
  sub: string;
  role: Role;
}

export function gerarToken(usuario: { id: string; role: Role }): string {
  return jwt.sign({ role: usuario.role }, env.JWT_SECRET, {
    subject: usuario.id,
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  });
}

export function verificarToken(token: string): TokenPayload {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (typeof payload === 'string' || !payload.sub) {
      throw new UnauthorizedError('Token de acesso inválido.', 'TOKEN_INVALIDO');
    }
    return { sub: payload.sub, role: payload.role as Role };
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    if (err instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Sua sessão expirou. Faça login novamente.', 'TOKEN_EXPIRADO');
    }
    throw new UnauthorizedError('Token de acesso inválido.', 'TOKEN_INVALIDO');
  }
}
