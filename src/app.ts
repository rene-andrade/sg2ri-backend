import express, { Router } from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { buildOpenApiDocument } from './docs/openapi.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { notFound } from './middlewares/notFound.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { usuarioRoutes } from './modules/usuarios/usuario.routes.js';
import { itemRoutes } from './modules/itens/item.routes.js';
import { reservaRoutes } from './modules/reservas/reserva.routes.js';
import { relatorioRoutes } from './modules/relatorios/relatorio.routes.js';

export function createApp() {
  const app = express();
  const openApiDocument = buildOpenApiDocument();

  app.disable('x-powered-by');
  app.use(cors({ origin: env.corsOrigins }));
  // Limite folgado para comportar a foto de perfil (data URL) e CSVs de importação.
  app.use(express.json({ limit: '5mb' }));
  app.use((req, _res, next) => {
    req.validated = {};
    next();
  });

  const api = Router();
  api.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  api.get('/docs.json', (_req, res) => {
    res.json(openApiDocument);
  });
  api.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, { customSiteTitle: 'SG2RI API' }));

  api.use('/auth', authRoutes);
  api.use('/usuarios', usuarioRoutes);
  api.use('/itens', itemRoutes);
  api.use('/reservas', reservaRoutes);
  api.use('/relatorios', relatorioRoutes);

  app.use('/api', api);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
