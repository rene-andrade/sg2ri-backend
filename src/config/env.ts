import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória.'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET deve ter ao menos 16 caracteres.'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  APP_TIMEZONE: z.string().default('America/Sao_Paulo'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Variáveis de ambiente inválidas:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean),
  isProduction: parsed.data.NODE_ENV === 'production',
};
