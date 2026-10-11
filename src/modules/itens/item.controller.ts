import type { Request, Response } from 'express';
import type { IdParams } from '../../lib/zod.js';
import { itemService } from './item.service.js';
import type { ListarItensQuery } from './item.schemas.js';

const idDe = (req: Request) => (req.validated.params as IdParams).id;

export const itemController = {
  async listar(req: Request, res: Response) {
    res.json(await itemService.listar(req.validated.query as ListarItensQuery));
  },

  async obter(req: Request, res: Response) {
    res.json(await itemService.obter(idDe(req)));
  },

  async criar(req: Request, res: Response) {
    res.status(201).json(await itemService.criar(req.body));
  },

  async atualizar(req: Request, res: Response) {
    res.json(await itemService.atualizar(idDe(req), req.body));
  },

  async excluir(req: Request, res: Response) {
    await itemService.excluir(idDe(req));
    res.status(204).end();
  },
};
