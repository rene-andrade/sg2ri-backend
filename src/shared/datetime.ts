/**
 * Helpers de data/hora. Datas de calendário trafegam como "YYYY-MM-DD" e horários
 * como "HH:mm"; nada aqui depende do fuso do servidor, exceto agoraNoFuso().
 */

export const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface MomentoLocal {
  data: string; // YYYY-MM-DD
  hora: string; // HH:mm
}

export function horaParaMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return Number.NaN;
  return h * 60 + m;
}

/** "YYYY-MM-DD" → Date em UTC meia-noite (formato usado pelas colunas @db.Date). */
export function dataISOParaDate(dataISO: string): Date {
  return new Date(`${dataISO}T00:00:00.000Z`);
}

/** Date vinda de coluna @db.Date → "YYYY-MM-DD". */
export function dateParaDataISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Valida formato e existência da data (rejeita 2026-02-30). */
export function isDataValida(dataISO: string): boolean {
  if (!DATA_REGEX.test(dataISO)) return false;
  const d = dataISOParaDate(dataISO);
  return !Number.isNaN(d.getTime()) && dateParaDataISO(d) === dataISO;
}

/** Diferença em dias de calendário entre duas datas "YYYY-MM-DD" (b - a). */
export function diferencaEmDias(a: string, b: string): number {
  return Math.round((dataISOParaDate(b).getTime() - dataISOParaDate(a).getTime()) / 86_400_000);
}

/** Minutos entre dois momentos locais (destino - origem). */
export function minutosEntre(origem: MomentoLocal, destino: MomentoLocal): number {
  return (
    diferencaEmDias(origem.data, destino.data) * 1440 +
    horaParaMinutos(destino.hora) -
    horaParaMinutos(origem.hora)
  );
}

/** Data e hora atuais no fuso da instituição (ex.: America/Sao_Paulo). */
export function agoraNoFuso(timeZone: string, agora: Date = new Date()): MomentoLocal {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(agora);
  const get = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '00';
  return { data: `${get('year')}-${get('month')}-${get('day')}`, hora: `${get('hour')}:${get('minute')}` };
}

/** Conta dias úteis (seg–sex) entre duas datas, inclusive. */
export function contarDiasUteis(inicioISO: string, fimISO: string): number {
  const cursor = dataISOParaDate(inicioISO);
  const fim = dataISOParaDate(fimISO);
  let count = 0;
  while (cursor <= fim) {
    const diaSemana = cursor.getUTCDay();
    if (diaSemana !== 0 && diaSemana !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

/** Duração em horas entre dois horários "HH:mm" (0 se inválido ou negativo). */
export function duracaoEmHoras(inicio: string, fim: string): number {
  const minutos = horaParaMinutos(fim) - horaParaMinutos(inicio);
  return Number.isNaN(minutos) ? 0 : Math.max(0, minutos / 60);
}

/** Duração em horas de um intervalo "HH:mm - HH:mm" (0 se inválido). */
export function duracaoHorario(horario: string): number {
  const [inicio, fim] = horario.split(' - ').map((s) => s.trim());
  if (!inicio || !fim) return 0;
  return duracaoEmHoras(inicio, fim);
}
