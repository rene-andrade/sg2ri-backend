import { Router } from 'express';
import { Role } from '@prisma/client';
import { authenticate, authorize } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { zIdParams } from '../../lib/zod.js';
import { usuarioController } from './usuario.controller.js';
import {
  AlterarSenhaSchema,
  AtualizarPerfilSchema,
  AtualizarUsuarioSchema,
  CriarUsuarioSchema,
  ImportarUsuariosSchema,
  ListarUsuariosQuerySchema,
} from './usuario.schemas.js';

export const usuarioRoutes = Router();

usuarioRoutes.use(authenticate);

// Perfil do próprio usuário (qualquer perfil) — declarado antes de "/:id".
usuarioRoutes.put('/me', validate({ body: AtualizarPerfilSchema }), usuarioController.atualizarPerfil);
usuarioRoutes.patch('/me/senha', validate({ body: AlterarSenhaSchema }), usuarioController.alterarSenha);

// Gestão de usuários (somente administradores).
usuarioRoutes.use(authorize(Role.ADMIN));

usuarioRoutes.get('/', validate({ query: ListarUsuariosQuerySchema }), usuarioController.listar);
usuarioRoutes.post('/', validate({ body: CriarUsuarioSchema }), usuarioController.criar);
usuarioRoutes.post('/importar', validate({ body: ImportarUsuariosSchema }), usuarioController.importar);
usuarioRoutes.get('/:id', validate({ params: zIdParams }), usuarioController.obter);
usuarioRoutes.put('/:id', validate({ params: zIdParams, body: AtualizarUsuarioSchema }), usuarioController.atualizar);
usuarioRoutes.patch('/:id/ativo', validate({ params: zIdParams }), usuarioController.alternarAtivo);
usuarioRoutes.delete('/:id', validate({ params: zIdParams }), usuarioController.excluir);
