# SG2RI — Backend

API REST do **Sistema de Gestão de Reserva de Recursos e Instalações**: autenticação por perfil, catálogo de itens reserváveis, fluxo de reservas (solicitação, aprovação, check-in/check-out) e relatórios de ocupação.

## Stack

- Node.js 20+ e TypeScript (ESM)
- Express 5: servidor HTTP e roteamento
- Prisma ORM 6 sobre PostgreSQL
- Zod 4: validação de payloads (mensagens em pt-BR)
- swagger-ui-express: documentação interativa OpenAPI 3.1, gerada a partir dos próprios schemas zod
- JWT (jsonwebtoken) e bcryptjs: autenticação
- cors e dotenv
- Vitest e Supertest: testes

## Como executar

```bash
npm install
cp .env.example .env          # ajuste DATABASE_URL e JWT_SECRET
npx prisma migrate deploy     # cria as tabelas (em desenvolvimento: npm run prisma:migrate)
npm run db:seed               # cria o administrador inicial (ADMIN_EMAIL / ADMIN_PASSWORD)
npm run dev                   # http://localhost:3000/api
```

A documentação interativa fica em **http://localhost:3000/api/docs**, e o JSON em `/api/docs.json`. Para usar as rotas protegidas, faça login em `POST /auth/login` e cole o token em **Authorize**.

### Variáveis de ambiente

| Variável | Descrição | Padrão |
|---|---|---|
| `DATABASE_URL` | Conexão PostgreSQL | obrigatória |
| `JWT_SECRET` | Segredo do JWT (≥ 16 caracteres) | obrigatória |
| `JWT_EXPIRES_IN` | Validade do token | `8h` |
| `PORT` | Porta HTTP | `3000` |
| `CORS_ORIGIN` | Origens permitidas, separadas por vírgula | `http://localhost:5173` |
| `APP_TIMEZONE` | Fuso usado nas regras de data e hora | `America/Sao_Paulo` |
| `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Administrador criado pelo seed | `admin@sg2ri.edu.br` / `admin1234` |

### Scripts

| Script | O que faz |
|---|---|
| `npm run dev` | Servidor em modo watch (tsx) |
| `npm run build` / `npm start` | Compila para `dist/` e executa |
| `npm run typecheck` | Checagem de tipos |
| `npm run prisma:migrate` | Cria e aplica migrations em desenvolvimento |
| `npm run prisma:deploy` | Aplica migrations pendentes |
| `npm run db:seed` | Cria o administrador inicial (idempotente) |
| `npm test` | Executa os testes |

## Estrutura

```
prisma/              schema, migrations e seed
src/
├── app.ts           montagem do Express (cors, json, rotas, docs, erros)
├── server.ts        inicialização e encerramento gracioso
├── config/env.ts    variáveis de ambiente validadas com zod
├── docs/openapi.ts  documento OpenAPI 3.1 (components gerados dos schemas zod)
├── errors/          AppError e subclasses HTTP
├── lib/             Prisma client e configuração do zod
├── middlewares/     authenticate, authorize, validate, notFound, errorHandler
├── shared/          constantes de domínio e utilitários de data e hora
└── modules/<auth|usuarios|itens|reservas|relatorios>/
     *.routes.ts · *.controller.ts · *.service.ts · *.schemas.ts (DTOs) · *.mapper.ts
