import { z } from '../../lib/zod.js';
import { UsuarioSchema } from '../usuarios/usuario.schemas.js';

export const LoginSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email('Informe um e-mail válido.')),
    password: z.string().min(1, 'Informe a senha.'),
  })
  .meta({ id: 'LoginRequest' });
export type LoginDTO = z.infer<typeof LoginSchema>;

export const LoginResponseSchema = z
  .object({
    user: UsuarioSchema,
    token: z.string().meta({ description: 'JWT a ser enviado em Authorization: Bearer <token>' }),
  })
  .meta({ id: 'LoginResponse' });
