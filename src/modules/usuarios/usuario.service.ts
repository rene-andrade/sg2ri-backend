import bcrypt from 'bcryptjs';
import { Role, type Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '../../errors/index.js';
import { toUsuarioDTO } from './usuario.mapper.js';
import { interpretarUsuariosCSV } from './usuario.csv.js';
import type {
  AlterarSenhaDTO,
  AtualizarPerfilDTO,
  AtualizarUsuarioDTO,
  CriarUsuarioDTO,
  ListarUsuariosQuery,
} from './usuario.schemas.js';

const BCRYPT_ROUNDS = 10;

export const hashSenha = (senha: string) => bcrypt.hash(senha, BCRYPT_ROUNDS);

async function buscarOuFalhar(id: string) {
  const usuario = await prisma.usuario.findUnique({ where: { id } });
  if (!usuario) throw new NotFoundError('Usuário não encontrado.');
  return usuario;
}

async function garantirEmailDisponivel(email: string, ignorarId?: string) {
  const existente = await prisma.usuario.findUnique({ where: { email }, select: { id: true } });
  if (existente && existente.id !== ignorarId) {
    throw new ConflictError(
      ignorarId ? `O e-mail "${email}" já está em uso por outro usuário.` : `O e-mail "${email}" já está cadastrado.`,
      'EMAIL_DUPLICADO',
    );
  }
}

export const usuarioService = {
  async listar(filtros: ListarUsuariosQuery) {
    const where: Prisma.UsuarioWhereInput = {
      role: filtros.role,
      ativo: filtros.ativo,
    };
    if (filtros.search) {
      where.OR = [
        { name: { contains: filtros.search, mode: 'insensitive' } },
        { email: { contains: filtros.search, mode: 'insensitive' } },
        { matricula: { contains: filtros.search, mode: 'insensitive' } },
      ];
    }
    const usuarios = await prisma.usuario.findMany({ where, orderBy: { name: 'asc' } });
    return usuarios.map(toUsuarioDTO);
  },

  async obter(id: string) {
    return toUsuarioDTO(await buscarOuFalhar(id));
  },

  async criar(dados: CriarUsuarioDTO) {
    await garantirEmailDisponivel(dados.email);
    const { senha, ...resto } = dados;
    const usuario = await prisma.usuario.create({
      data: { ...resto, senhaHash: await hashSenha(senha) },
    });
    return toUsuarioDTO(usuario);
  },

  async atualizar(id: string, dados: AtualizarUsuarioDTO, solicitanteId: string) {
    const atual = await buscarOuFalhar(id);
    if (id === solicitanteId && atual.role === Role.ADMIN && dados.role !== Role.ADMIN) {
      throw new BusinessRuleError('Você não pode remover o seu próprio perfil de administrador.', 'AUTO_REBAIXAMENTO');
    }
    await garantirEmailDisponivel(dados.email, id);

    const { senha, ...resto } = dados;
    const usuario = await prisma.usuario.update({
      where: { id },
      data: { ...resto, ...(senha ? { senhaHash: await hashSenha(senha) } : {}) },
    });
    return toUsuarioDTO(usuario);
  },

  async alternarAtivo(id: string, solicitanteId: string) {
    if (id === solicitanteId) {
      throw new BusinessRuleError('Você não pode inativar a sua própria conta.', 'AUTO_INATIVACAO');
    }
    const atual = await buscarOuFalhar(id);
    const usuario = await prisma.usuario.update({ where: { id }, data: { ativo: !atual.ativo } });
    return toUsuarioDTO(usuario);
  },

  async excluir(id: string, solicitanteId: string) {
    if (id === solicitanteId) {
      throw new BusinessRuleError('Você não pode excluir a sua própria conta.', 'AUTO_EXCLUSAO');
    }
    await buscarOuFalhar(id);
    const reservas = await prisma.reserva.count({ where: { usuarioId: id } });
    if (reservas > 0) {
      throw new ConflictError(
        'Este usuário possui reservas registradas e não pode ser excluído. Inative a conta em vez disso.',
        'USUARIO_COM_RESERVAS',
      );
    }
    await prisma.usuario.delete({ where: { id } });
  },

  async importarCSV(csv: string) {
    const existentes = await prisma.usuario.findMany({ select: { email: true } });
    const { validos, errors } = interpretarUsuariosCSV(csv, new Set(existentes.map((u) => u.email)));

    const dados = await Promise.all(
      validos.map(async ({ linha: _linha, senha, ...resto }) => ({ ...resto, senhaHash: await hashSenha(senha) })),
    );
    const imported = await prisma.$transaction(dados.map((data) => prisma.usuario.create({ data })));

    return { imported: imported.map(toUsuarioDTO), errors };
  },

  async atualizarPerfil(id: string, dados: AtualizarPerfilDTO) {
    await buscarOuFalhar(id);
    await garantirEmailDisponivel(dados.email, id);
    const usuario = await prisma.usuario.update({
      where: { id },
      data: {
        name: dados.name,
        email: dados.email,
        matricula: dados.matricula,
        ...(dados.department !== undefined ? { department: dados.department } : {}),
        ...(dados.avatarUrl !== undefined ? { avatarUrl: dados.avatarUrl } : {}),
      },
    });
    return toUsuarioDTO(usuario);
  },

  async alterarSenha(id: string, { senhaAtual, novaSenha }: AlterarSenhaDTO) {
    const usuario = await buscarOuFalhar(id);
    if (!(await bcrypt.compare(senhaAtual, usuario.senhaHash))) {
      // 422 (e não 401): o frontend encerra a sessão ao receber qualquer 401.
      throw new BusinessRuleError('A senha atual está incorreta.', 'SENHA_ATUAL_INCORRETA');
    }
    await prisma.usuario.update({ where: { id }, data: { senhaHash: await hashSenha(novaSenha) } });
  },
};
