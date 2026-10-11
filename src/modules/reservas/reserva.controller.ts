import type { Request, Response } from 'express';
import { usuarioAtual } from '../../middlewares/auth.js';
import type { IdParams } from '../../lib/zod.js';
import { reservaService } from './reserva.service.js';
import type { DisponibilidadeQuery, ListarReservasQuery } from './reserva.schemas.js';

const idDe = (req: Request) => (req.validated.params as IdParams).id;

export const reservaController = {
  async listar(req: Request, res: Response) {
    res.json(await reservaService.listar(req.validated.query as ListarReservasQuery));
  },

  async minhas(req: Request, res: Response) {
    res.json(await reservaService.listarDoUsuario(usuarioAtual(req).id));
  },

  async disponibilidade(req: Request, res: Response) {
    res.json(
      await reservaService.verificarDisponibilidade(req.validated.query as DisponibilidadeQuery, usuarioAtual(req)),
    );
  },

  async obter(req: Request, res: Response) {
    res.json(await reservaService.obter(idDe(req)));
  },

  async criar(req: Request, res: Response) {
    res.status(201).json(await reservaService.criar(req.body, usuarioAtual(req)));
  },

  async aprovar(req: Request, res: Response) {
    res.json(await reservaService.aprovar(idDe(req), req.body));
  },

  async recusar(req: Request, res: Response) {
    res.json(await reservaService.recusar(idDe(req), req.body));
  },

  async cancelar(req: Request, res: Response) {
    res.json(await reservaService.cancelar(idDe(req), usuarioAtual(req)));
  },

  async retirada(req: Request, res: Response) {
    res.json(await reservaService.registrarRetirada(idDe(req)));
  },

  async devolucao(req: Request, res: Response) {
    res.json(await reservaService.registrarDevolucao(idDe(req), req.body));
  },
};
