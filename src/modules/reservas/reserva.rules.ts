/**
 * Regras de negócio de reservas, como funções puras (sem acesso a banco),
 * para serem reaproveitadas pelo service e testadas isoladamente.
 */
import { randomBytes } from 'node:crypto';
import { Role, StatusItem, StatusReserva, TipoItem, Turno } from '@prisma/client';
import { BusinessRuleError } from '../../errors/index.js';
import {
  ANTECEDENCIA_MIN_EQUIPAMENTO_HORAS,
  HORARIOS_PADRAO,
  RN01_MAX_HORAS_ALUNO_SALA,
} from '../../shared/constants.js';
import {
  duracaoEmHoras,
  horaParaMinutos,
  minutosEntre,
  minutosParaHora,
  type MomentoLocal,
} from '../../shared/datetime.js';

export type StatusDisponibilidade = 'available' | 'priority' | 'unavailable';

export interface Intervalo {
  horaInicio: string;
  horaFim: string;
}

export interface ReservaExistente extends Intervalo {
  status: StatusReserva;
  usuarioRole: Role;
}

/** Turno derivado do horário de início (mesma regra do NovaReserva.jsx). */
export function derivarTurno(horaInicio: string): Turno {
  if (horaInicio < '12:00') return Turno.MANHA;
  if (horaInicio < '18:00') return Turno.TARDE;
  return Turno.NOITE;
}

/** Dois intervalos [ini, fim) se sobrepõem quando ini < outroFim && fim > outroIni. */
export function intervalosSobrepoem(a: Intervalo, b: Intervalo): boolean {
  return (
    horaParaMinutos(a.horaInicio) < horaParaMinutos(b.horaFim) &&
    horaParaMinutos(a.horaFim) > horaParaMinutos(b.horaInicio)
  );
}

/** Reservas canceladas ou recusadas liberam o horário. */
export function ocupaHorario(status: StatusReserva): boolean {
  return status === StatusReserva.PENDENTE || status === StatusReserva.APROVADA;
}

/** Filtra, entre reservas do mesmo item e data, as que conflitam com o intervalo. */
export function filtrarConflitos<T extends Intervalo & { status: StatusReserva }>(
  reservas: T[],
  intervalo: Intervalo,
): T[] {
  return reservas.filter((r) => ocupaHorario(r.status) && intervalosSobrepoem(intervalo, r));
}

/**
 * Classifica a disponibilidade dado o conjunto de conflitos.
 * RN02: professores têm prioridade sobre alunos em equipamentos — o pedido do
 * professor segue possível se TODOS os conflitos forem pedidos PENDENTES de alunos
 * (uma reserva já aprovada não é reaberta).
 */
export function avaliarDisponibilidade(params: {
  role: Role;
  tipoItem: TipoItem;
  conflitos: Pick<ReservaExistente, 'status' | 'usuarioRole'>[];
}): StatusDisponibilidade {
  const { role, tipoItem, conflitos } = params;
  if (conflitos.length === 0) return 'available';

  const prioridadeDocente =
    tipoItem === TipoItem.EQUIPAMENTO &&
    role === Role.PROFESSOR &&
    conflitos.every((r) => r.status === StatusReserva.PENDENTE && r.usuarioRole === Role.ALUNO);

  return prioridadeDocente ? 'priority' : 'unavailable';
}

/**
 * Caso de uso "Efetuar Reserva", fluxo 4a: sugere horários livres próximos ao pedido.
 * Candidatos são os inícios da grade padrão, com a mesma duração do pedido, que não
 * ultrapassam o fim da grade nem conflitam com as reservas que ocupam o dia.
 * O filtro `aceitar` permite ao chamador descartar horários que violem outras regras
 * (horário passado, antecedência). Ordenados pela proximidade com o início pedido.
 */
