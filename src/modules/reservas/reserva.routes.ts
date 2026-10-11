import { Router } from 'express';
import { Role } from '@prisma/client';
import { authenticate, authorize } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { zIdParams } from '../../lib/zod.js';
import { reservaController } from './reserva.controller.js';
import {
  AprovarReservaSchema,
  CriarReservaSchema,
  DevolucaoSchema,
  DisponibilidadeQuerySchema,
  ListarReservasQuerySchema,
  RecusarReservaSchema,
} from './reserva.schemas.js';

export const reservaRoutes = Router();

reservaRoutes.use(authenticate);

const somenteAdmin = authorize(Role.ADMIN);

// Rotas estáticas antes de "/:id".
reservaRoutes.get('/', validate({ query: ListarReservasQuerySchema }), reservaController.listar);
reservaRoutes.get('/minhas', reservaController.minhas);
reservaRoutes.get('/disponibilidade', validate({ query: DisponibilidadeQuerySchema }), reservaController.disponibilidade);
reservaRoutes.post('/', validate({ body: CriarReservaSchema }), reservaController.criar);
reservaRoutes.get('/devolucoes-pendentes', somenteAdmin, reservaController.devolucoesPendentes);
reservaRoutes.post(
  '/devolucoes-pendentes/notificar',
  somenteAdmin,
  reservaController.notificarDevolucoesPendentes,
);

reservaRoutes.get('/:id', validate({ params: zIdParams }), reservaController.obter);
reservaRoutes.patch('/:id/cancelar', validate({ params: zIdParams }), reservaController.cancelar);
reservaRoutes.patch(
  '/:id/aprovar',
  somenteAdmin,
  validate({ params: zIdParams, body: AprovarReservaSchema }),
  reservaController.aprovar,
);
reservaRoutes.patch(
  '/:id/recusar',
  somenteAdmin,
  validate({ params: zIdParams, body: RecusarReservaSchema }),
  reservaController.recusar,
);
reservaRoutes.patch('/:id/retirada', somenteAdmin, validate({ params: zIdParams }), reservaController.retirada);
reservaRoutes.patch(
  '/:id/devolucao',
  somenteAdmin,
  validate({ params: zIdParams, body: DevolucaoSchema }),
  reservaController.devolucao,
);
