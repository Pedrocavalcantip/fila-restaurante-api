-- CreateEnum
CREATE TYPE "StatusRestaurante" AS ENUM ('ATIVO', 'SUSPENSO', 'INATIVO');

-- CreateEnum
CREATE TYPE "PoliticaOrdemFila" AS ENUM ('FIFO', 'PRIORIDADE', 'ENVELHECIMENTO', 'HIBRIDO');

-- CreateEnum
CREATE TYPE "StatusFila" AS ENUM ('ATIVA', 'PAUSADA', 'ENCERRADA');

-- CreateEnum
CREATE TYPE "StatusTicket" AS ENUM ('AGUARDANDO', 'CHAMADO', 'ATENDENDO', 'FINALIZADO', 'CANCELADO', 'NO_SHOW', 'PAGAMENTO_PENDENTE');

-- CreateEnum
CREATE TYPE "PrioridadeTicket" AS ENUM ('NORMAL', 'FAST_LANE', 'VIP', 'CHECK_IN_CONFIRMADO');

-- CreateEnum
CREATE TYPE "TipoEventoTicket" AS ENUM ('CRIADO', 'CHECK_IN_REALIZADO', 'CHAMADO', 'RECHAMADO', 'PULADO', 'NO_SHOW', 'ATENDENDO', 'FINALIZADO', 'CANCELADO', 'PAGAMENTO_INICIADO', 'PAGAMENTO_COMPLETO', 'UPGRADE_REALIZADO');

-- CreateEnum
CREATE TYPE "TipoAtor" AS ENUM ('CLIENTE', 'OPERADOR', 'ADMIN', 'SISTEMA');

-- CreateEnum
CREATE TYPE "PapelUsuario" AS ENUM ('ADMIN', 'OPERADOR');

-- CreateEnum
CREATE TYPE "StatusUsuario" AS ENUM ('ATIVO', 'INATIVO', 'SUSPENSO');

-- CreateEnum
CREATE TYPE "CanalNotificacao" AS ENUM ('SMS', 'WHATSAPP', 'EMAIL', 'PUSH');

-- CreateEnum
CREATE TYPE "StatusNotificacao" AS ENUM ('PENDENTE', 'ENVIADO', 'ENTREGUE', 'FALHOU', 'CANCELADO');

-- CreateEnum
CREATE TYPE "MetodoPagamento" AS ENUM ('CARTAO_CREDITO', 'CARTAO_DEBITO', 'PIX', 'DINHEIRO', 'OUTRO');

-- CreateEnum
CREATE TYPE "StatusPagamento" AS ENUM ('PENDENTE', 'AUTORIZADO', 'CAPTURADO', 'REEMBOLSADO', 'FALHOU', 'CANCELADO');

-- CreateEnum
CREATE TYPE "StatusWebhook" AS ENUM ('ATIVO', 'INATIVO', 'SUSPENSO');

-- CreateEnum
CREATE TYPE "StatusEntregaWebhook" AS ENUM ('PENDENTE', 'SUCESSO', 'FALHOU', 'TENTANDO_NOVAMENTE');

