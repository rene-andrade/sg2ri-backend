import { CondicaoItem, Role, StatusReserva, TipoItem, Turno } from '@prisma/client';
import { z, zDataISO, zHora, zId } from '../../lib/zod.js';
import { horaParaMinutos } from '../../shared/datetime.js';

const zStatusReserva = () =>
  z.enum(StatusReserva, `Status inválido. Use ${Object.values(StatusReserva).join(', ')}.`);

const fimAposInicio = {
  message: 'O horário de fim deve ser posterior ao horário de início.',
  path: ['horaFim'],
};
const horarioCoerente = (d: { horaInicio: string; horaFim: string }) =>
  horaParaMinutos(d.horaFim) > horaParaMinutos(d.horaInicio);

// ── Respostas ────────────────────────────────────────────────────────────────
export const ReservaSchema = z
  .object({
    id: z.uuid(),
    codigo: z.string().meta({ example: 'RES-20260910-3F9A1C2B' }),
    itemId: z.uuid(),
    itemNome: z.string(),
    itemTipo: z.enum(TipoItem),
    usuarioId: z.uuid(),
    usuarioNome: z.string(),
    usuarioRole: z.enum(Role),
    data: z.string().meta({ format: 'date' }),
    turno: z.enum(Turno),
    horaInicio: z.string(),
    horaFim: z.string(),
    horario: z.string().meta({ example: '07:30 - 09:10' }),
    finalidade: z.string(),
    quantidadePessoas: z.number().int().nullable(),
    status: z.enum(StatusReserva),
    prioridadeDocente: z.boolean(),
    observacaoAdmin: z.string().nullable(),
    retiradoEm: z.iso.datetime().nullable(),
    devolvidoEm: z.iso.datetime().nullable(),
    condicaoDevolucao: z.enum(CondicaoItem).nullable(),
    observacaoDevolucao: z.string().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Reserva' });
export type ReservaDTO = z.infer<typeof ReservaSchema>;

export const DisponibilidadeSchema = z
  .object({
    status: z.enum(['available', 'priority', 'unavailable']).meta({
      description:
        'available: sem conflitos; priority: só conflita com pedidos pendentes de alunos e o solicitante é professor (RN02); unavailable: há conflito.',
    }),
    conflitos: z.array(ReservaSchema),
  })
  .meta({ id: 'Disponibilidade' });

// ── Requisições ──────────────────────────────────────────────────────────────
export const ListarReservasQuerySchema = z
  .object({
    status: zStatusReserva().optional(),
    itemId: zId().optional(),
    data: zDataISO().optional(),
    dataInicio: zDataISO().optional(),
    dataFim: zDataISO().optional(),
  })
  .refine((q) => !q.dataInicio || !q.dataFim || q.dataFim >= q.dataInicio, {
    message: 'A data final deve ser igual ou posterior à data inicial.',
    path: ['dataFim'],
  });
export type ListarReservasQuery = z.infer<typeof ListarReservasQuerySchema>;

export const DisponibilidadeQuerySchema = z
  .object({ itemId: zId(), data: zDataISO(), horaInicio: zHora(), horaFim: zHora() })
  .refine(horarioCoerente, fimAposInicio);
export type DisponibilidadeQuery = z.infer<typeof DisponibilidadeQuerySchema>;

export const CriarReservaSchema = z
  .object({
    itemId: zId(),
    data: zDataISO(),
    horaInicio: zHora(),
    horaFim: zHora(),
    finalidade: z.string().trim().min(1, 'Descreva a finalidade do uso.').max(500),
    quantidadePessoas: z.number().int().min(1).max(10_000).nullish(),
    aceitouTermos: z.literal(true, 'É necessário aceitar os Termos de Responsabilidade para continuar.'),
  })
  .refine(horarioCoerente, fimAposInicio)
  .meta({ id: 'CriarReservaRequest' });
export type CriarReservaDTO = z.infer<typeof CriarReservaSchema>;

const zObservacao = () => z.string().trim().max(500).optional();

export const AprovarReservaSchema = z
  .object({ observacaoAdmin: zObservacao() })
  .meta({ id: 'AprovarReservaRequest' });
export type AprovarReservaDTO = z.infer<typeof AprovarReservaSchema>;

export const RecusarReservaSchema = z
  .object({ motivoRecusa: zObservacao() })
  .meta({ id: 'RecusarReservaRequest' });
export type RecusarReservaDTO = z.infer<typeof RecusarReservaSchema>;

export const DevolucaoSchema = z
  .object({
    condicao: z.enum(CondicaoItem).default(CondicaoItem.OK),
    observacao: z.string().trim().max(1000).default(''),
  })
  .refine((d) => d.condicao !== CondicaoItem.DANIFICADO || d.observacao.length > 0, {
    message: 'Descreva a avaria identificada antes de confirmar o check-out.',
    path: ['observacao'],
  })
  .meta({ id: 'DevolucaoRequest' });
export type DevolucaoDTO = z.infer<typeof DevolucaoSchema>;