export function sugerirHorarios(params: {
  intervalo: Intervalo;
  ocupadas: (Intervalo & { status: StatusReserva })[];
  aceitar?: (candidato: Intervalo) => boolean;
  limite?: number;
}): Intervalo[] {
  const { intervalo, ocupadas, aceitar = () => true, limite = 3 } = params;
  const inicioPedido = horaParaMinutos(intervalo.horaInicio);
  const duracao = horaParaMinutos(intervalo.horaFim) - inicioPedido;
  const fimDaGrade = Math.max(...HORARIOS_PADRAO.map((h) => horaParaMinutos(h.split(' - ')[1]!)));

  return HORARIOS_PADRAO.map((h) => horaParaMinutos(h.split(' - ')[0]!))
    .filter((inicio) => inicio !== inicioPedido && inicio + duracao <= fimDaGrade)
    .map((inicio) => ({ horaInicio: minutosParaHora(inicio), horaFim: minutosParaHora(inicio + duracao) }))
    .filter((candidato) => filtrarConflitos(ocupadas, candidato).length === 0 && aceitar(candidato))
    .sort(
      (a, b) =>
        Math.abs(horaParaMinutos(a.horaInicio) - inicioPedido) - Math.abs(horaParaMinutos(b.horaInicio) - inicioPedido),
    )
    .slice(0, limite);
}

/**
 * Valida uma nova solicitação contra as regras que não dependem de outras reservas.
 * Lança BusinessRuleError na primeira violação encontrada.
 */
export function validarSolicitacao(params: {
  role: Role;
  tipoItem: TipoItem;
  statusItem: StatusItem;
  capacidadeItem: number;
  data: string;
  horaInicio: string;
  horaFim: string;
  quantidadePessoas?: number | null;
  agora: MomentoLocal;
}): void {
  const { role, tipoItem, statusItem, capacidadeItem, data, horaInicio, horaFim, quantidadePessoas, agora } = params;

  if (statusItem !== StatusItem.ATIVO) {
    throw new BusinessRuleError(
      'Este recurso não está disponível para reserva (em manutenção ou inativo).',
      'ITEM_INDISPONIVEL',
    );
  }

  if (horaParaMinutos(horaFim) <= horaParaMinutos(horaInicio)) {
    throw new BusinessRuleError('O horário de fim deve ser posterior ao horário de início.', 'HORARIO_INVALIDO');
  }

  const minutosAteInicio = minutosEntre(agora, { data, hora: horaInicio });
  if (minutosAteInicio < 0) {
    throw new BusinessRuleError('Não é possível reservar uma data ou horário que já passou.', 'DATA_PASSADA');
  }

  if (tipoItem === TipoItem.EQUIPAMENTO && minutosAteInicio < ANTECEDENCIA_MIN_EQUIPAMENTO_HORAS * 60) {
    throw new BusinessRuleError(
      `Reservas de equipamentos eletrônicos exigem no mínimo ${ANTECEDENCIA_MIN_EQUIPAMENTO_HORAS} horas de antecedência.`,
      'ANTECEDENCIA_24H',
    );
  }

  // RN01: alunos só podem reservar salas de estudo por no máximo 2 horas consecutivas.
  if (
    tipoItem === TipoItem.SALA &&
    role === Role.ALUNO &&
    duracaoEmHoras(horaInicio, horaFim) > RN01_MAX_HORAS_ALUNO_SALA
  ) {
    throw new BusinessRuleError(
      `Alunos podem reservar salas de estudo por no máximo ${RN01_MAX_HORAS_ALUNO_SALA} horas consecutivas.`,
      'RN01',
    );
  }

  if (quantidadePessoas != null && quantidadePessoas > capacidadeItem) {
    throw new BusinessRuleError(
      `A quantidade de pessoas (${quantidadePessoas}) excede a capacidade do recurso (${capacidadeItem}).`,
      'CAPACIDADE_EXCEDIDA',
    );
  }
}

/** Identificador legível e único por reserva, ex.: RES-20260910-3F9A1C2B. */
export function gerarCodigoReserva(data: string): string {
  return `RES-${data.replaceAll('-', '')}-${randomBytes(4).toString('hex').toUpperCase()}`;
}
