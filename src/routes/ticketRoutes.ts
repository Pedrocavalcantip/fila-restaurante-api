import { Router } from 'express';
import { TicketController } from '../controllers/ticketControllers';
import { autenticar, autorizarPapeis } from '../middlewares/authMiddleware';
import { 
  criarTicketLimiter, 
  operadorLimiter, 
  consultaPublicaLimiter 
} from '../middlewares/rateLimiter';
import { PapelUsuario } from '@prisma/client';

const router = Router();

// ==================================================================================
// ROTAS PÚBLICAS (sem autenticação - para clientes consultarem seus tickets)
// ==================================================================================

/**
 * @swagger
 * /tickets/publico/{ticketId}:
 *   get:
 *     tags: [Consulta Pública]
 *     summary: Buscar ticket por ID (público)
 *     description: Cliente consulta ticket sem autenticação (acesso direto por ID)
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Detalhes do ticket
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Ticket'
 *                 - type: object
 *                   properties:
 *                     posicao: { type: integer, description: "Posição atual na fila" }
 *                     tempoEstimado: { type: integer, description: "Tempo estimado em minutos" }
 *       404:
 *         description: Ticket não encontrado
 */
// GET /api/v1/tickets/publico/:ticketId
// Buscar ticket por ID (acesso público para clientes)
router.get('/publico/:ticketId', consultaPublicaLimiter, TicketController.buscarPorId);

/**
 * @swagger
 * /tickets/publico/{ticketId}/posicao:
 *   get:
 *     tags: [Consulta Pública]
 *     summary: Consultar posição atual do ticket
 *     description: Cliente consulta posição e tempo estimado (polling para atualizações)
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Posição atual
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ticketId: { type: string }
 *                 posicao: { type: integer, example: 3 }
 *                 tempoEstimado: { type: integer, example: 15, description: "Tempo em minutos" }
 *                 tempoEstimadoFormatado: { type: string, example: "~15 minutos" }
 *       404:
 *         description: Ticket não encontrado
 */
// GET /api/v1/tickets/publico/:ticketId/posicao
// Consultar posição atual do ticket (polling para clientes)
router.get('/publico/:ticketId/posicao', consultaPublicaLimiter, TicketController.consultarPosicao);

// ==================================================================================
// ROTAS PRIVADAS (requerem autenticação - operadores/admins)
// restauranteId vem do TOKEN (req.usuario.restauranteId), NÃO da URL
// ==================================================================================

/**
 * @swagger
 * /tickets/filas/{filaId}/tickets:
 *   post:
 *     tags: [Tickets Locais (Operador)]
 *     summary: Criar ticket presencial
 *     description: Operador cria ticket para cliente no balcão (entrada local)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: filaId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nomeCliente, quantidadePessoas]
 *             properties:
 *               nomeCliente: { type: string, minLength: 3, example: "Carlos Souza" }
 *               telefone: { type: string, example: "+5511977777777" }
 *               quantidadePessoas: { type: integer, minimum: 1, maximum: 20, example: 4 }
 *               observacoes: { type: string, example: "Cliente preferencial" }
 *     responses:
 *       201:
 *         description: Ticket criado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Ticket'
 *       401:
 *         description: Token ausente ou inválido
 *       403:
 *         description: Usuário não tem permissão
 */
// POST /api/v1/tickets/filas/:filaId/tickets
// Criar novo ticket na fila (operador cria para o cliente presencialmente)
router.post('/filas/:filaId/tickets', criarTicketLimiter, autenticar, autorizarPapeis([PapelUsuario.ADMIN, PapelUsuario.OPERADOR]), TicketController.criarTicketLocal);

