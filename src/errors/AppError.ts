/**
 * Erro base da aplicação. Tudo que for lançado como AppError é convertido pelo
 * errorHandler em uma resposta HTTP no formato { message, code, details? }.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string = 'ERRO_APLICACAO',
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
