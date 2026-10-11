import { StatusItem, TipoItem } from '@prisma/client';
import { z } from '../../lib/zod.js';

const zTipo = () => z.enum(TipoItem, `Tipo inválido. Use ${Object.values(TipoItem).join(', ')}.`);
const zStatus = () => z.enum(StatusItem, `Status inválido. Use ${Object.values(StatusItem).join(', ')}.`);

// ── Respostas ────────────────────────────────────────────────────────────────
export const ItemSchema = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    tipo: z.enum(TipoItem),
    capacidade: z.number().int(),
    localizacao: z.string(),
    descricao: z.string(),
    status: z.enum(StatusItem),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Item' });
export type ItemDTO = z.infer<typeof ItemSchema>;

// ── Requisições ──────────────────────────────────────────────────────────────
export const ListarItensQuerySchema = z.object({
  tipo: zTipo().optional(),
  status: zStatus().optional(),
  search: z.string().trim().optional(),
});
export type ListarItensQuery = z.infer<typeof ListarItensQuerySchema>;

export const SalvarItemSchema = z
  .object({
    nome: z.string().trim().min(1, 'O nome da instalação ou recurso é obrigatório.').max(150),
    tipo: zTipo(),
    capacidade: z.coerce
      .number('Capacidade deve ser um número.')
      .int('Capacidade deve ser um número inteiro.')
      .min(1, 'A capacidade mínima é 1.')
      .max(10_000),
    localizacao: z.string().trim().min(1, 'Informe a localização física (bloco/sala/andar).').max(150),
    descricao: z.string().trim().max(1000).nullish().transform((v) => v ?? ''),
    status: zStatus().default(StatusItem.ATIVO),
  })
  .meta({ id: 'SalvarItemRequest' });
export type SalvarItemDTO = z.infer<typeof SalvarItemSchema>;