/**
 * @swagger
 * /tickets/estatisticas:
 *   get:
 *     tags: [Dashboard Administrativo]
 *     summary: Obter estatísticas do restaurante
 *     description: |
 *       Retorna estatísticas completas do restaurante incluindo:
 *       - Dados de hoje, últimos 7 dias e últimos 30 dias
 *       - Receita de Fast Lane (apenas Fast Lane é considerado)
 *       - Taxa de conversão e no-show
 *       - Top 10 clientes
 *       - Dados para gráficos
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Estatísticas do restaurante
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 hoje:
 *                   type: object
 *                   properties:
 *                     totalTickets: { type: integer }
 *                     finalizados: { type: integer }
 *                     cancelados: { type: integer }
 *                     noShows: { type: integer }
 *                     ticketsFastLane: { type: integer }
 *                     receitaFastLane: { type: number }
 *                     receitaTotal: { type: number }
 *                     totalPessoasAtendidas: { type: integer }
 *                     tempoMedioEspera: { type: number }
 *                     tempoMedioAtendimento: { type: number }
 *                     taxaConversao: { type: number }
 *                     taxaNoShow: { type: number }
 *                 ultimos7Dias:
 *                   type: object
 *                 ultimos30Dias:
 *                   type: object
 *                 clientes:
 *                   type: object
 *                   properties:
 *                     total: { type: integer }
 *                     vips: { type: integer }
 *                     topClientes: { type: array }
 *                 graficos:
 *                   type: object
 *                   properties:
 *                     ticketsPorDia: { type: array }
 *       401:
 *         description: Token ausente ou inválido
 */
// GET /api/v1/tickets/estatisticas
// Estatísticas do restaurante (Admin/Operador)
router.get('/estatisticas', operadorLimiter, autenticar, autorizarPapeis([PapelUsuario.ADMIN, PapelUsuario.OPERADOR]), TicketController.obterEstatisticas);

/**
 * @swagger
 * /tickets/filas/{filaId}/tickets/ativa:
 *   get:
 *     tags: [Tickets Locais (Operador)]
 *     summary: Listar fila ativa
 *     description: Operador visualiza todos os tickets aguardando ou chamados
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: filaId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Lista de tickets ativos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 fila:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     nome: { type: string }
 *                     status: { type: string }
 *                 tickets:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Ticket'
 *                 estatisticas:
 *                   type: object
 *                   properties:
 *                     totalAguardando: { type: integer }
 *                     totalChamados: { type: integer }
 *                     tempoMedioAtendimento: { type: integer }
 *       401:
 *         description: Token ausente ou inválido
 */
// GET /api/v1/tickets/filas/:filaId/tickets/ativa
// Listar fila ativa (tickets aguardando/chamados, com posição calculada)
router.get('/filas/:filaId/tickets/ativa', operadorLimiter, autenticar, autorizarPapeis([PapelUsuario.ADMIN, PapelUsuario.OPERADOR]), TicketController.listarFilaAtiva);

/**
 * @swagger
 * /tickets/filas/{filaId}/tickets/historico:
 *   get:
 *     tags: [Tickets Locais (Operador)]
 *     summary: Listar histórico de tickets
 *     description: Operador visualiza tickets finalizados, cancelados ou no-show (com busca)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: filaId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [FINALIZADO, CANCELADO, NO_SHOW] }
 *         description: Filtrar por status específico
 *       - in: query
 *         name: busca
 *         schema: { type: string }
 *         description: Buscar por nome, telefone ou número do ticket
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 10 }
 *     responses:
 *       200:
 *         description: Lista de tickets históricos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tickets:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Ticket'
 *                 paginacao:
 *                   type: object
 *                   properties:
 *                     totalItens: { type: integer }
 *                     paginaAtual: { type: integer }
 *                     limite: { type: integer }
 *                     totalPaginas: { type: integer }
 *       401:
 *         description: Token ausente ou inválido
 */
// GET /api/v1/tickets/filas/:filaId/tickets/historico
// Listar histórico de tickets (finalizados/cancelados/no-show, com busca)
router.get('/filas/:filaId/tickets/historico', operadorLimiter, autenticar, autorizarPapeis([PapelUsuario.ADMIN, PapelUsuario.OPERADOR]), TicketController.listarHistorico);

