import { Router } from 'express';
import { cadastrar, buscar, atualizar } from '../controllers/restauranteController';
import { autenticar, autorizarPapeis } from '../middlewares/authMiddleware';
import { generalLimiter } from '../middlewares/rateLimiter';
import { PapelUsuario } from '@prisma/client';

const router = Router();

/**
 * @swagger
 * /restaurantes/cadastro:
 *   post:
 *     tags: [Onboarding Restaurante]
 *     summary: Cadastrar novo restaurante
 *     description: Cadastro público de restaurante (cria Admin, Fila padrão, Templates de mensagem)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nome, slug, telefone, email, cidade, estado, emailAdmin, senhaAdmin]
 *             properties:
 *               nome: { type: string, example: "Restaurante Gourmet" }
 *               slug: { type: string, example: "restaurante-gourmet" }
 *               telefone: { type: string, example: "+5511988888888" }
 *               email: { type: string, format: email, example: "contato@restaurante.com" }
 *               cidade: { type: string, example: "São Paulo" }
 *               estado: { type: string, example: "SP" }
 *               emailAdmin: { type: string, format: email, example: "admin@restaurante.com" }
 *               senhaAdmin: { type: string, minLength: 8, example: "senha1234" }
 *               precoFastLane: { type: number, example: 15.00 }
 *               precoVip: { type: number, example: 25.00 }
 *               maxReentradasPorDia: { type: integer, example: 3 }
 *     responses:
 *       201:
 *         description: Restaurante cadastrado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 restaurante: { $ref: '#/components/schemas/Restaurante' }
 *                 admin: { $ref: '#/components/schemas/Usuario' }
 *                 linkAcesso: { type: string }
 *       409:
 *         description: Slug ou email admin já cadastrado
 *       400:
 *         description: Dados inválidos (validação Zod)
 */
// Rota pública para cadastro de restaurante
router.post('/cadastro', generalLimiter, cadastrar);

/**
 * @swagger
 * /restaurantes/meu-restaurante:
 *   get:
 *     tags: [Onboarding Restaurante]
 *     summary: Obter dados do meu restaurante
 *     description: Admin obtém informações completas do restaurante
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dados do restaurante
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Restaurante'
 *       401:
 *         description: Token ausente ou inválido
 *       403:
 *         description: Apenas ADMIN pode acessar
 */
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