tests/               unit/ · http/ (sem banco) · integration/ (PostgreSQL)
```

## Rotas (`/api`)

| Método | Rota | Perfil | Descrição |
|---|---|---|---|
| POST | `/auth/login` | público | Retorna `{ user, token }` |
| GET | `/auth/me` | autenticado | Usuário logado |
| PUT | `/usuarios/me` | autenticado | Atualiza o próprio perfil |
| PATCH | `/usuarios/me/senha` | autenticado | Troca de senha (exige a senha atual) |
| GET, POST | `/usuarios` | ADMIN | Lista (filtros `role`, `ativo`, `search`) e cadastra |
| POST | `/usuarios/importar` | ADMIN | Importação em massa via CSV (`{ csv }`) |
| GET, PUT, DELETE | `/usuarios/:id` | ADMIN | Detalha, atualiza e exclui |
| PATCH | `/usuarios/:id/ativo` | ADMIN | Ativa ou inativa |
| GET | `/itens`, `/itens/:id` | autenticado | Lista (filtros `tipo`, `status`, `search`) e detalha |
| POST, PUT, DELETE | `/itens`, `/itens/:id` | ADMIN | Cadastra, atualiza e exclui |
| GET | `/reservas` | autenticado | Lista (filtros `status`, `itemId`, `data`, `dataInicio`, `dataFim`) |
| GET | `/reservas/minhas` | autenticado | Reservas do usuário logado |
| GET | `/reservas/disponibilidade` | autenticado | `available` / `priority` / `unavailable` e os conflitos |
| POST | `/reservas` | autenticado | Solicita uma reserva |
| GET | `/reservas/:id` | autenticado | Detalha |
| PATCH | `/reservas/:id/cancelar` | dono ou ADMIN | Cancela uma reserva pendente |
| PATCH | `/reservas/:id/aprovar`, `/recusar` | ADMIN | Parecer sobre uma reserva pendente |
| PATCH | `/reservas/:id/retirada`, `/devolucao` | ADMIN | Check-in e check-out |
| GET | `/relatorios/ocupacao?dataInicio&dataFim` | ADMIN | Ocupação e ociosidade do período |
| GET | `/health` | público | Verifica se a API está no ar |

### Erros

Todas as respostas de erro seguem o mesmo formato:

```json
{ "message": "Alunos podem reservar salas de estudo por no máximo 2 horas consecutivas.", "code": "RN01", "details": null }
```

| Status | Quando |
|---|---|
| 400 | Validação (`code: VALIDACAO`, `details: [{ campo, mensagem }]`) ou JSON inválido |
| 401 | Token ausente, inválido ou expirado, conta inativa, credenciais inválidas |
| 403 | Perfil sem permissão |
| 404 | Registro ou rota inexistente |
| 409 | E-mail duplicado, conflito de horário, item ou usuário com reservas |
| 422 | Regra de negócio (`RN01`, `ANTECEDENCIA_24H`, `TRANSICAO_INVALIDA`, `SENHA_ATUAL_INCORRETA`...) |

## Regras de negócio

Ao solicitar uma reserva, a API verifica:

1. O item precisa estar **ATIVO**.
2. O horário de fim precisa ser posterior ao de início, e a data e a hora não podem ter passado.
3. **Equipamentos** exigem **24 horas de antecedência**.
4. **RN01**: alunos reservam **salas** por no máximo **2 horas**.
5. A quantidade de pessoas não pode exceder a capacidade do item.
6. **Conflito de horário**: uma reserva PENDENTE ou APROVADA sobreposta no mesmo item e data bloqueia a solicitação (409).
7. **RN02**: professores têm prioridade em **equipamentos**. Se todos os conflitos forem pedidos **pendentes de alunos**, a reserva é criada com `prioridadeDocente: true`. Quando o administrador a aprova, os pedidos conflitantes dos alunos são **recusados automaticamente**. Reservas já aprovadas nunca são reabertas.

As operações de criação e aprovação rodam em transação, com um lock por item e data (`pg_advisory_xact_lock`). Assim, duas solicitações simultâneas não conseguem ocupar o mesmo horário.

Transições de status permitidas:

- PENDENTE → APROVADA, RECUSADA ou CANCELADA
- APROVADA → check-in (`retiradoEm`) → check-out (`devolvidoEm`, `condicaoDevolucao`)

Na devolução com condição `DANIFICADO`, a descrição da avaria é obrigatória.

## Testes

```bash
npm test
```

- **unit/**: regras de reserva, datas, cálculo do relatório, parser de CSV e mapeamento de erros.
- **http/**: roteamento, autenticação, autorização, validação e Swagger, com o Prisma mockado (não precisa de banco).
- **integration/**: fluxo completo contra um PostgreSQL real. Copie `.env.test.example` para `.env.test`, apontando para um **banco exclusivo de testes**. As migrations são aplicadas automaticamente e a suíte **apaga os dados das tabelas** desse banco. Sem `.env.test`, a suíte é pulada.

## Compatibilidade com o frontend

O contrato segue o que o `sg2ri-frontend` já espera:

- base `http://localhost:3000/api`
- `Authorization: Bearer`
- `{ user, token }` no login
- erros com `message`
- os mesmos nomes de campos (`name`, `role`, `itemNome`, `usuarioRole`, `horario`...)

Ao integrar, há duas diferenças a ajustar no frontend:

- `POST /reservas` recebe `horaInicio`/`horaFim` em vez de `horario`. O usuário vem do token, não do body.
- A gestão de usuários passa a usar as rotas `/usuarios`. Hoje ela é 100% local no frontend.
