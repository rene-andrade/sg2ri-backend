/**
 * Seed mínimo: garante a existência do administrador inicial, necessário para
 * cadastrar os demais usuários e itens. Idempotente (não altera um admin existente).
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? 'admin@sg2ri.edu.br').trim().toLowerCase();
  const senha = process.env.ADMIN_PASSWORD ?? 'admin1234';
  const name = process.env.ADMIN_NAME ?? 'Administrador';

  if (senha.length < 8) {
    throw new Error('ADMIN_PASSWORD deve ter no mínimo 8 caracteres.');
  }

  const existente = await prisma.usuario.findUnique({ where: { email } });
  if (existente) {
    console.log(`Administrador ${email} já existe — nada a fazer.`);
    return;
  }

  await prisma.usuario.create({
    data: {
      name,
      email,
      role: Role.ADMIN,
      department: 'Coordenação de Infraestrutura e Ativos',
      senhaHash: await bcrypt.hash(senha, 10),
    },
  });
  console.log(`Administrador ${email} criado.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
