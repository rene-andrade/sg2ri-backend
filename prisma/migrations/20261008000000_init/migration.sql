-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PROFESSOR', 'ALUNO');

-- CreateEnum
CREATE TYPE "TipoItem" AS ENUM ('LABORATORIO', 'SALA', 'AUDITORIO', 'EQUIPAMENTO');

-- CreateEnum
CREATE TYPE "StatusItem" AS ENUM ('ATIVO', 'MANUTENCAO', 'INATIVO');

-- CreateEnum
CREATE TYPE "StatusReserva" AS ENUM ('PENDENTE', 'APROVADA', 'RECUSADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "Turno" AS ENUM ('MANHA', 'TARDE', 'NOITE');

-- CreateEnum
CREATE TYPE "CondicaoItem" AS ENUM ('OK', 'DANIFICADO');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "department" TEXT NOT NULL DEFAULT '',
    "matricula" TEXT NOT NULL DEFAULT '',
    "avatar_url" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoItem" NOT NULL,
    "capacidade" INTEGER NOT NULL,
    "localizacao" TEXT NOT NULL,
    "descricao" TEXT NOT NULL DEFAULT '',
    "status" "StatusItem" NOT NULL DEFAULT 'ATIVO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservas" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "hora_inicio" VARCHAR(5) NOT NULL,
    "hora_fim" VARCHAR(5) NOT NULL,
    "turno" "Turno" NOT NULL,
    "finalidade" TEXT NOT NULL,
    "quantidade_pessoas" INTEGER,
    "status" "StatusReserva" NOT NULL DEFAULT 'PENDENTE',
    "prioridade_docente" BOOLEAN NOT NULL DEFAULT false,
    "observacao_admin" TEXT,
    "retirado_em" TIMESTAMP(3),
    "devolvido_em" TIMESTAMP(3),
    "condicao_devolucao" "CondicaoItem",
    "observacao_devolucao" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "reservas_codigo_key" ON "reservas"("codigo");

-- CreateIndex
CREATE INDEX "reservas_item_id_data_idx" ON "reservas"("item_id", "data");

-- CreateIndex
CREATE INDEX "reservas_usuario_id_idx" ON "reservas"("usuario_id");

-- CreateIndex
CREATE INDEX "reservas_status_idx" ON "reservas"("status");

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "itens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

