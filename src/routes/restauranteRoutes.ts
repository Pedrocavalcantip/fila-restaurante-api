import { Router } from 'express';
import { cadastrar, buscar, atualizar } from '../controllers/restauranteController';
import { autenticar, autorizarPapeis } from '../middlewares/authMiddleware';
import { generalLimiter } from '../middlewares/rateLimiter';
import { PapelUsuario } from '@prisma/client';

const router = Router();

// Rota pública para cadastro de restaurante
router.post('/cadastro', generalLimiter, cadastrar);

// Rotas protegidas - apenas ADMIN
router.get(
  '/meu-restaurante',
  autenticar,
  autorizarPapeis([PapelUsuario.ADMIN]),
  buscar
);

router.patch(
  '/meu-restaurante',
  autenticar,
  autorizarPapeis([PapelUsuario.ADMIN]),
  atualizar
);

export default router;
