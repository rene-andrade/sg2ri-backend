import { lerEnvTeste } from './testEnv.js';

// Executado antes de cada arquivo de teste, antes de src/config/env.ts ser carregado:
// valores definidos aqui têm precedência sobre o .env de desenvolvimento.
const envTeste = lerEnvTeste();

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = envTeste.JWT_SECRET ?? 'segredo-de-teste-com-tamanho-suficiente';
process.env.JWT_EXPIRES_IN = '1h';
// Sem .env.test, aponta para um endereço inexistente: testes sem banco nunca devem conectar.
process.env.DATABASE_URL = envTeste.DATABASE_URL ?? 'postgresql://sem-banco:sem-banco@127.0.0.1:1/sem-banco';
