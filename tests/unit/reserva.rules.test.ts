import { describe, expect, it } from 'vitest';
import { Role, StatusItem, StatusReserva, TipoItem, Turno } from '@prisma/client';
import {
  avaliarDisponibilidade,
  derivarTurno,
  filtrarConflitos,
  gerarCodigoReserva,
  intervalosSobrepoem,
  sugerirHorarios,
  validarSolicitacao,
} from '../../src/modules/reservas/reserva.rules.js';
import { BusinessRuleError } from '../../src/errors/index.js';

const AGORA = { data: '2026-09-10', hora: '10:00' };

const solicitacaoBase = {
  role: Role.PROFESSOR,
  tipoItem: TipoItem.LABORATORIO,
  statusItem: StatusItem.ATIVO,
  capacidadeItem: 30,
  data: '2026-09-15',
  horaInicio: '08:00',
  horaFim: '10:00',
  agora: AGORA,
};

function codigoDoErro(fn: () => void): string | undefined {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(BusinessRuleError);
    return (err as BusinessRuleError).code;
  }
  return undefined;
}

describe('derivarTurno', () => {
  it.each([
    ['07:30', Turno.MANHA],
    ['11:59', Turno.MANHA],
    ['12:00', Turno.TARDE],
    ['17:59', Turno.TARDE],
    ['18:00', Turno.NOITE],
    ['22:30', Turno.NOITE],
  ])('%s → %s', (hora, turno) => {
    expect(derivarTurno(hora)).toBe(turno);
  });
});

describe('intervalosSobrepoem', () => {
  it('detecta sobreposição parcial e total', () => {
    expect(intervalosSobrepoem({ horaInicio: '08:00', horaFim: '10:00' }, { horaInicio: '09:00', horaFim: '11:00' })).toBe(true);
    expect(intervalosSobrepoem({ horaInicio: '08:00', horaFim: '12:00' }, { horaInicio: '09:00', horaFim: '10:00' })).toBe(true);
  });

  it('intervalos encostados não conflitam', () => {
    expect(intervalosSobrepoem({ horaInicio: '08:00', horaFim: '10:00' }, { horaInicio: '10:00', horaFim: '11:00' })).toBe(false);
    expect(intervalosSobrepoem({ horaInicio: '10:00', horaFim: '11:00' }, { horaInicio: '08:00', horaFim: '10:00' })).toBe(false);
  });
});

describe('filtrarConflitos', () => {
  it('ignora reservas canceladas e recusadas', () => {
    const reservas = [
      { id: 'a', horaInicio: '08:00', horaFim: '09:00', status: StatusReserva.PENDENTE },
      { id: 'b', horaInicio: '08:00', horaFim: '09:00', status: StatusReserva.APROVADA },
      { id: 'c', horaInicio: '08:00', horaFim: '09:00', status: StatusReserva.CANCELADA },
      { id: 'd', horaInicio: '08:00', horaFim: '09:00', status: StatusReserva.RECUSADA },
      { id: 'e', horaInicio: '09:00', horaFim: '10:00', status: StatusReserva.APROVADA },
    ];
    const ids = filtrarConflitos(reservas, { horaInicio: '08:30', horaFim: '09:00' }).map((r) => r.id);
    expect(ids).toEqual(['a', 'b']);
  });
});

describe('avaliarDisponibilidade (RN02)', () => {
  const pendenteAluno = { status: StatusReserva.PENDENTE, usuarioRole: Role.ALUNO };
  const aprovadaAluno = { status: StatusReserva.APROVADA, usuarioRole: Role.ALUNO };
  const pendenteProfessor = { status: StatusReserva.PENDENTE, usuarioRole: Role.PROFESSOR };

  it('sem conflitos → available', () => {
    expect(avaliarDisponibilidade({ role: Role.ALUNO, tipoItem: TipoItem.SALA, conflitos: [] })).toBe('available');
  });

  it('professor + equipamento + só pendentes de alunos → priority', () => {
    expect(
      avaliarDisponibilidade({ role: Role.PROFESSOR, tipoItem: TipoItem.EQUIPAMENTO, conflitos: [pendenteAluno, pendenteAluno] }),
    ).toBe('priority');
  });

  it('reserva já aprovada não é reaberta', () => {
    expect(
      avaliarDisponibilidade({ role: Role.PROFESSOR, tipoItem: TipoItem.EQUIPAMENTO, conflitos: [pendenteAluno, aprovadaAluno] }),
    ).toBe('unavailable');
  });

  it('não prioriza sobre outro professor', () => {
    expect(
      avaliarDisponibilidade({ role: Role.PROFESSOR, tipoItem: TipoItem.EQUIPAMENTO, conflitos: [pendenteProfessor] }),
    ).toBe('unavailable');
  });

  it('prioridade vale apenas para equipamentos', () => {
    expect(avaliarDisponibilidade({ role: Role.PROFESSOR, tipoItem: TipoItem.SALA, conflitos: [pendenteAluno] })).toBe(
      'unavailable',
    );
  });

  it('aluno nunca tem prioridade', () => {
    expect(avaliarDisponibilidade({ role: Role.ALUNO, tipoItem: TipoItem.EQUIPAMENTO, conflitos: [pendenteAluno] })).toBe(
      'unavailable',
    );
  });
});

