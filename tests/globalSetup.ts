import { execSync } from 'node:child_process';
import { lerEnvTeste } from './testEnv.js';

/**
 * Aplica as migrations pendentes no banco de testes (se configurado em .env.test).
 * Não recria o banco: a própria suíte de integração limpa as tabelas que usa.
 */
export default function setup() {
  const envTeste = lerEnvTeste();
  if (!envTeste.DATABASE_URL) {
    console.warn('\n[testes] .env.test sem DATABASE_URL — suíte de integração será pulada.\n');
    return;
  }
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: envTeste.DATABASE_URL },
  });
}
