import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma.js';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../../errors/index.js';
import { toUsuarioDTO } from '../usuarios/usuario.mapper.js';
import { gerarToken } from './token.js';
import type { LoginDTO } from './auth.schemas.js';

// Hash fictício usado quando o e-mail não existe, para que o tempo de resposta
// não revele quais contas estão cadastradas.
const HASH_FICTICIO = bcrypt.hashSync('senha-inexistente', 10);

export const authService = {
  async login({ email, password }: LoginDTO) {
    const usuario = await prisma.usuario.findUnique({ where: { email } });
    const senhaConfere = await bcrypt.compare(password, usuario?.senhaHash ?? HASH_FICTICIO);

    if (!usuario || !senhaConfere) {
      throw new UnauthorizedError('Credenciais inválidas.', 'CREDENCIAIS_INVALIDAS');
    }
    // Só revela que a conta está inativa depois de a senha estar correta.
    if (!usuario.ativo) {
      throw new ForbiddenError('Sua conta está inativa. Procure um administrador do sistema.', 'CONTA_INATIVA');
    }

    return { user: toUsuarioDTO(usuario), token: gerarToken(usuario) };
  },

  async me(usuarioId: string) {
    const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario) throw new NotFoundError('Usuário não encontrado.');
    return toUsuarioDTO(usuario);
  },
};
