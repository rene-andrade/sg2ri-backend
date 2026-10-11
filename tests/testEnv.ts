import fs from 'node:fs';
import { parse } from 'dotenv';

/**
 * Variáveis do banco de testes, lidas de .env.test (se existir).
 * Sem esse arquivo, a suíte de integração é pulada.
 */
export function lerEnvTeste(): Record<string, string> {
  return fs.existsSync('.env.test') ? parse(fs.readFileSync('.env.test')) : {};
}

export const bancoDeTesteConfigurado = () => Boolean(lerEnvTeste().DATABASE_URL);
