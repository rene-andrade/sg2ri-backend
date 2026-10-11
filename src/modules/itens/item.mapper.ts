import type { Item } from '@prisma/client';
import type { ItemDTO } from './item.schemas.js';

export function toItemDTO(item: Item): ItemDTO {
  return {
    id: item.id,
    nome: item.nome,
    tipo: item.tipo,
    capacidade: item.capacidade,
    localizacao: item.localizacao,
    descricao: item.descricao,
    status: item.status,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}
