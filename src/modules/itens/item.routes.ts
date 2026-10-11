import { Router } from 'express';
import { Role } from '@prisma/client';
import { authenticate, authorize } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { zIdParams } from '../../lib/zod.js';
import { itemController } from './item.controller.js';
import { ListarItensQuerySchema, SalvarItemSchema } from './item.schemas.js';

export const itemRoutes = Router();

itemRoutes.use(authenticate);

itemRoutes.get('/', validate({ query: ListarItensQuerySchema }), itemController.listar);
itemRoutes.get('/:id', validate({ params: zIdParams }), itemController.obter);

const somenteAdmin = authorize(Role.ADMIN);
itemRoutes.post('/', somenteAdmin, validate({ body: SalvarItemSchema }), itemController.criar);
itemRoutes.put('/:id', somenteAdmin, validate({ params: zIdParams, body: SalvarItemSchema }), itemController.atualizar);
itemRoutes.delete('/:id', somenteAdmin, validate({ params: zIdParams }), itemController.excluir);
