import type { Request, Response } from 'express';
import { relatorioService } from './relatorio.service.js';
import type { RelatorioOcupacaoQuery } from './relatorio.schemas.js';

export const relatorioController = {
  async ocupacao(req: Request, res: Response) {
    res.json(await relatorioService.ocupacao(req.validated.query as RelatorioOcupacaoQuery));
  },
};
