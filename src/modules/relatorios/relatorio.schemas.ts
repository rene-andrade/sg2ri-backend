import { TipoItem, Turno } from '@prisma/client';
import { z, zDataISO } from '../../lib/zod.js';
import { diferencaEmDias } from '../../shared/datetime.js';

/** Limite do período para manter o cálculo de dias úteis e a consulta leves. */
const MAX_DIAS_PERIODO = 366;

export const RelatorioOcupacaoQuerySchema = z
  .object({ dataInicio: zDataISO(), dataFim: zDataISO() })
  .refine((q) => q.dataFim >= q.dataInicio, {
    message: 'A data final deve ser igual ou posterior à data inicial.',
    path: ['dataFim'],
  })
  .refine((q) => diferencaEmDias(q.dataInicio, q.dataFim) <= MAX_DIAS_PERIODO, {
    message: `O período do relatório não pode exceder ${MAX_DIAS_PERIODO} dias.`,
    path: ['dataFim'],
  });
export type RelatorioOcupacaoQuery = z.infer<typeof RelatorioOcupacaoQuerySchema>;

export const RelatorioOcupacaoSchema = z
  .object({
    periodo: z.object({ dataInicio: z.string(), dataFim: z.string(), diasUteis: z.number().int() }),
    horasTeoricasPeriodo: z.number().meta({ description: 'Grade de horários padrão × dias úteis do período.' }),
    totalItens: z.number().int(),
    itensAtivos: z.number().int(),
    itensIndisponiveis: z.number().int(),
    totalReservasNoPeriodo: z.number().int(),
    totalReservasAprovadas: z.number().int(),
    mediaOcupacaoGeral: z.number().int(),
    mediaOciosidadeGeral: z.number().int(),
    demandaPorTurno: z.array(
      z.object({ turno: z.enum(Turno), total: z.number().int(), percentual: z.number().int() }),
    ),
    porItem: z.array(
      z.object({
        itemId: z.number().int(),
        nome: z.string(),
        tipo: z.enum(TipoItem),
        localizacao: z.string(),
        capacidade: z.number().int(),
        totalReservas: z.number().int(),
        horasOcupadas: z.number(),
        taxaOcupacao: z.number().int(),
        taxaOciosidade: z.number().int(),
      }),
    ),
  })
  .meta({ id: 'RelatorioOcupacao' });
