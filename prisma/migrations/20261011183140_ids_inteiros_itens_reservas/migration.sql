/*
  Itens e reservas passam a usar id inteiro sequencial (SERIAL); usuários seguem com UUID.
  As colunas são recriadas: esta migration só deve ser aplicada com as tabelas
  "itens" e "reservas" vazias (falha em "item_id NOT NULL" se houver reservas).
*/
-- DropForeignKey
ALTER TABLE "reservas" DROP CONSTRAINT "reservas_item_id_fkey";

-- AlterTable
ALTER TABLE "itens" DROP CONSTRAINT "itens_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "itens_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "reservas" DROP CONSTRAINT "reservas_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "item_id",
ADD COLUMN     "item_id" INTEGER NOT NULL,
ADD CONSTRAINT "reservas_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE INDEX "reservas_item_id_data_idx" ON "reservas"("item_id", "data");

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "itens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
