import { Router } from 'express';
import {
  listarRestaurantesProximos,
  obterPerfil,
  atualizarMeuPerfil,
} from '../controllers/clienteController';
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

export default router;
