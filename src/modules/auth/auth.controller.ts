import type { Request, Response } from 'express';
import { usuarioAtual } from '../../middlewares/auth.js';
import { authService } from './auth.service.js';

export const authController = {
  async login(req: Request, res: Response) {
    res.json(await authService.login(req.body));
  },

  async me(req: Request, res: Response) {
    res.json(await authService.me(usuarioAtual(req).id));
  },
};
