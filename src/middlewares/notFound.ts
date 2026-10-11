import type { Request } from 'express';
import { NotFoundError } from '../errors/index.js';

export function notFound(req: Request) {
  throw new NotFoundError(`Rota não encontrada: ${req.method} ${req.originalUrl}`, 'ROTA_NAO_ENCONTRADA');
}