describe('validarSolicitacao', () => {
  it('aceita uma solicitação válida', () => {
    expect(() => validarSolicitacao(solicitacaoBase)).not.toThrow();
  });

  it('rejeita item fora de operação', () => {
    expect(codigoDoErro(() => validarSolicitacao({ ...solicitacaoBase, statusItem: StatusItem.MANUTENCAO }))).toBe(
      'ITEM_INDISPONIVEL',
    );
  });

  it('rejeita fim igual ou anterior ao início', () => {
    expect(codigoDoErro(() => validarSolicitacao({ ...solicitacaoBase, horaFim: '08:00' }))).toBe('HORARIO_INVALIDO');
  });

  it('rejeita data/horário no passado', () => {
    expect(codigoDoErro(() => validarSolicitacao({ ...solicitacaoBase, data: '2026-09-10', horaInicio: '09:59' }))).toBe(
      'DATA_PASSADA',
    );
    expect(codigoDoErro(() => validarSolicitacao({ ...solicitacaoBase, data: '2026-09-09' }))).toBe('DATA_PASSADA');
  });

  describe('antecedência de 24h para equipamentos', () => {
    const equipamento = { ...solicitacaoBase, tipoItem: TipoItem.EQUIPAMENTO, data: '2026-09-11' };

    it('rejeita com menos de 24h', () => {
      expect(codigoDoErro(() => validarSolicitacao({ ...equipamento, horaInicio: '09:59', horaFim: '11:00' }))).toBe(
        'ANTECEDENCIA_24H',
      );
    });

    it('aceita com exatamente 24h', () => {
      expect(() => validarSolicitacao({ ...equipamento, horaInicio: '10:00', horaFim: '11:00' })).not.toThrow();
    });

    it('não se aplica a outros tipos', () => {
      expect(() =>
        validarSolicitacao({ ...solicitacaoBase, data: '2026-09-10', horaInicio: '10:30', horaFim: '11:00' }),
      ).not.toThrow();
    });
  });

  describe('RN01 — aluno reserva sala por no máximo 2h', () => {
    const salaAluno = { ...solicitacaoBase, role: Role.ALUNO, tipoItem: TipoItem.SALA };

    it('aceita exatamente 2h', () => {
      expect(() => validarSolicitacao({ ...salaAluno, horaInicio: '08:00', horaFim: '10:00' })).not.toThrow();
    });

    it('rejeita acima de 2h', () => {
      expect(codigoDoErro(() => validarSolicitacao({ ...salaAluno, horaInicio: '08:00', horaFim: '10:01' }))).toBe('RN01');
    });

    it('não limita professores nem outros tipos de recurso', () => {
      expect(() => validarSolicitacao({ ...salaAluno, role: Role.PROFESSOR, horaFim: '12:00' })).not.toThrow();
      expect(() =>
        validarSolicitacao({ ...salaAluno, tipoItem: TipoItem.LABORATORIO, horaFim: '12:00' }),
      ).not.toThrow();
    });
  });

  it('rejeita quantidade de pessoas acima da capacidade', () => {
    expect(codigoDoErro(() => validarSolicitacao({ ...solicitacaoBase, quantidadePessoas: 31 }))).toBe(
      'CAPACIDADE_EXCEDIDA',
    );
    expect(() => validarSolicitacao({ ...solicitacaoBase, quantidadePessoas: 30 })).not.toThrow();
  });
});

describe('gerarCodigoReserva', () => {
  it('gera código legível e único', () => {
    const a = gerarCodigoReserva('2026-09-10');
    const b = gerarCodigoReserva('2026-09-10');
    expect(a).toMatch(/^RES-20260910-[0-9A-F]{8}$/);
    expect(a).not.toBe(b);
  });
});

describe('sugerirHorarios (fluxo 4a)', () => {
  const aprovada = (horaInicio: string, horaFim: string) => ({ horaInicio, horaFim, status: StatusReserva.APROVADA });

  it('sugere inícios livres da grade, com a mesma duração, do mais próximo ao mais distante', () => {
    const sugestoes = sugerirHorarios({
      intervalo: { horaInicio: '09:20', horaFim: '11:00' },
      ocupadas: [aprovada('09:20', '11:00'), aprovada('07:30', '09:10')],
    });
    expect(sugestoes).toEqual([
      { horaInicio: '11:10', horaFim: '12:50' },
      { horaInicio: '13:30', horaFim: '15:10' },
      { horaInicio: '15:20', horaFim: '17:00' },
    ]);
  });

  it('ignora reservas que não ocupam o horário e respeita o fim da grade', () => {
    const sugestoes = sugerirHorarios({
      intervalo: { horaInicio: '19:00', horaFim: '22:30' },
      ocupadas: [aprovada('20:50', '22:30'), { horaInicio: '17:10', horaFim: '18:50', status: StatusReserva.CANCELADA }],
      limite: 10,
    });
    expect(sugestoes.map((s) => s.horaInicio)).toEqual(['17:10', '15:20', '13:30', '11:10', '09:20', '07:30']);
  });

  it('aplica o filtro do chamador', () => {
    const sugestoes = sugerirHorarios({
      intervalo: { horaInicio: '09:20', horaFim: '11:00' },
      ocupadas: [aprovada('09:20', '11:00')],
      aceitar: (c) => c.horaInicio >= '13:00',
    });
    expect(sugestoes[0]).toEqual({ horaInicio: '13:30', horaFim: '15:10' });
  });
});
