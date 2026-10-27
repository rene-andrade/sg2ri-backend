import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { authController } from './auth.controller.js';
import { EsqueciSenhaSchema, LoginSchema, RedefinirSenhaSchema } from './auth.schemas.js';

export const authRoutes = Router();

authRoutes.post('/login', validate({ body: LoginSchema }), authController.login);
authRoutes.get('/me', authenticate, authController.me);
authRoutes.post('/esqueci-senha', validate({ body: EsqueciSenhaSchema }), authController.esqueciSenha);
authRoutes.post('/redefinir-senha', validate({ body: RedefinirSenhaSchema }), authController.redefinirSenha);