-- CreateTable
CREATE TABLE "restaurantes" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "cidade" TEXT,
    "estado" TEXT,
    "fusoHorario" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "idioma" TEXT NOT NULL DEFAULT 'pt-BR',
    "status" "StatusRestaurante" NOT NULL DEFAULT 'ATIVO',
    "horariosFuncionamento" JSONB,
    "toleranciaNoShow" INTEGER NOT NULL DEFAULT 10,
    "avisosNoShow" INTEGER NOT NULL DEFAULT 2,
    "penalidadeNoShow" INTEGER NOT NULL DEFAULT 0,
    "maxReentradasPorDia" INTEGER NOT NULL DEFAULT 3,
    "permiteFastLane" BOOLEAN NOT NULL DEFAULT false,
    "smsAtivado" BOOLEAN NOT NULL DEFAULT true,
    "whatsappAtivado" BOOLEAN NOT NULL DEFAULT false,
    "emailAtivado" BOOLEAN NOT NULL DEFAULT true,
    "pushAtivado" BOOLEAN NOT NULL DEFAULT true,
    "maxTicketsPorHora" INTEGER NOT NULL DEFAULT 100,
    "maxConexoesSimultaneas" INTEGER NOT NULL DEFAULT 1000,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "filas" (
    "id" TEXT NOT NULL,
    "restauranteId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "slug" TEXT NOT NULL,
    "politicaOrdem" "PoliticaOrdemFila" NOT NULL DEFAULT 'FIFO',
    "maxSimultaneos" INTEGER NOT NULL DEFAULT 50,
    "maxEntradasPorHora" INTEGER NOT NULL DEFAULT 100,
    "horariosEspecificos" JSONB,
    "fastLaneAtivado" BOOLEAN NOT NULL DEFAULT false,
    "fastLanePreco" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "fastLaneMaxPorcentagem" INTEGER NOT NULL DEFAULT 20,
    "rotuloPublico" TEXT,
    "status" "StatusFila" NOT NULL DEFAULT 'ATIVA',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "filas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "restauranteId" TEXT NOT NULL,
    "filaId" TEXT NOT NULL,
    "status" "StatusTicket" NOT NULL DEFAULT 'AGUARDANDO',
    "prioridade" "PrioridadeTicket" NOT NULL DEFAULT 'NORMAL',
    "tempoEstimado" INTEGER,
    "rotuloPublico" TEXT,
    "numeroTicket" TEXT NOT NULL,
    "nomeCliente" TEXT NOT NULL,
    "telefoneCliente" TEXT,
    "emailCliente" TEXT,
    "aceitaSms" BOOLEAN NOT NULL DEFAULT true,
    "aceitaWhatsapp" BOOLEAN NOT NULL DEFAULT false,
    "aceitaEmail" BOOLEAN NOT NULL DEFAULT true,
    "aceitaPush" BOOLEAN NOT NULL DEFAULT false,
    "contagemNoShow" INTEGER NOT NULL DEFAULT 0,
    "contagemReentrada" INTEGER NOT NULL DEFAULT 0,
    "contagemRechamada" INTEGER NOT NULL DEFAULT 0,
    "entradaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkInEm" TIMESTAMP(3),
    "chamadoEm" TIMESTAMP(3),
    "atendidoEm" TIMESTAMP(3),
    "finalizadoEm" TIMESTAMP(3),
    "canceladoEm" TIMESTAMP(3),
    "observacoes" TEXT,
    "categoriaServico" TEXT,
    "duracaoAtendimento" INTEGER,
    "pagamentoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_ticket" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "restauranteId" TEXT NOT NULL,
    "tipo" "TipoEventoTicket" NOT NULL,
    "tipoAtor" "TipoAtor" NOT NULL,
    "atorId" TEXT,
    "metadados" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "restauranteId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha" TEXT NOT NULL,
    "papel" "PapelUsuario" NOT NULL,
    "status" "StatusUsuario" NOT NULL DEFAULT 'ATIVO',
    "doisFatoresAtivado" BOOLEAN NOT NULL DEFAULT false,
    "segredoDoisFatores" TEXT,
    "ultimoLoginEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacoes" (
    "id" TEXT NOT NULL,
    "restauranteId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "canal" "CanalNotificacao" NOT NULL,
    "template" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "status" "StatusNotificacao" NOT NULL DEFAULT 'PENDENTE',
    "destinatario" TEXT NOT NULL,
    "provedorId" TEXT,
    "respostaProvedor" JSONB,
    "enviadoEm" TIMESTAMP(3),
    "entregueEm" TIMESTAMP(3),
    "falhouEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notificacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagamentos" (
    "id" TEXT NOT NULL,
    "restauranteId" TEXT NOT NULL,
    "provedor" TEXT NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "moeda" TEXT NOT NULL DEFAULT 'BRL',
    "metodo" "MetodoPagamento" NOT NULL,
    "status" "StatusPagamento" NOT NULL DEFAULT 'PENDENTE',
    "pagamentoIdProvedor" TEXT,
    "dadosProvedor" JSONB,
    "valorReembolsado" DECIMAL(10,2),
    "reembolsadoEm" TIMESTAMP(3),
    "motivoReembolso" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pagamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooks" (
    "id" TEXT NOT NULL,
    "restauranteId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "segredo" TEXT NOT NULL,
    "eventos" TEXT[],
    "status" "StatusWebhook" NOT NULL DEFAULT 'ATIVO',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entregas_webhook" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "evento" TEXT NOT NULL,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "status" "StatusEntregaWebhook" NOT NULL DEFAULT 'PENDENTE',
    "payload" JSONB NOT NULL,
    "resposta" JSONB,
    "codigoStatus" INTEGER,
    "mensagemErro" TEXT,
    "enviadoEm" TIMESTAMP(3),
    "sucessoEm" TIMESTAMP(3),
    "falhouEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entregas_webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates_mensagem" (
    "id" TEXT NOT NULL,
    "restauranteId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "idioma" TEXT NOT NULL DEFAULT 'pt-BR',
    "assunto" TEXT,
    "conteudo" TEXT NOT NULL,
    "variaveis" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "templates_mensagem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "restaurantes_slug_key" ON "restaurantes"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "filas_restauranteId_slug_key" ON "filas"("restauranteId", "slug");

-- CreateIndex
CREATE INDEX "tickets_restauranteId_status_idx" ON "tickets"("restauranteId", "status");

-- CreateIndex
CREATE INDEX "tickets_filaId_status_prioridade_idx" ON "tickets"("filaId", "status", "prioridade");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_filaId_numeroTicket_key" ON "tickets"("filaId", "numeroTicket");

-- CreateIndex
CREATE INDEX "eventos_ticket_ticketId_idx" ON "eventos_ticket"("ticketId");

-- CreateIndex
CREATE INDEX "eventos_ticket_restauranteId_tipo_criadoEm_idx" ON "eventos_ticket"("restauranteId", "tipo", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "usuarios_restauranteId_papel_idx" ON "usuarios"("restauranteId", "papel");

-- CreateIndex
CREATE INDEX "notificacoes_ticketId_idx" ON "notificacoes"("ticketId");

-- CreateIndex
CREATE INDEX "notificacoes_restauranteId_status_idx" ON "notificacoes"("restauranteId", "status");

-- CreateIndex
CREATE INDEX "pagamentos_restauranteId_status_idx" ON "pagamentos"("restauranteId", "status");

-- CreateIndex
CREATE INDEX "pagamentos_pagamentoIdProvedor_idx" ON "pagamentos"("pagamentoIdProvedor");

-- CreateIndex
CREATE INDEX "entregas_webhook_webhookId_status_idx" ON "entregas_webhook"("webhookId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "templates_mensagem_restauranteId_chave_idioma_key" ON "templates_mensagem"("restauranteId", "chave", "idioma");

-- AddForeignKey
ALTER TABLE "filas" ADD CONSTRAINT "filas_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "restaurantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "restaurantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_filaId_fkey" FOREIGN KEY ("filaId") REFERENCES "filas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_pagamentoId_fkey" FOREIGN KEY ("pagamentoId") REFERENCES "pagamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_ticket" ADD CONSTRAINT "eventos_ticket_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_ticket" ADD CONSTRAINT "eventos_ticket_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "restaurantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "restaurantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "restaurantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "restaurantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "restaurantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas_webhook" ADD CONSTRAINT "entregas_webhook_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "webhooks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates_mensagem" ADD CONSTRAINT "templates_mensagem_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "restaurantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
