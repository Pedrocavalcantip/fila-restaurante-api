/*
  Warnings:

  - The values [CHECK_IN_CONFIRMADO] on the enum `PrioridadeTicket` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `tempoEstimado` on the `tickets` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "TipoEntrada" AS ENUM ('LOCAL', 'REMOTO');

-- AlterEnum
BEGIN;
CREATE TYPE "PrioridadeTicket_new" AS ENUM ('NORMAL', 'FAST_LANE', 'VIP');
ALTER TABLE "public"."tickets" ALTER COLUMN "prioridade" DROP DEFAULT;
ALTER TABLE "tickets" ALTER COLUMN "prioridade" TYPE "PrioridadeTicket_new" USING ("prioridade"::text::"PrioridadeTicket_new");
ALTER TYPE "PrioridadeTicket" RENAME TO "PrioridadeTicket_old";
ALTER TYPE "PrioridadeTicket_new" RENAME TO "PrioridadeTicket";
DROP TYPE "public"."PrioridadeTicket_old";
ALTER TABLE "tickets" ALTER COLUMN "prioridade" SET DEFAULT 'NORMAL';
COMMIT;

-- AlterTable
ALTER TABLE "restaurantes" ADD COLUMN     "precoFastLane" DECIMAL(10,2) NOT NULL DEFAULT 17.00,
ADD COLUMN     "precoVip" DECIMAL(10,2) NOT NULL DEFAULT 28.00;

-- AlterTable
ALTER TABLE "tickets" DROP COLUMN "tempoEstimado",
ADD COLUMN     "clienteId" TEXT,
ADD COLUMN     "tipoEntrada" "TipoEntrada" NOT NULL DEFAULT 'LOCAL',
ADD COLUMN     "valorPrioridade" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "restauranteId" TEXT NOT NULL,
    "nomeCompleto" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "totalVisitas" INTEGER NOT NULL DEFAULT 0,
    "totalNoShows" INTEGER NOT NULL DEFAULT 0,
    "totalFastLane" INTEGER NOT NULL DEFAULT 0,
    "totalVip" INTEGER NOT NULL DEFAULT 0,
    "isVip" BOOLEAN NOT NULL DEFAULT false,
    "vipDesde" TIMESTAMP(3),
    "bloqueado" BOOLEAN NOT NULL DEFAULT false,
    "motivoBloqueio" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clientes_telefone_idx" ON "clientes"("telefone");

-- CreateIndex
CREATE INDEX "clientes_email_idx" ON "clientes"("email");

-- CreateIndex
CREATE INDEX "clientes_cidade_estado_idx" ON "clientes"("cidade", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_restauranteId_telefone_key" ON "clientes"("restauranteId", "telefone");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_restauranteId_email_key" ON "clientes"("restauranteId", "email");

-- CreateIndex
CREATE INDEX "tickets_clienteId_idx" ON "tickets"("clienteId");

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "restaurantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
