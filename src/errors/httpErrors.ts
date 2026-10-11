import { AppError } from './AppError.js';

export class BadRequestError extends AppError {
  constructor(message = 'Requisição inválida.', code = 'REQUISICAO_INVALIDA', details?: unknown) {
    super(400, message, code, details);
  }
}

export interface ValidationIssue {
  campo: string;
  mensagem: string;
}

export class ValidationError extends AppError {
  constructor(details: ValidationIssue[], message = 'Dados inválidos na requisição.') {
    super(400, message, 'VALIDACAO', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Autenticação necessária.', code = 'NAO_AUTENTICADO') {
    super(401, message, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Você não tem permissão para realizar esta ação.', code = 'ACESSO_NEGADO') {
    super(403, message, code);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Recurso não encontrado.', code = 'NAO_ENCONTRADO') {
    super(404, message, code);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = 'CONFLITO', details?: unknown) {
    super(409, message, code, details);
  }
}

/** Violação de regra de negócio (RN01, RN02, antecedência, transições de status...). */
export class BusinessRuleError extends AppError {
  constructor(message: string, code = 'REGRA_DE_NEGOCIO', details?: unknown) {
    super(422, message, code, details);
  }
}
