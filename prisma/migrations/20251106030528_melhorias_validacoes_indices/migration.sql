-- Repair migration recreated to match applied DB changes
-- Adds indexes present in the database for tickets table

-- CreateIndex
CREATE INDEX "tickets_filaId_status_entradaEm_idx" ON "tickets"("filaId", "status", "entradaEm");

-- CreateIndex
CREATE INDEX "tickets_restauranteId_telefoneCliente_criadoEm_idx" ON "tickets"("restauranteId", "telefoneCliente", "criadoEm");
