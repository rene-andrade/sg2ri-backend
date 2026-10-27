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

  async esqueciSenha(req: Request, res: Response) {
    await authService.solicitarRedefinicaoSenha(req.body);
    // Mesma resposta exista ou não a conta, para não revelar e-mails cadastrados.
    res.status(204).end();
  },

  async redefinirSenha(req: Request, res: Response) {
    await authService.redefinirSenha(req.body);
    res.status(204).end();
  },
};
