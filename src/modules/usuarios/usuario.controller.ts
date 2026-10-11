import type { Request, Response } from 'express';
import { usuarioAtual } from '../../middlewares/auth.js';
import type { IdParams } from '../../lib/zod.js';
import { usuarioService } from './usuario.service.js';
import type { ListarUsuariosQuery } from './usuario.schemas.js';

const idDe = (req: Request) => (req.validated.params as IdParams).id;

export const usuarioController = {
  async listar(req: Request, res: Response) {
    res.json(await usuarioService.listar(req.validated.query as ListarUsuariosQuery));
  },

  async obter(req: Request, res: Response) {
    res.json(await usuarioService.obter(idDe(req)));
  },

  async criar(req: Request, res: Response) {
    res.status(201).json(await usuarioService.criar(req.body));
  },

  async atualizar(req: Request, res: Response) {
    res.json(await usuarioService.atualizar(idDe(req), req.body, usuarioAtual(req).id));
  },

  async alternarAtivo(req: Request, res: Response) {
    res.json(await usuarioService.alternarAtivo(idDe(req), usuarioAtual(req).id));
  },

  async excluir(req: Request, res: Response) {
    await usuarioService.excluir(idDe(req), usuarioAtual(req).id);
    res.status(204).end();
  },

  async importar(req: Request, res: Response) {
    res.status(201).json(await usuarioService.importarCSV(req.body.csv));
  },

  async atualizarPerfil(req: Request, res: Response) {
    res.json(await usuarioService.atualizarPerfil(usuarioAtual(req).id, req.body));
  },

  async alterarSenha(req: Request, res: Response) {
    await usuarioService.alterarSenha(usuarioAtual(req).id, req.body);
    res.status(204).end();
  },
};
