import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { ConflictError, NotFoundError } from '../../errors/index.js';
import { toItemDTO } from './item.mapper.js';
import type { ListarItensQuery, SalvarItemDTO } from './item.schemas.js';

async function buscarOuFalhar(id: number) {
  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) throw new NotFoundError('Item não encontrado.');
  return item;
}

export const itemService = {
  async listar(filtros: ListarItensQuery) {
    const where: Prisma.ItemWhereInput = { tipo: filtros.tipo, status: filtros.status };
    if (filtros.search) {
      where.OR = [
        { nome: { contains: filtros.search, mode: 'insensitive' } },
        { localizacao: { contains: filtros.search, mode: 'insensitive' } },
      ];
    }
    const itens = await prisma.item.findMany({ where, orderBy: { nome: 'asc' } });
    return itens.map(toItemDTO);
  },

  async obter(id: number) {
    return toItemDTO(await buscarOuFalhar(id));
  },

  async criar(dados: SalvarItemDTO) {
    return toItemDTO(await prisma.item.create({ data: dados }));
  },

  async atualizar(id: number, dados: SalvarItemDTO) {
    await buscarOuFalhar(id);
    return toItemDTO(await prisma.item.update({ where: { id }, data: dados }));
  },

  async excluir(id: number) {
    await buscarOuFalhar(id);
    const reservas = await prisma.reserva.count({ where: { itemId: id } });
    if (reservas > 0) {
      throw new ConflictError(
        'Este item possui reservas registradas e não pode ser excluído. Altere o status para INATIVO.',
        'ITEM_COM_RESERVAS',
      );
    }
    await prisma.item.delete({ where: { id } });
  },
};
