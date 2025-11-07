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

// POST /api/v1/tickets/filas/:filaId/tickets
// Criar novo ticket na fila (operador cria para o cliente presencialmente)
router.post('/filas/:filaId/tickets', criarTicketLimiter, autenticar, autorizarPapeis([PapelUsuario.ADMIN, PapelUsuario.OPERADOR]), TicketController.criarTicketLocal);

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

// POST /api/v1/tickets/:ticketId/chamar
// Chamar próximo ticket da fila
router.post('/:ticketId/chamar', operadorLimiter, autenticar, autorizarPapeis([PapelUsuario.ADMIN, PapelUsuario.OPERADOR]), TicketController.chamar);

// POST /api/v1/tickets/:ticketId/rechamar
// Rechamar ticket (cliente não apareceu na primeira chamada)
router.post('/:ticketId/rechamar', operadorLimiter, autenticar, autorizarPapeis([PapelUsuario.ADMIN, PapelUsuario.OPERADOR]), TicketController.rechamar);

// POST /api/v1/tickets/:ticketId/pular
// Pular ticket (volta para fila aguardando)
router.post('/:ticketId/pular', operadorLimiter, autenticar, autorizarPapeis([PapelUsuario.ADMIN, PapelUsuario.OPERADOR]), TicketController.pular);

// POST /api/v1/tickets/:ticketId/no-show
// Marcar no-show (cliente não compareceu após chamadas)
router.post('/:ticketId/no-show', operadorLimiter, autenticar, autorizarPapeis([PapelUsuario.ADMIN, PapelUsuario.OPERADOR]), TicketController.marcarNoShow);

// POST /api/v1/tickets/:ticketId/check-in
// Marcar check-in (aumenta prioridade do ticket)
router.post('/:ticketId/check-in', operadorLimiter, autenticar, autorizarPapeis([PapelUsuario.ADMIN, PapelUsuario.OPERADOR]), TicketController.marcarCheckIn);

// POST /api/v1/tickets/:ticketId/finalizar
// Finalizar atendimento (marca como concluído)
router.post('/:ticketId/finalizar', operadorLimiter, autenticar, autorizarPapeis([PapelUsuario.ADMIN, PapelUsuario.OPERADOR]), TicketController.finalizar);

// POST /api/v1/tickets/:ticketId/cancelar
// Cancelar ticket (operador cancela manualmente)
router.post('/:ticketId/cancelar', operadorLimiter, autenticar, autorizarPapeis([PapelUsuario.ADMIN, PapelUsuario.OPERADOR]), TicketController.cancelarPorOperador);

export default router;