/**
 * @swagger
 * /tickets/{ticketId}:
 *   get:
 *     tags: [Tickets Locais (Operador)]
 *     summary: Buscar ticket por ID
 *     description: Operador busca detalhes completos de um ticket específico (validado por restaurante)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Detalhes do ticket
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Ticket'
 *                 - type: object
 *                   properties:
 *                     eventos:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           tipo: { type: string }
 *                           atorId: { type: string }
 *                           criadoEm: { type: string, format: date-time }
 *       401:
 *         description: Token ausente ou inválido
 *       404:
 *         description: Ticket não encontrado
 */
// GET /api/v1/tickets/:ticketId
// Buscar ticket por ID (privado - validado por restaurante do token)
router.get('/:ticketId', operadorLimiter, autenticar, autorizarPapeis([PapelUsuario.ADMIN, PapelUsuario.OPERADOR]), TicketController.buscarPorIdRestaurante);

// ==================================================================================
// AÇÕES DO OPERADOR (mudanças de estado do ticket)
// ==================================================================================

/**
 * @swagger
 * /tickets/{ticketId}/chamar:
 *   post:
 *     tags: [Tickets Locais (Operador)]
 *     summary: Chamar ticket
 *     description: Operador chama próximo ticket da fila (status AGUARDANDO → CHAMADO)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Ticket chamado com sucesso (WebSocket emitido)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Ticket'
 *       400:
 *         description: Ticket não está aguardando
 *       401:
 *         description: Token ausente ou inválido
 *       404:
 *         description: Ticket não encontrado
 */
// POST /api/v1/tickets/:ticketId/chamar
// Chamar próximo ticket da fila
router.post('/:ticketId/chamar', operadorLimiter, autenticar, autorizarPapeis([PapelUsuario.ADMIN, PapelUsuario.OPERADOR]), TicketController.chamar);

/**
 * @swagger
 * /tickets/{ticketId}/confirmar-presenca:
 *   post:
 *     tags: [Tickets Locais (Operador)]
 *     summary: Confirmar presença do cliente
 *     description: Operador confirma que o cliente chegou ao restaurante (status CHAMADO → MESA_PRONTA)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Presença confirmada com sucesso (WebSocket emitido)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Ticket'
 *       400:
 *         description: Ticket não está chamado
 *       401:
 *         description: Token ausente ou inválido
 *       404:
 *         description: Ticket não encontrado
 */
// POST /api/v1/tickets/:ticketId/confirmar-presenca
// Confirmar presença do cliente (CHAMADO → MESA_PRONTA)
router.post('/:ticketId/confirmar-presenca', operadorLimiter, autenticar, autorizarPapeis([PapelUsuario.ADMIN, PapelUsuario.OPERADOR]), TicketController.confirmarPresenca);

/**
 * @swagger
 * /tickets/{ticketId}/finalizar:
 *   post:
 *     tags: [Tickets Locais (Operador)]
 *     summary: Finalizar atendimento
 *     description: Operador finaliza atendimento (cliente foi atendido e pagou presencialmente)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Ticket finalizado com sucesso (estatísticas atualizadas)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string }
 *                 numero: { type: string }
 *                 status: { type: string, example: "FINALIZADO" }
 *                 valorPrioridade: { type: number }
 *                 pagamentoConfirmado: { type: boolean, example: true }
 *                 finalizadoEm: { type: string, format: date-time }
 *       400:
 *         description: Ticket não foi chamado ainda
 *       401:
 *         description: Token ausente ou inválido
 */
// POST /api/v1/tickets/:ticketId/finalizar
// Finalizar atendimento (marca como concluído)
router.post('/:ticketId/finalizar', operadorLimiter, autenticar, autorizarPapeis([PapelUsuario.ADMIN, PapelUsuario.OPERADOR]), TicketController.finalizar);

