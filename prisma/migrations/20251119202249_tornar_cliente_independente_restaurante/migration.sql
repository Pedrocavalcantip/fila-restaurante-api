/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `clientes` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[telefone]` on the table `clientes` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "public"."clientes" DROP CONSTRAINT "clientes_restauranteId_fkey";

-- DropIndex
DROP INDEX "public"."clientes_restauranteId_email_key";

-- DropIndex
DROP INDEX "public"."clientes_restauranteId_telefone_key";

-- AlterTable
ALTER TABLE "clientes" ALTER COLUMN "restauranteId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "clientes_restauranteId_telefone_idx" ON "clientes"("restauranteId", "telefone");

-- CreateIndex
CREATE INDEX "clientes_restauranteId_email_idx" ON "clientes"("restauranteId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_email_key" ON "clientes"("email");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_telefone_key" ON "clientes"("telefone");

-- CreateIndex
CREATE INDEX "restaurantes_cidade_estado_idx" ON "restaurantes"("cidade", "estado");

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "restaurantes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
