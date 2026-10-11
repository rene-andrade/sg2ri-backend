import { Router } from 'express';
import { Role } from '@prisma/client';
import { authenticate, authorize } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { relatorioController } from './relatorio.controller.js';
import { RelatorioOcupacaoQuerySchema } from './relatorio.schemas.js';

export const relatorioRoutes = Router();

relatorioRoutes.use(authenticate, authorize(Role.ADMIN));

relatorioRoutes.get('/ocupacao', validate({ query: RelatorioOcupacaoQuerySchema }), relatorioController.ocupacao);
