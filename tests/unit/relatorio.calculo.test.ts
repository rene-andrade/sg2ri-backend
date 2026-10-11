import { describe, expect, it } from 'vitest';
import { StatusItem, StatusReserva, TipoItem, Turno } from '@prisma/client';
import { calcularRelatorioOcupacao } from '../../src/modules/relatorios/relatorio.calculo.js';

const item = (id: string, status: StatusItem = StatusItem.ATIVO) => ({
  id,
  nome: `Item ${id}`,
  tipo: TipoItem.LABORATORIO,
  localizacao: 'Bloco A',
  capacidade: 20,
  status,
});

const reserva = (
  itemId: string,
  horaInicio: string,
  horaFim: string,
  turno: Turno,
  status: StatusReserva = StatusReserva.APROVADA,
) => ({
  itemId,
  horaInicio,
  horaFim,
  turno,
  status,
});

describe('calcularRelatorioOcupacao', () => {
  // Semana de 2026-09-07 (seg) a 2026-09-13 (dom): 5 dias úteis.
  // Grade padrão = 8 blocos de 100 min = 13,33h/dia → 66,7h no período.
  const relatorio = calcularRelatorioOcupacao({
    dataInicio: '2026-09-07',
    dataFim: '2026-09-13',
    itens: [item('a'), item('b'), item('c', StatusItem.MANUTENCAO)],
    reservasDoPeriodo: [
      reserva('a', '08:00', '18:00', Turno.MANHA),
      reserva('a', '19:00', '22:20', Turno.NOITE),
      reserva('a', '13:00', '15:00', Turno.TARDE, StatusReserva.PENDENTE),
      reserva('b', '14:00', '17:20', Turno.TARDE, StatusReserva.CANCELADA),
    ],
  });

  it('usa a grade padrão × dias úteis como carga teórica', () => {
    expect(relatorio.periodo.diasUteis).toBe(5);
    expect(relatorio.horasTeoricasPeriodo).toBe(66.7);
  });

  it('considera apenas reservas aprovadas e itens ativos', () => {
    expect(relatorio.itensAtivos).toBe(2);
    expect(relatorio.itensIndisponiveis).toBe(1);
    expect(relatorio.totalReservasNoPeriodo).toBe(4);
    expect(relatorio.totalReservasAprovadas).toBe(2);
    expect(relatorio.porItem.map((i) => i.itemId)).toEqual(['a', 'b']);
  });

  it('calcula horas, ocupação e ociosidade por item', () => {
    const a = relatorio.porItem.find((i) => i.itemId === 'a')!;
    expect(a.totalReservas).toBe(2);
    expect(a.horasOcupadas).toBe(13.3);
    expect(a.taxaOcupacao).toBe(20);
    expect(a.taxaOciosidade).toBe(80);

    const b = relatorio.porItem.find((i) => i.itemId === 'b')!;
    expect(b.taxaOcupacao).toBe(0);
    expect(relatorio.mediaOcupacaoGeral).toBe(10);
  });

  it('distribui a demanda por turno', () => {
    expect(relatorio.demandaPorTurno).toEqual([
      { turno: 'MANHA', total: 1, percentual: 50 },
      { turno: 'TARDE', total: 0, percentual: 0 },
      { turno: 'NOITE', total: 1, percentual: 50 },
    ]);
  });

  it('limita a ocupação a 100%', () => {
    const cheio = calcularRelatorioOcupacao({
      dataInicio: '2026-09-12',
      dataFim: '2026-09-12', // sábado: sem dias úteis → base mínima de 1 dia
      itens: [item('a')],
      reservasDoPeriodo: [reserva('a', '00:00', '23:59', Turno.MANHA)],
    });
    expect(cheio.porItem[0]!.taxaOcupacao).toBe(100);
  });
});
