import type { Role } from '@prisma/client';

declare global {
  namespace Express {
    interface AuthenticatedUser {
      id: string;
      name: string;
      email: string;
      role: Role;
    }

    interface Request {
      /** Usuário autenticado, preenchido pelo middleware `authenticate`. */
      user?: AuthenticatedUser;
      /** Query/params já validados e convertidos pelo middleware `validate`. */
      validated: {
        query?: unknown;
        params?: unknown;
      };
    }
  }
}

export {};
