-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "senhaHash" TEXT,
ADD COLUMN     "ultimoLoginEm" TIMESTAMP(3);

UPDATE "clientes"
SET "senhaHash" = '$2b$10$fybJYTs4PuDAQu0xZNQONebGjrqLD5hKgAKjvrhm1shhda1fTs24m'
WHERE "senhaHash" IS NULL;

ALTER TABLE "clientes" ALTER COLUMN "senhaHash" SET NOT NULL;
