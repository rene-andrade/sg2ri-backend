/**
 * RF06: notificações por e-mail (nova solicitação, parecer da administração e
 * devoluções pendentes). Os envios nunca interrompem a operação que os disparou:
 * falhas são registradas no log. Envia pela API do Brevo (BREVO_API_KEY) ou por SMTP
 * (SMTP_HOST); sem nenhum dos dois configurado, a mensagem só é logada.
 */
import nodemailer, { type Transporter } from 'nodemailer';
import { Role } from '@prisma/client';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import type { ReservaDTO } from '../reservas/reserva.schemas.js';

interface Mensagem {
  para: string[];
  assunto: string;
  texto: string;
}

let transporter: Transporter | null | undefined;

function obterTransporter(): Transporter | null {
  if (transporter === undefined) {
    transporter = env.SMTP_HOST
      ? nodemailer.createTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_SECURE,
          auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
        })
      : null;
  }
  return transporter;
}

/** "SG2RI <no-reply@x.br>" ou "no-reply@x.br" → { name?, email } (formato de remetente do Brevo). */
export function interpretarRemetente(from: string): { name?: string; email: string } {
  const match = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (!match) return { email: from.trim() };
  const name = match[1]!.trim();
  return name ? { name, email: match[2]!.trim() } : { email: match[2]!.trim() };
}

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

/** Envio pela API transacional do Brevo (https://developers.brevo.com/reference/sendtransacemail). */
export async function enviarViaBrevo(apiKey: string, remetente: string, { para, assunto, texto }: Mensagem) {
  const res = await fetch(BREVO_URL, {
    method: 'POST',
    headers: { 'api-key': apiKey, accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: interpretarRemetente(remetente),
      to: para.map((email) => ({ email })),
      subject: assunto,
      textContent: texto,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Brevo respondeu ${res.status}: ${await res.text()}`);
  }
}

async function enviar(mensagem: Mensagem) {
  const { para, assunto, texto } = mensagem;
  if (para.length === 0) return;
  if (env.BREVO_API_KEY) {
    await enviarViaBrevo(env.BREVO_API_KEY, env.MAIL_FROM, mensagem);
    return;
  }
  const smtp = obterTransporter();
  if (!smtp) {
    if (env.NODE_ENV === 'test') return;
    console.info(`[e-mail] para ${para.join(', ')}: ${assunto}`);
    // Em desenvolvimento, mostra o corpo para permitir testar links (ex.: redefinição de senha).
    // Nunca em produção: o log exporia links de redefinição.
    if (!env.isProduction) console.info(texto);
    return;
  }
  await smtp.sendMail({ from: env.MAIL_FROM, to: para, subject: assunto, text: texto });
}

/** Executa o envio em segundo plano, sem propagar erros para a requisição. */
function emSegundoPlano(tarefa: () => Promise<void>) {
  void tarefa().catch((err) => console.error('[e-mail] falha ao notificar:', err));
}

const resumo = (r: ReservaDTO) =>
  [
    `Reserva: ${r.codigo}`,
    `Recurso: ${r.itemNome}`,
    `Data: ${r.data.split('-').reverse().join('/')}, ${r.horario}`,
    `Finalidade: ${r.finalidade}`,
  ].join('\n');

async function emailDoUsuario(usuarioId: string) {
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { email: true } });
  return usuario ? [usuario.email] : [];
}

export const notificacaoService = {
  /** Caso de uso "Efetuar Reserva", passo 6: avisa a administração. */
  reservaSolicitada(reserva: ReservaDTO) {
    emSegundoPlano(async () => {
      const admins = await prisma.usuario.findMany({
        where: { role: Role.ADMIN, ativo: true },
        select: { email: true },
      });
      await enviar({
        para: admins.map((a) => a.email),
        assunto: `Nova solicitação de reserva ${reserva.codigo}`,
        texto: `${reserva.usuarioNome} solicitou uma reserva aguardando aprovação.\n\n${resumo(reserva)}`,
      });
    });
  },

  /** «extend» Notificar Usuário: parecer sobre a solicitação (aprovada ou recusada). */
  parecerReserva(reserva: ReservaDTO) {
    emSegundoPlano(async () => {
      const aprovada = reserva.status === 'APROVADA';
      await enviar({
        para: await emailDoUsuario(reserva.usuarioId),
        assunto: `Reserva ${reserva.codigo} ${aprovada ? 'aprovada' : 'recusada'}`,
        texto:
          `Sua solicitação de reserva foi ${aprovada ? 'aprovada' : 'recusada'}.\n\n${resumo(reserva)}` +
          (reserva.observacaoAdmin ? `\n\nObservação: ${reserva.observacaoAdmin}` : ''),
      });
    });
  },

  /** "Esqueci minha senha": envia o link de redefinição ao próprio usuário. */
  redefinicaoSenha(usuario: { name: string; email: string }, link: string, validadeMinutos: number) {
    emSegundoPlano(() =>
      enviar({
        para: [usuario.email],
        assunto: 'Redefinição de senha do SG2RI',
        texto:
          `Olá, ${usuario.name}.\n\n` +
          'Recebemos uma solicitação para redefinir a senha da sua conta no SG2RI.\n' +
          `Para criar uma nova senha, acesse o link abaixo (válido por ${validadeMinutos} minutos):\n\n` +
          `${link}\n\n` +
          'Se você não fez essa solicitação, ignore este e-mail: sua senha atual continua valendo.',
      }),
    );
  },

  /** Confirmação de que a senha foi redefinida (alerta o dono da conta caso não tenha sido ele). */
  senhaRedefinida(usuario: { name: string; email: string }) {
    emSegundoPlano(() =>
      enviar({
        para: [usuario.email],
        assunto: 'Sua senha do SG2RI foi alterada',
        texto:
          `Olá, ${usuario.name}.\n\n` +
          'A senha da sua conta no SG2RI acabou de ser redefinida.\n' +
          'Se não foi você, procure imediatamente um administrador do sistema.',
      }),
    );
  },

  /** Alerta de devolução pendente, enviado a quem retirou o recurso. */
  async devolucaoPendente(reserva: ReservaDTO) {
    await enviar({
      para: await emailDoUsuario(reserva.usuarioId),
      assunto: `Devolução pendente: ${reserva.itemNome}`,
      texto: `O período da sua reserva terminou e a devolução ainda não foi registrada.\n\n${resumo(reserva)}`,
    });
  },
};
