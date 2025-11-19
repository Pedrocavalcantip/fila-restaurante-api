import { Router } from 'express';
import {
  listarRestaurantesProximos,
  obterPerfil,
  atualizarMeuPerfil,
} from '../controllers/clienteController';
import { TicketController } from '../controllers/ticketControllers';
import { autenticarCliente } from '../middlewares/autenticarCliente';
import { generalLimiter } from '../middlewares/rateLimiter';

const router = Router();

/**
 * @swagger
 * /cliente/restaurantes/proximos:
 *   get:
 *     tags: [Busca de Restaurantes]
 *     summary: Buscar restaurantes próximos
 *     description: Cliente busca restaurantes na mesma cidade/estado (filtro automático por localização)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de restaurantes próximos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 restaurantes:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/Restaurante'
 *                       - type: object
 *                         properties:
 *                           filaAtiva:
 *                             type: object
 *                             properties:
 *                               id: { type: string }
 *                               nome: { type: string }
 *                               ticketsAguardando: { type: integer }
 *       401:
 *         description: Token de cliente ausente ou inválido
 */
// Todas as rotas requerem autenticação de cliente
router.get(
  '/restaurantes/proximos',
  generalLimiter,
  autenticarCliente,
  listarRestaurantesProximos
);

/**
 * @swagger
 * /cliente/perfil:
 *   get:
 *     tags: [Autenticação Cliente]
 *     summary: Obter perfil do cliente
 *     description: Cliente autenticado obtém seus dados completos
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dados do cliente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Cliente'
 *       401:
 *         description: Token ausente ou inválido
 */
router.get('/perfil', generalLimiter, autenticarCliente, obterPerfil);

router.patch('/perfil', generalLimiter, autenticarCliente, atualizarMeuPerfil);

/**
 * @swagger
 * /cliente/restaurantes/{slug}/fila/entrar:
 *   post:
 *     tags: [Tickets Remotos (Cliente)]
 *     summary: Entrar na fila remotamente
 *     description: Cliente entra na fila virtual de um restaurante (cria ticket remoto)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *         example: restaurante-gourmet
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [quantidadePessoas, prioridade]
 *             properties:
 *               quantidadePessoas: { type: integer, minimum: 1, maximum: 20, example: 2 }
 *               prioridade: { type: string, enum: [NORMAL, FAST_LANE, VIP], example: "NORMAL" }
 *               observacoes: { type: string, example: "Preferência por mesa externa" }
 *     responses:
 *       201:
 *         description: Ticket criado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ticket: { $ref: '#/components/schemas/Ticket' }
 *                 restaurante:
 *                   type: object
 *                   properties:
 *                     nome: { type: string }
 *                     telefone: { type: string }
 *                     tempoMedioAtendimento: { type: integer }
 *       400:
 *         description: Cliente já tem ticket ativo neste restaurante
 *       403:
 *         description: Cliente bloqueado ou limite de reentradas excedido
 *       404:
 *         description: Restaurante não encontrado
 */
// ROTAS DE FILA - Cliente entra na fila remotamente
router.post(
  '/restaurantes/:slug/fila/entrar',
  generalLimiter,
  autenticarCliente,
  TicketController.entrarNaFilaRemoto
);

/**
 * @swagger
 * /cliente/meu-ticket:
 *   get:
 *     tags: [Tickets Remotos (Cliente)]
 *     summary: Listar meus tickets
 *     description: Cliente obtém todos os seus tickets (histórico completo)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de tickets do cliente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tickets:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Ticket'
 *       401:
 *         description: Token ausente ou inválido
 */
// ROTAS DE TICKET - Cliente gerencia seu ticket
router.get(
  '/meu-ticket',
  generalLimiter,
  autenticarCliente,
  TicketController.buscarMeuTicket
);

/**
 * @swagger
 * /cliente/ticket/{ticketId}/cancelar:
 *   post:
 *     tags: [Tickets Remotos (Cliente)]
 *     summary: Cancelar meu ticket
 *     description: Cliente cancela seu próprio ticket (antes de ser finalizado)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema: { type: string, format: uuid }
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
 *                 status: { type: string, example: "CANCELADO_CLIENTE" }
 *                 canceladoEm: { type: string, format: date-time }
 *       400:
 *         description: Ticket não pode ser cancelado (já finalizado ou no-show)
 *       401:
 *         description: Token ausente ou inválido
 *       404:
 *         description: Ticket não encontrado ou não pertence ao cliente
 */
router.post(
  '/ticket/:ticketId/cancelar',
  generalLimiter,
  autenticarCliente,
  TicketController.cancelarMeuTicket
);

export default router;
