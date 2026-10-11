import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../errors/index.js';
import { env } from '../config/env.js';

interface ErrorBody {
  message: string;
  code: string;
  details?: unknown;
}

/** Converte erros conhecidos (zod, Prisma, body-parser) em AppError. */
export function normalizarErro(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (err instanceof ZodError) {
    return new ValidationError(
      err.issues.map((i) => ({ campo: i.path.map(String).join('.'), mensagem: i.message })),
    );
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        return new ConflictError('Já existe um registro com estes dados únicos.', 'REGISTRO_DUPLICADO', err.meta);
      case 'P2003':
        return new ConflictError(
          'Operação não permitida: o registro possui vínculos (ex.: reservas associadas).',
          'REGISTRO_VINCULADO',
        );
      case 'P2025':
        return new NotFoundError('Registro não encontrado.');
    }
  }

  // Erros lançados pelo body-parser do Express (JSON malformado, payload grande demais).
  if (typeof err === 'object' && err !== null && 'type' in err) {
    const tipo = (err as { type?: string }).type;
    if (tipo === 'entity.parse.failed') {
      return new AppError(400, 'O corpo da requisição não é um JSON válido.', 'JSON_INVALIDO');
    }
    if (tipo === 'entity.too.large') {
      return new AppError(413, 'O corpo da requisição excede o tamanho máximo permitido.', 'PAYLOAD_GRANDE_DEMAIS');
    }
  }

  return new AppError(500, 'Erro interno do servidor.', 'ERRO_INTERNO');
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const appError = normalizarErro(err);

  if (appError.statusCode >= 500 && env.NODE_ENV !== 'test') {
    console.error(err);
  }

  const body: ErrorBody = { message: appError.message, code: appError.code };
  if (appError.details !== undefined) body.details = appError.details;
  if (appError.statusCode >= 500 && !env.isProduction && err instanceof Error) {
    body.details = { erro: err.message, stack: err.stack };
  }

  res.status(appError.statusCode).json(body);
}
