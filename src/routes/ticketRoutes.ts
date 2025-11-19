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

// GET /api/v1/tickets/publico/:ticketId
// Buscar ticket por ID (acesso público para clientes)
router.get('/publico/:ticketId', consultaPublicaLimiter, TicketController.buscarPorId);

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

// GET /api/v1/tickets/filas/:filaId/tickets/historico
// Listar histórico de tickets (finalizados/cancelados/no-show, com busca)
router.get('/filas/:filaId/tickets/historico', operadorLimiter, autenticar, autorizarPapeis([PapelUsuario.ADMIN, PapelUsuario.OPERADOR]), TicketController.listarHistorico);

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

// POST /api/v1/tickets/:ticketId/rechamar
// Rechamar ticket (cliente não apareceu na primeira chamada)
router.post('/:ticketId/rechamar', operadorLimiter, autenticar, autorizarPapeis([PapelUsuario.ADMIN, PapelUsuario.OPERADOR]), TicketController.rechamar);

// POST /api/v1/tickets/:ticketId/pular
// Pular ticket (volta para fila aguardando)
router.post('/:ticketId/pular', operadorLimiter, autenticar, autorizarPapeis([PapelUsuario.ADMIN, PapelUsuario.OPERADOR]), TicketController.pular);

// POST /api/v1/tickets/:ticketId/no-show
// Marcar no-show (cliente não compareceu após chamadas)
router.post('/:ticketId/no-show', operadorLimiter, autenticar, autorizarPapeis([PapelUsuario.ADMIN, PapelUsuario.OPERADOR]), TicketController.marcarNoShow);

// POST /api/v1/tickets/:ticketId/finalizar
// Finalizar atendimento (marca como concluído)
router.post('/:ticketId/finalizar', operadorLimiter, autenticar, autorizarPapeis([PapelUsuario.ADMIN, PapelUsuario.OPERADOR]), TicketController.finalizar);

// POST /api/v1/tickets/:ticketId/cancelar
// Cancelar ticket (operador cancela manualmente)
router.post('/:ticketId/cancelar', operadorLimiter, autenticar, autorizarPapeis([PapelUsuario.ADMIN, PapelUsuario.OPERADOR]), TicketController.cancelarPorOperador);

export default router;
