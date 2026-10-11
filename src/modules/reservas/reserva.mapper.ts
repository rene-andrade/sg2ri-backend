import type { Prisma } from '@prisma/client';
import { dateParaDataISO } from '../../shared/datetime.js';
import type { ReservaDTO } from './reserva.schemas.js';

/** Relações carregadas junto da reserva para compor o DTO. */
export const reservaInclude = {
  item: { select: { nome: true, tipo: true } },
  usuario: { select: { name: true, role: true } },
} satisfies Prisma.ReservaInclude;

export type ReservaComRelacoes = Prisma.ReservaGetPayload<{ include: typeof reservaInclude }>;

/** DTO com os campos "achatados" que o frontend consome (itemNome, usuarioRole, horario...). */
export function toReservaDTO(r: ReservaComRelacoes): ReservaDTO {
  return {
    id: r.id,
    codigo: r.codigo,
    itemId: r.itemId,
    itemNome: r.item.nome,
    itemTipo: r.item.tipo,
    usuarioId: r.usuarioId,
    usuarioNome: r.usuario.name,
    usuarioRole: r.usuario.role,
    data: dateParaDataISO(r.data),
    turno: r.turno,
    horaInicio: r.horaInicio,
    horaFim: r.horaFim,
    horario: `${r.horaInicio} - ${r.horaFim}`,
    finalidade: r.finalidade,
    quantidadePessoas: r.quantidadePessoas,
    status: r.status,
    prioridadeDocente: r.prioridadeDocente,
    observacaoAdmin: r.observacaoAdmin,
    retiradoEm: r.retiradoEm?.toISOString() ?? null,
    devolvidoEm: r.devolvidoEm?.toISOString() ?? null,
    condicaoDevolucao: r.condicaoDevolucao,
    observacaoDevolucao: r.observacaoDevolucao,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