/**
 * @swagger
 * /tickets/{ticketId}/rechamar:
 *   post:
 *     tags: [Tickets Locais (Operador)]
 *     summary: Rechamar ticket
 *     description: Operador rechama ticket (cliente não apareceu na primeira chamada, incrementa contador)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Ticket rechamado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string }
 *                 numero: { type: string }
 *                 status: { type: string, example: "CHAMADO" }
 *                 contagemRechamada: { type: integer }
 *       400:
 *         description: Ticket não está no status CHAMADO
 *       401:
 *         description: Token ausente ou inválido
 */
// POST /api/v1/tickets/:ticketId/rechamar
// Rechamar ticket (cliente não apareceu na primeira chamada)
router.post('/:ticketId/rechamar', operadorLimiter, autenticar, autorizarPapeis([PapelUsuario.ADMIN, PapelUsuario.OPERADOR]), TicketController.rechamar);

/**
 * @swagger
 * /tickets/{ticketId}/pular:
 *   post:
 *     tags: [Tickets Locais (Operador)]
 *     summary: Pular ticket
 *     description: Operador pula ticket chamado e retorna para fila aguardando (status CHAMADO → AGUARDANDO)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Ticket pulado e retornou para fila
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string }
 *                 numero: { type: string }
 *                 status: { type: string, example: "AGUARDANDO" }
 *                 chamadoEm: { type: null }
 *       400:
 *         description: Ticket não está no status CHAMADO
 *       401:
 *         description: Token ausente ou inválido
 */
// POST /api/v1/tickets/:ticketId/pular
// Pular ticket (volta para fila aguardando)
router.post('/:ticketId/pular', operadorLimiter, autenticar, autorizarPapeis([PapelUsuario.ADMIN, PapelUsuario.OPERADOR]), TicketController.pular);

/**
 * @swagger
 * /tickets/{ticketId}/no-show:
 *   post:
 *     tags: [Tickets Locais (Operador)]
 *     summary: Marcar no-show
 *     description: Operador marca ticket como no-show (cliente não compareceu após chamadas, atualiza estatísticas)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Ticket marcado como no-show
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string }
 *                 numero: { type: string }
 *                 status: { type: string, example: "NO_SHOW" }
 *                 contagemNoShow: { type: integer }
 *       400:
 *         description: Ticket não está no status CHAMADO
 *       401:
 *         description: Token ausente ou inválido
 */
// POST /api/v1/tickets/:ticketId/no-show
// Marcar no-show (cliente não compareceu após chamadas)
router.post('/:ticketId/no-show', operadorLimiter, autenticar, autorizarPapeis([PapelUsuario.ADMIN, PapelUsuario.OPERADOR]), TicketController.marcarNoShow);

/**
 * @swagger
 * /tickets/{ticketId}/cancelar:
 *   post:
 *     tags: [Tickets Locais (Operador)]
 *     summary: Cancelar ticket
 *     description: Operador cancela ticket manualmente (registra motivo opcional)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               motivo: { type: string, maxLength: 500, example: "Cliente solicitou cancelamento" }
 *     responses:
 *       200:
 *         description: Ticket cancelado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string }
 *                 numero: { type: string }
 *                 status: { type: string, example: "CANCELADO" }
 *                 canceladoEm: { type: string, format: date-time }
 *                 observacoes: { type: string }
 *       400:
 *         description: Ticket já foi finalizado
 *       401:
 *         description: Token ausente ou inválido
 */
// POST /api/v1/tickets/:ticketId/cancelar
// Cancelar ticket (operador cancela manualmente)
router.post('/:ticketId/cancelar', operadorLimiter, autenticar, autorizarPapeis([PapelUsuario.ADMIN, PapelUsuario.OPERADOR]), TicketController.cancelarPorOperador);

export default router;
