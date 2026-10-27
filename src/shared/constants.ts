/**
 * Constantes de domínio espelhando src/utils/constants.js do frontend.
 * Os enums vêm do Prisma (@prisma/client) para manter uma fonte única.
 */
import { CondicaoItem, Role, StatusItem, StatusReserva, TipoItem, Turno } from '@prisma/client';

export { CondicaoItem, Role, StatusItem, StatusReserva, TipoItem, Turno };

/** Grade de horários padrão da instituição — base da carga horária teórica dos relatórios. */
export const HORARIOS_PADRAO = [
  '07:30 - 09:10',
  '09:20 - 11:00',
  '11:10 - 12:50',
  '13:30 - 15:10',
  '15:20 - 17:00',
  '17:10 - 18:50',
  '19:00 - 20:40',
  '20:50 - 22:30',
] as const;

/** Duração máxima (horas) de reserva de sala por aluno — RN01. */
export const RN01_MAX_HORAS_ALUNO_SALA = 2;

/** Antecedência mínima (horas) para reserva de equipamentos. */
export const ANTECEDENCIA_MIN_EQUIPAMENTO_HORAS = 24;

/** Tamanho mínimo de senha em cadastros e trocas de senha. */
export const SENHA_MIN_CARACTERES = 8;

/** Validade do link de redefinição de senha enviado por e-mail. */
export const REDEFINICAO_SENHA_VALIDADE_MINUTOS = 60;

/** Intervalo mínimo entre dois pedidos de redefinição do mesmo usuário (evita spam de e-mails). */
export const REDEFINICAO_SENHA_INTERVALO_SEGUNDOS = 60;
