/**
 * Cálculo do relatório de ocupação & ociosidade (porta a lógica de Relatorios.jsx).
 * Função pura: recebe itens e reservas do período e devolve os indicadores.
 */
import { StatusItem, StatusReserva, Turno, type Item } from '@prisma/client';
import { HORARIOS_PADRAO } from '../../shared/constants.js';
import { contarDiasUteis, duracaoEmHoras, duracaoHorario } from '../../shared/datetime.js';

type ItemRelatorio = Pick<Item, 'id' | 'nome' | 'tipo' | 'localizacao' | 'capacidade' | 'status'>;

interface ReservaRelatorio {
  itemId: number;
  turno: Turno;
  status: StatusReserva;
  horaInicio: string;
  horaFim: string;
}

const arredondar1 = (n: number) => Math.round(n * 10) / 10;

export function calcularRelatorioOcupacao(params: {
  dataInicio: string;
  dataFim: string;
  itens: ItemRelatorio[];
  reservasDoPeriodo: ReservaRelatorio[];
}) {
  const { dataInicio, dataFim, itens, reservasDoPeriodo } = params;

  // Itens em manutenção/inativos não podem ser reservados — não entram na média,
  // senão a taxa geral ficaria artificialmente baixa.
  const itensAtivos = itens.filter((i) => i.status === StatusItem.ATIVO);
  const aprovadas = reservasDoPeriodo.filter((r) => r.status === StatusReserva.APROVADA);

  // Carga horária teórica = grade padrão da instituição × dias úteis do período.
  const horasDiariasTeoricas = HORARIOS_PADRAO.reduce((acc, h) => acc + duracaoHorario(h), 0);
  const diasUteis = contarDiasUteis(dataInicio, dataFim);
  const horasTeoricasPeriodo = arredondar1(horasDiariasTeoricas * Math.max(1, diasUteis));

  const contagemTurnos = { MANHA: 0, TARDE: 0, NOITE: 0 } satisfies Record<Turno, number>;
  for (const r of aprovadas) contagemTurnos[r.turno] += 1;
  const totalTurnos = aprovadas.length;
  const demandaPorTurno = (Object.keys(contagemTurnos) as Turno[]).map((turno) => ({
    turno,
    total: contagemTurnos[turno],
    percentual: totalTurnos > 0 ? Math.round((contagemTurnos[turno] / totalTurnos) * 100) : 0,
  }));

  const porItem = itensAtivos.map((item) => {
    const doItem = aprovadas.filter((r) => r.itemId === item.id);
    const horasOcupadas = arredondar1(doItem.reduce((acc, r) => acc + duracaoEmHoras(r.horaInicio, r.horaFim), 0));
    const taxaOcupacao = Math.min(100, Math.round((horasOcupadas / horasTeoricasPeriodo) * 100));
    return {
      itemId: item.id,
      nome: item.nome,
      tipo: item.tipo,
      localizacao: item.localizacao,
      capacidade: item.capacidade,
      totalReservas: doItem.length,
      horasOcupadas,
      taxaOcupacao,
      taxaOciosidade: 100 - taxaOcupacao,
    };
  });

  const mediaOcupacaoGeral =
    porItem.length > 0 ? Math.round(porItem.reduce((acc, i) => acc + i.taxaOcupacao, 0) / porItem.length) : 0;

  return {
    periodo: { dataInicio, dataFim, diasUteis },
    horasTeoricasPeriodo,
    totalItens: itens.length,
    itensAtivos: itensAtivos.length,
    itensIndisponiveis: itens.length - itensAtivos.length,
    totalReservasNoPeriodo: reservasDoPeriodo.length,
    totalReservasAprovadas: aprovadas.length,
    mediaOcupacaoGeral,
    mediaOciosidadeGeral: porItem.length > 0 ? 100 - mediaOcupacaoGeral : 0,
    demandaPorTurno,
    porItem,
  };
}
