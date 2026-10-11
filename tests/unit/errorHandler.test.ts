import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { normalizarErro } from '../../src/middlewares/errorHandler.js';
import { BusinessRuleError } from '../../src/errors/index.js';

const prismaErro = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('erro', { code, clientVersion: 'teste' });

describe('normalizarErro', () => {
  it('preserva AppError', () => {
    const err = new BusinessRuleError('regra', 'RN01');
    expect(normalizarErro(err)).toBe(err);
  });

  it('converte ZodError em 400 com detalhes por campo', () => {
    const result = z.object({ nome: z.string() }).safeParse({});
    const err = normalizarErro(result.error);
    expect(err.statusCode).toBe(400);
    expect(err.details).toEqual([{ campo: 'nome', mensagem: expect.any(String) }]);
  });

  it.each([
    ['P2002', 409, 'REGISTRO_DUPLICADO'],
    ['P2003', 409, 'REGISTRO_VINCULADO'],
    ['P2025', 404, 'NAO_ENCONTRADO'],
  ])('mapeia Prisma %s → %i', (code, status, appCode) => {
    const err = normalizarErro(prismaErro(code));
    expect(err.statusCode).toBe(status);
    expect(err.code).toBe(appCode);
  });

  it('erros desconhecidos viram 500 genérico', () => {
    const err = normalizarErro(new Error('detalhe interno'));
    expect(err.statusCode).toBe(500);
    expect(err.message).toBe('Erro interno do servidor.');
  });
});
