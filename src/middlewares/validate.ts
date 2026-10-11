import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';
import { ValidationError, type ValidationIssue } from '../errors/index.js';

interface RequestSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/**
 * Valida body/query/params com zod. O body é substituído pelo valor parseado;
 * como `req.query` é somente-leitura no Express 5, query e params parseados
 * ficam em `req.validated`.
 */
export function validate(schemas: RequestSchemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const issues: ValidationIssue[] = [];
    req.validated ??= {};

    for (const origem of ['params', 'query', 'body'] as const) {
      const schema = schemas[origem];
      if (!schema) continue;

      const result = schema.safeParse(req[origem] ?? {});
      if (!result.success) {
        for (const issue of result.error.issues) {
          issues.push({
            campo: [origem, ...issue.path.map(String)].join('.'),
            mensagem: issue.message,
          });
        }
        continue;
      }

      if (origem === 'body') req.body = result.data;
      else req.validated[origem] = result.data;
    }

    if (issues.length > 0) {
      throw new ValidationError(issues, issues[0]?.mensagem);
    }
    next();
  };
}
