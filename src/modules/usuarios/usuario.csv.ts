import { Role } from '@prisma/client';
import { BadRequestError } from '../../errors/index.js';
import { SENHA_MIN_CARACTERES } from '../../shared/constants.js';

export interface LinhaUsuarioCSV {
  linha: number;
  name: string;
  email: string;
  matricula: string;
  role: Role;
  department: string;
  senha: string;
}

export interface ErroLinhaCSV {
  linha: number;
  mensagem: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES_VALIDOS = Object.values(Role) as string[];

/**
 * Interpreta o CSV de importação em massa (mesmo formato aceito pelo frontend):
 *   nome,email,matricula,perfil,departamento,senha
 * A primeira linha é o cabeçalho. Linhas inválidas viram erros, sem abortar o lote.
 * `emailsExistentes` deve conter e-mails (minúsculos) já cadastrados.
 */
export function interpretarUsuariosCSV(csv: string, emailsExistentes: Set<string>) {
  const linhas = csv
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((l) => l.trim());

  if (linhas.filter(Boolean).length < 2) {
    throw new BadRequestError('O arquivo CSV está vazio ou não possui dados além do cabeçalho.', 'CSV_VAZIO');
  }

  const vistos = new Set(emailsExistentes);
  const validos: LinhaUsuarioCSV[] = [];
  const errors: ErroLinhaCSV[] = [];

  linhas.forEach((conteudo, i) => {
    if (i === 0 || !conteudo) return;
    const linha = i + 1;
    const [nome = '', emailBruto = '', matricula = '', perfil = '', departamento = '', senha = ''] = conteudo
      .split(',')
      .map((c) => c.trim());
    const email = emailBruto.toLowerCase();

    if (!nome) {
      errors.push({ linha, mensagem: 'Campo "nome" obrigatório.' });
      return;
    }
    if (!EMAIL_REGEX.test(email)) {
      errors.push({ linha, mensagem: `E-mail inválido: "${emailBruto}".` });
      return;
    }
    if (!ROLES_VALIDOS.includes(perfil.toUpperCase())) {
      errors.push({ linha, mensagem: `Perfil inválido: "${perfil}". Use ADMIN, PROFESSOR ou ALUNO.` });
      return;
    }
    if (senha.length < SENHA_MIN_CARACTERES) {
      errors.push({ linha, mensagem: `Senha obrigatória (mínimo ${SENHA_MIN_CARACTERES} caracteres).` });
      return;
    }
    if (vistos.has(email)) {
      errors.push({ linha, mensagem: `E-mail duplicado: "${emailBruto}".` });
      return;
    }

    vistos.add(email);
    validos.push({
      linha,
      name: nome,
      email,
      matricula,
      role: perfil.toUpperCase() as Role,
      department: departamento,
      senha,
    });
  });

  return { validos, errors };
}
