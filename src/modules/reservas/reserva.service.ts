import { Role, StatusReserva, type Item, type Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../errors/index.js';
import { agoraNoFuso, dataISOParaDate, dateParaDataISO, minutosEntre } from '../../shared/datetime.js';
import { notificacaoService } from '../notificacoes/notificacao.service.js';
import { reservaInclude, toReservaDTO } from './reserva.mapper.js';
import {
  avaliarDisponibilidade,
  derivarTurno,
  filtrarConflitos,
  gerarCodigoReserva,
  sugerirHorarios,
  validarSolicitacao,
  type Intervalo,
} from './reserva.rules.js';
import type {
  AprovarReservaDTO,
  CriarReservaDTO,
  DevolucaoDTO,
  DisponibilidadeQuery,
  ListarReservasQuery,
  RecusarReservaDTO,
} from './reserva.schemas.js';

type Tx = Prisma.TransactionClient;
type Solicitante = Express.AuthenticatedUser;

const MOTIVO_RECUSA_RN02 = 'Recusada automaticamente: prioridade docente (RN02).';

/**
 * Serializa operações que disputam o mesmo item/data (criação e aprovação),
 * evitando que duas transações concorrentes aprovem horários sobrepostos.
 */
async function bloquearAgenda(tx: Tx, itemId: string, data: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${itemId}:${data}`}))`;
}

/** Reservas que ocupam a agenda (PENDENTE/APROVADA) do item na data. */
async function buscarOcupacaoDoDia(db: Tx | typeof prisma, itemId: string, data: string, ignorarId?: string) {
  return db.reserva.findMany({
    where: {
      itemId,
      data: dataISOParaDate(data),
      status: { in: [StatusReserva.PENDENTE, StatusReserva.APROVADA] },
      ...(ignorarId ? { id: { not: ignorarId } } : {}),
    },
    include: reservaInclude,
    orderBy: { horaInicio: 'asc' },
  });
}

/** Reservas que ocupam o horário (PENDENTE/APROVADA) do mesmo item e data. */
async function buscarConflitos(
  db: Tx | typeof prisma,
  itemId: string,
  data: string,
  intervalo: Intervalo,
  ignorarId?: string,
) {
  return filtrarConflitos(await buscarOcupacaoDoDia(db, itemId, data, ignorarId), intervalo);
}

/** Fluxo 4a: horários livres no mesmo dia que também passariam nas demais regras do pedido. */
function sugestoesPara(
  ocupadas: Awaited<ReturnType<typeof buscarOcupacaoDoDia>>,
  item: Item,
  pedido: { data: string; horaInicio: string; horaFim: string; quantidadePessoas?: number | null },
  solicitante: Solicitante,
) {
  const agora = agoraNoFuso(env.APP_TIMEZONE);
  return sugerirHorarios({
    intervalo: pedido,
    ocupadas,
    aceitar: (candidato) => {
      try {
        validarSolicitacao({
          role: solicitante.role,
          tipoItem: item.tipo,
          statusItem: item.status,
          capacidadeItem: item.capacidade,
          data: pedido.data,
          quantidadePessoas: pedido.quantidadePessoas,
          agora,
          ...candidato,
        });
        return true;
      } catch {
        return false;
      }
    },
  });
}

async function buscarOuFalhar(db: Tx | typeof prisma, id: string) {
  const reserva = await db.reserva.findUnique({ where: { id }, include: reservaInclude });
  if (!reserva) throw new NotFoundError('Reserva não encontrada.');
  return reserva;
}

function exigirStatus(atual: StatusReserva, esperado: StatusReserva, acao: string) {
  if (atual !== esperado) {
    throw new BusinessRuleError(
      `Não é possível ${acao} uma reserva com status ${atual}. Status exigido: ${esperado}.`,
      'TRANSICAO_INVALIDA',
    );
  }
}

export const reservaService = {
  async listar(filtros: ListarReservasQuery) {
    const data: Prisma.DateTimeFilter = {};
    if (filtros.data) data.equals = dataISOParaDate(filtros.data);
    if (filtros.dataInicio) data.gte = dataISOParaDate(filtros.dataInicio);
    if (filtros.dataFim) data.lte = dataISOParaDate(filtros.dataFim);

    const reservas = await prisma.reserva.findMany({
      where: {
        status: filtros.status,
        itemId: filtros.itemId,
        ...(Object.keys(data).length > 0 ? { data } : {}),
      },
      include: reservaInclude,
      orderBy: [{ data: 'desc' }, { horaInicio: 'asc' }],
    });
    return reservas.map(toReservaDTO);
  },

  async listarDoUsuario(usuarioId: string) {
    const reservas = await prisma.reserva.findMany({
      where: { usuarioId },
      include: reservaInclude,
      orderBy: [{ data: 'desc' }, { horaInicio: 'asc' }],
    });
    return reservas.map(toReservaDTO);
  },

  async obter(id: string) {
    return toReservaDTO(await buscarOuFalhar(prisma, id));
  },

  async verificarDisponibilidade(query: DisponibilidadeQuery, solicitante: Solicitante) {
    const item = await prisma.item.findUnique({ where: { id: query.itemId } });
    if (!item) throw new NotFoundError('Item não encontrado.');

    const ocupadas = await buscarOcupacaoDoDia(prisma, query.itemId, query.data);
    const conflitos = filtrarConflitos(ocupadas, query);
    const status = avaliarDisponibilidade({
      role: solicitante.role,
      tipoItem: item.tipo,
      conflitos: conflitos.map((c) => ({ status: c.status, usuarioRole: c.usuario.role })),
    });
    const sugestoes = status === 'unavailable' ? sugestoesPara(ocupadas, item, query, solicitante) : [];
    return { status, conflitos: conflitos.map(toReservaDTO), sugestoes };
  },

  async criar(dados: CriarReservaDTO, solicitante: Solicitante) {
    const reserva = await prisma.$transaction(async (tx) => {
      await bloquearAgenda(tx, dados.itemId, dados.data);

      const item = await tx.item.findUnique({ where: { id: dados.itemId } });
      if (!item) throw new NotFoundError('Item não encontrado.');

      validarSolicitacao({
        role: solicitante.role,
        tipoItem: item.tipo,
        statusItem: item.status,
        capacidadeItem: item.capacidade,
        data: dados.data,
        horaInicio: dados.horaInicio,
        horaFim: dados.horaFim,
        quantidadePessoas: dados.quantidadePessoas,
        agora: agoraNoFuso(env.APP_TIMEZONE),
      });

      const ocupadas = await buscarOcupacaoDoDia(tx, dados.itemId, dados.data);
      const conflitos = filtrarConflitos(ocupadas, dados);
      const disponibilidade = avaliarDisponibilidade({
        role: solicitante.role,
        tipoItem: item.tipo,
        conflitos: conflitos.map((c) => ({ status: c.status, usuarioRole: c.usuario.role })),
      });
      if (disponibilidade === 'unavailable') {
        throw new ConflictError(
          'O recurso não está disponível no horário selecionado. Ajuste a data ou o horário.',
          'CONFLITO_HORARIO',
          {
            conflitos: conflitos.map((c) => ({ codigo: c.codigo, horario: `${c.horaInicio} - ${c.horaFim}`, status: c.status })),
            sugestoes: sugestoesPara(ocupadas, item, dados, solicitante),
          },
        );
      }

      return tx.reserva.create({
        data: {
          codigo: gerarCodigoReserva(dados.data),
          itemId: item.id,
          usuarioId: solicitante.id,
          data: dataISOParaDate(dados.data),
          horaInicio: dados.horaInicio,
          horaFim: dados.horaFim,
          turno: derivarTurno(dados.horaInicio),
          finalidade: dados.finalidade,
          quantidadePessoas: dados.quantidadePessoas ?? null,
          prioridadeDocente: disponibilidade === 'priority',
        },
        include: reservaInclude,
      });
    });
    const dto = toReservaDTO(reserva);
    notificacaoService.reservaSolicitada(dto);
    return dto;
  },

  async aprovar(id: string, { observacaoAdmin }: AprovarReservaDTO) {
    let recusadasPorPrioridade: string[] = [];
    const reserva = await prisma.$transaction(async (tx) => {
      const atual = await buscarOuFalhar(tx, id);
      const data = dateParaDataISO(atual.data);
      await bloquearAgenda(tx, atual.itemId, data);

      // Relê após obter o lock: outra transação pode ter alterado o status.
      const reserva = await buscarOuFalhar(tx, id);
      exigirStatus(reserva.status, StatusReserva.PENDENTE, 'aprovar');

      const conflitos = await buscarConflitos(tx, reserva.itemId, data, reserva, reserva.id);
      const aprovadas = conflitos.filter((c) => c.status === StatusReserva.APROVADA);
      if (aprovadas.length > 0) {
        throw new ConflictError(
          'Já existe uma reserva aprovada para este recurso no mesmo horário.',
          'CONFLITO_HORARIO',
          { conflitos: aprovadas.map((c) => ({ codigo: c.codigo, horario: `${c.horaInicio} - ${c.horaFim}` })) },
        );
      }

      // RN02: ao aprovar o pedido prioritário de um professor, os pedidos pendentes
      // de alunos que disputavam o mesmo horário são recusados automaticamente.
      if (reserva.prioridadeDocente) {
        const pendentesDeAlunos = conflitos
          .filter((c) => c.status === StatusReserva.PENDENTE && c.usuario.role === Role.ALUNO)
          .map((c) => c.id);
        if (pendentesDeAlunos.length > 0) {
          await tx.reserva.updateMany({
            where: { id: { in: pendentesDeAlunos } },
            data: { status: StatusReserva.RECUSADA, observacaoAdmin: MOTIVO_RECUSA_RN02 },
          });
          recusadasPorPrioridade = pendentesDeAlunos;
        }
      }

      return tx.reserva.update({
        where: { id },
        data: {
          status: StatusReserva.APROVADA,
          observacaoAdmin: observacaoAdmin || 'Aprovado pela administração.',
        },
        include: reservaInclude,
      });
    });
    const dto = toReservaDTO(reserva);
    notificacaoService.parecerReserva(dto);
    if (recusadasPorPrioridade.length > 0) {
      const recusadas = await prisma.reserva.findMany({
        where: { id: { in: recusadasPorPrioridade } },
        include: reservaInclude,
      });
      for (const r of recusadas) notificacaoService.parecerReserva(toReservaDTO(r));
    }
    return dto;
  },

  async recusar(id: string, { motivoRecusa }: RecusarReservaDTO) {
    const atual = await buscarOuFalhar(prisma, id);
    exigirStatus(atual.status, StatusReserva.PENDENTE, 'recusar');
    const reserva = await prisma.reserva.update({
      where: { id },
      data: {
        status: StatusReserva.RECUSADA,
        observacaoAdmin: motivoRecusa || 'Solicitação recusada pela administração.',
      },
      include: reservaInclude,
    });
    const dto = toReservaDTO(reserva);
    notificacaoService.parecerReserva(dto);
    return dto;
  },

  async cancelar(id: string, solicitante: Solicitante) {
    const atual = await buscarOuFalhar(prisma, id);
    if (atual.usuarioId !== solicitante.id && solicitante.role !== Role.ADMIN) {
      throw new ForbiddenError('Você só pode cancelar as suas próprias reservas.');
    }
    exigirStatus(atual.status, StatusReserva.PENDENTE, 'cancelar');
    const reserva = await prisma.reserva.update({
      where: { id },
      data: { status: StatusReserva.CANCELADA },
      include: reservaInclude,
    });
    return toReservaDTO(reserva);
  },

  /** Reservas retiradas (check-in) cujo período terminou sem devolução registrada. */
  async listarDevolucoesPendentes() {
    const agora = agoraNoFuso(env.APP_TIMEZONE);
    const emUso = await prisma.reserva.findMany({
      where: {
        status: StatusReserva.APROVADA,
        retiradoEm: { not: null },
        devolvidoEm: null,
        data: { lte: dataISOParaDate(agora.data) },
      },
      include: reservaInclude,
      orderBy: [{ data: 'asc' }, { horaFim: 'asc' }],
    });
    return emUso
      .filter((r) => minutosEntre(agora, { data: dateParaDataISO(r.data), hora: r.horaFim }) < 0)
      .map(toReservaDTO);
  },

  /** RF06: envia o alerta de devolução pendente a cada responsável. */
  async notificarDevolucoesPendentes() {
    const pendentes = await reservaService.listarDevolucoesPendentes();
    const resultados = await Promise.allSettled(pendentes.map((r) => notificacaoService.devolucaoPendente(r)));
    const falhas = resultados.filter((r) => r.status === 'rejected');
    for (const f of falhas) console.error('[e-mail] falha ao notificar devolução pendente:', f.reason);
    return { total: pendentes.length, enviadas: pendentes.length - falhas.length, falhas: falhas.length };
  },

  /** Check-in: registra a retirada/início de uso de uma reserva aprovada. */
  async registrarRetirada(id: string) {
    const atual = await buscarOuFalhar(prisma, id);
    exigirStatus(atual.status, StatusReserva.APROVADA, 'registrar a retirada de');
    if (atual.retiradoEm) {
      throw new BusinessRuleError('A retirada desta reserva já foi registrada.', 'RETIRADA_JA_REGISTRADA');
    }
    const reserva = await prisma.reserva.update({
      where: { id },
      data: { retiradoEm: new Date() },
      include: reservaInclude,
    });
    return toReservaDTO(reserva);
  },

  /** Check-out: registra a devolução e a condição do recurso. */
  async registrarDevolucao(id: string, { condicao, observacao }: DevolucaoDTO) {
    const atual = await buscarOuFalhar(prisma, id);
    if (!atual.retiradoEm) {
      throw new BusinessRuleError(
        'Não é possível registrar a devolução antes do check-in (retirada).',
        'RETIRADA_NAO_REGISTRADA',
      );
    }
    if (atual.devolvidoEm) {
      throw new BusinessRuleError('A devolução desta reserva já foi registrada.', 'DEVOLUCAO_JA_REGISTRADA');
    }
    const reserva = await prisma.reserva.update({
      where: { id },
      data: { devolvidoEm: new Date(), condicaoDevolucao: condicao, observacaoDevolucao: observacao || null },
      include: reservaInclude,
    });
    return toReservaDTO(reserva);
  },
};
