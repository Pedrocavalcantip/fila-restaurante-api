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

// Todas as rotas requerem autenticação de cliente
router.get(
  '/restaurantes/proximos',
  generalLimiter,
  autenticarCliente,
  listarRestaurantesProximos
);

router.get('/perfil', generalLimiter, autenticarCliente, obterPerfil);

router.patch('/perfil', generalLimiter, autenticarCliente, atualizarMeuPerfil);

// ROTAS DE FILA - Cliente entra na fila remotamente
router.post(
  '/restaurantes/:slug/fila/entrar',
  generalLimiter,
  autenticarCliente,
  TicketController.entrarNaFilaRemoto
);

// ROTAS DE TICKET - Cliente gerencia seu ticket
router.get(
  '/meu-ticket',
  generalLimiter,
  autenticarCliente,
  TicketController.buscarMeuTicket
);

router.post(
  '/ticket/:ticketId/cancelar',
  generalLimiter,
  autenticarCliente,
  TicketController.cancelarMeuTicket
);

export default router;
