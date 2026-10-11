import { describe, expect, it } from 'vitest';
import {
  agoraNoFuso,
  contarDiasUteis,
  duracaoHorario,
  isDataValida,
  minutosEntre,
} from '../../src/shared/datetime.js';

describe('datetime', () => {
  it('valida datas de calendário reais', () => {
    expect(isDataValida('2026-02-28')).toBe(true);
    expect(isDataValida('2026-02-30')).toBe(false);
    expect(isDataValida('10/09/2026')).toBe(false);
  });

  it('calcula minutos entre momentos atravessando dias', () => {
    expect(minutosEntre({ data: '2026-09-10', hora: '23:00' }, { data: '2026-09-11', hora: '01:30' })).toBe(150);
    expect(minutosEntre({ data: '2026-09-10', hora: '10:00' }, { data: '2026-09-10', hora: '09:00' })).toBe(-60);
  });

  it('obtém data/hora no fuso da instituição', () => {
    // 2026-09-10 02:30 UTC = 2026-09-09 23:30 em São Paulo (UTC-3).
    expect(agoraNoFuso('America/Sao_Paulo', new Date('2026-09-10T02:30:00Z'))).toEqual({
      data: '2026-09-09',
      hora: '23:30',
    });
  });

  it('conta dias úteis do período (inclusive)', () => {
    // 2026-09-07 é segunda-feira.
    expect(contarDiasUteis('2026-09-07', '2026-09-13')).toBe(5);
    expect(contarDiasUteis('2026-09-12', '2026-09-13')).toBe(0);
    expect(contarDiasUteis('2026-09-01', '2026-09-30')).toBe(22);
  });

  it('calcula duração de um intervalo "HH:mm - HH:mm"', () => {
    expect(duracaoHorario('07:30 - 09:10')).toBeCloseTo(100 / 60);
    expect(duracaoHorario('inválido')).toBe(0);
  });
});
