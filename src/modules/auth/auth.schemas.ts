import { z } from '../../lib/zod.js';
import { UsuarioSchema, zSenha } from '../usuarios/usuario.schemas.js';

export const LoginSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email('Informe um e-mail válido.')),
    password: z.string().min(1, 'Informe a senha.'),
  })
  .meta({ id: 'LoginRequest' });
export type LoginDTO = z.infer<typeof LoginSchema>;

export const EsqueciSenhaSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email('Informe um e-mail válido.')),
  })
  .meta({ id: 'EsqueciSenhaRequest' });
export type EsqueciSenhaDTO = z.infer<typeof EsqueciSenhaSchema>;

export const RedefinirSenhaSchema = z
  .object({
    token: z.string().min(1, 'Link de redefinição inválido.').max(200),
    novaSenha: zSenha(),
    confirmarSenha: z.string(),
  })
  .refine((d) => d.novaSenha === d.confirmarSenha, {
    message: 'As senhas não coincidem.',
    path: ['confirmarSenha'],
  })
  .meta({ id: 'RedefinirSenhaRequest' });
export type RedefinirSenhaDTO = z.infer<typeof RedefinirSenhaSchema>;

export const LoginResponseSchema = z
  .object({
    user: UsuarioSchema,
    token: z.string().meta({ description: 'JWT a ser enviado em Authorization: Bearer <token>' }),
  })
  .meta({ id: 'LoginResponse' });
