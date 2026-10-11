/**
 * Ponto único de importação do zod: aplica as mensagens padrão em português
 * antes de qualquer schema ser usado. Os módulos importam `z` daqui.
 */
import { z } from 'zod';
import { HORA_REGEX, isDataValida } from '../shared/datetime.js';

z.config(z.locales.pt());

export { z };

/** Data de calendário "YYYY-MM-DD" válida. */
export const zDataISO = () =>
  z
    .string()
    .refine(isDataValida, { message: 'Data inválida. Use o formato AAAA-MM-DD.' })
    .meta({ format: 'date', example: '2026-09-10' });

/** Horário "HH:mm" (00:00–23:59). */
export const zHora = () =>
  z.string().regex(HORA_REGEX, 'Horário inválido. Use o formato HH:mm.').meta({ example: '07:30' });

/** Identificador UUID (usuários). */
export const zId = () => z.uuid('Identificador inválido.');

export const zIdParams = z.object({ id: zId() });
export type IdParams = z.infer<typeof zIdParams>;

/** Identificador inteiro sequencial (itens e reservas); aceita "12" vindo de rota ou query. */
export const zIntId = () =>
  z.coerce.number('Identificador inválido.').int('Identificador inválido.').positive('Identificador inválido.');

export const zIntIdParams = z.object({ id: zIntId() });
export type IntIdParams = z.infer<typeof zIntIdParams>;

/** Booleano vindo de query string ("true"/"false"). */
export const zQueryBoolean = () =>
  z.enum(['true', 'false']).transform((v) => v === 'true');

/** Texto obrigatório, já sem espaços nas pontas. */
export const zTexto = (campo: string, max = 255) =>
  z.string().trim().min(1, `O campo "${campo}" é obrigatório.`).max(max);
