import { prisma } from '../../lib/prisma.js';
import { dataISOParaDate } from '../../shared/datetime.js';
import { calcularRelatorioOcupacao } from './relatorio.calculo.js';
import type { RelatorioOcupacaoQuery } from './relatorio.schemas.js';

export const relatorioService = {
  async ocupacao({ dataInicio, dataFim }: RelatorioOcupacaoQuery) {
    const [itens, reservasDoPeriodo] = await Promise.all([
      prisma.item.findMany({ orderBy: { nome: 'asc' } }),
      prisma.reserva.findMany({
        where: { data: { gte: dataISOParaDate(dataInicio), lte: dataISOParaDate(dataFim) } },
        select: { itemId: true, turno: true, status: true, horaInicio: true, horaFim: true },
      }),
    ]);
    return calcularRelatorioOcupacao({ dataInicio, dataFim, itens, reservasDoPeriodo });
  },
};
