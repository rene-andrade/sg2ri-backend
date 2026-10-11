/**
 * RF06: notificações por e-mail (nova solicitação, parecer da administração e
 * devoluções pendentes). Os envios nunca interrompem a operação que os disparou:
 * falhas são registradas no log. Sem SMTP_HOST configurado, a mensagem só é logada.
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

async function enviar({ para, assunto, texto }: Mensagem) {
  if (para.length === 0) return;
  const smtp = obterTransporter();
  if (!smtp) {
    if (env.NODE_ENV !== 'test') console.info(`[e-mail] para ${para.join(', ')}: ${assunto}`);
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

  /** Alerta de devolução pendente, enviado a quem retirou o recurso. */
  async devolucaoPendente(reserva: ReservaDTO) {
    await enviar({
      para: await emailDoUsuario(reserva.usuarioId),
      assunto: `Devolução pendente: ${reserva.itemNome}`,
      texto: `O período da sua reserva terminou e a devolução ainda não foi registrada.\n\n${resumo(reserva)}`,
    });
  },
};
