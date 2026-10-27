import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória.'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET deve ter ao menos 16 caracteres.'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  // URL pública do frontend, usada nos links enviados por e-mail (ex.: redefinição de senha).
  // Sem valor, usa a primeira origem de CORS_ORIGIN.
  FRONTEND_URL: z.url('FRONTEND_URL deve ser uma URL válida.').or(z.literal('')).optional(),
  APP_TIMEZONE: z.string().default('America/Sao_Paulo'),
  // E-mail (RF06). Com BREVO_API_KEY, envia pela API HTTP do Brevo (porta 443, não depende de
  // portas SMTP liberadas); senão, por SMTP. Sem nenhum dos dois, as mensagens só vão para o log.
  BREVO_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.stringbool().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('SG2RI <no-reply@sg2ri.edu.br>'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Variáveis de ambiente inválidas:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const corsOrigins = parsed.data.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);

export const env = {
  ...parsed.data,
  corsOrigins,
  frontendUrl: (parsed.data.FRONTEND_URL || corsOrigins[0] || 'http://localhost:5173').replace(/\/+$/, ''),
  isProduction: parsed.data.NODE_ENV === 'production',
};
