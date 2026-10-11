import { env } from './config/env.js';
import { createApp } from './app.js';
import { prisma } from './lib/prisma.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`SG2RI API ouvindo em http://localhost:${env.PORT}/api`);
  console.log(`Documentação: http://localhost:${env.PORT}/api/docs`);
});

async function encerrar(sinal: string) {
  console.log(`${sinal} recebido, encerrando...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => void encerrar('SIGINT'));
process.on('SIGTERM', () => void encerrar('SIGTERM'));
