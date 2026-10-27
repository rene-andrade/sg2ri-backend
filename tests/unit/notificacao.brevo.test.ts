import { afterEach, describe, expect, it, vi } from 'vitest';
import { enviarViaBrevo, interpretarRemetente } from '../../src/modules/notificacoes/notificacao.service.js';

describe('interpretarRemetente', () => {
  it.each([
    ['SG2RI <no-reply@sg2ri.edu.br>', { name: 'SG2RI', email: 'no-reply@sg2ri.edu.br' }],
    ['"Portal SG2RI" <contato@x.br>', { name: 'Portal SG2RI', email: 'contato@x.br' }],
    ['<so-email@x.br>', { email: 'so-email@x.br' }],
    ['  simples@x.br ', { email: 'simples@x.br' }],
  ])('%s', (entrada, esperado) => {
    expect(interpretarRemetente(entrada)).toEqual(esperado);
  });
});

describe('enviarViaBrevo', () => {
  afterEach(() => vi.unstubAllGlobals());

  const mensagem = { para: ['a@x.br', 'b@x.br'], assunto: 'Assunto', texto: 'Corpo' };

  it('envia o e-mail transacional com a chave no cabeçalho', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"messageId":"1"}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    await enviarViaBrevo('chave-teste', 'SG2RI <no-reply@x.br>', mensagem);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.headers['api-key']).toBe('chave-teste');
    expect(JSON.parse(init.body)).toEqual({
      sender: { name: 'SG2RI', email: 'no-reply@x.br' },
      to: [{ email: 'a@x.br' }, { email: 'b@x.br' }],
      subject: 'Assunto',
      textContent: 'Corpo',
    });
  });

  it('propaga a resposta de erro do Brevo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"code":"unauthorized"}', { status: 401 })));
    await expect(enviarViaBrevo('errada', 'x@x.br', mensagem)).rejects.toThrow('Brevo respondeu 401');
  });
});
