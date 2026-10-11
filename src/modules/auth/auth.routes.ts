import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { authController } from './auth.controller.js';
import { LoginSchema } from './auth.schemas.js';

export const authRoutes = Router();

authRoutes.post('/login', validate({ body: LoginSchema }), authController.login);
authRoutes.get('/me', authenticate, authController.me);
