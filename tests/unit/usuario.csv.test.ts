import { describe, expect, it } from 'vitest';
import { interpretarUsuariosCSV } from '../../src/modules/usuarios/usuario.csv.js';
import { BadRequestError } from '../../src/errors/index.js';

const CABECALHO = 'nome,email,matricula,perfil,departamento,senha';

describe('interpretarUsuariosCSV', () => {
  it('importa linhas válidas e reporta as inválidas com o número da linha', () => {
    const csv = [
      CABECALHO,
      'Ana Souza,ANA@sg2ri.edu.br,2024001,aluno,Engenharia,senha1234',
      ',sem-nome@sg2ri.edu.br,1,ALUNO,X,senha1234',
      'Bruno,email-invalido,2,ALUNO,X,senha1234',
      'Carla,carla@sg2ri.edu.br,3,DIRETOR,X,senha1234',
      'Davi,davi@sg2ri.edu.br,4,PROFESSOR,X,curta',
      'Eva,existente@sg2ri.edu.br,5,ALUNO,X,senha1234',
      'Ana Repetida,ana@sg2ri.edu.br,6,ALUNO,X,senha1234',
      '',
    ].join('\r\n');

    const { validos, errors } = interpretarUsuariosCSV(csv, new Set(['existente@sg2ri.edu.br']));

    expect(validos).toEqual([
      {
        linha: 2,
        name: 'Ana Souza',
        email: 'ana@sg2ri.edu.br',
        matricula: '2024001',
        role: 'ALUNO',
        department: 'Engenharia',
        senha: 'senha1234',
      },
    ]);
    expect(errors.map((e) => e.linha)).toEqual([3, 4, 5, 6, 7, 8]);
    expect(errors[0]!.mensagem).toContain('nome');
    expect(errors[2]!.mensagem).toContain('Perfil inválido');
    expect(errors[5]!.mensagem).toContain('duplicado');
  });

  it('rejeita arquivo sem linhas de dados', () => {
    expect(() => interpretarUsuariosCSV(CABECALHO, new Set())).toThrow(BadRequestError);
  });
});
