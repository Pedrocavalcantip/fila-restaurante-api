import { Router } from 'express';
import { cadastrar, buscar, buscarPorSlug, atualizar } from '../controllers/restauranteController';
import * as UsuarioController from '../controllers/usuarioController';
import { autenticar, autorizarPapeis } from '../middlewares/authMiddleware';
import { generalLimiter } from '../middlewares/rateLimiter';
import { PapelUsuario } from '@prisma/client';
import { uploadImagem } from '../middlewares/uploadMiddleware';

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
  autorizarPapeis([PapelUsuario.ADMIN, PapelUsuario.OPERADOR]),
  buscar
);

router.patch(
  '/meu-restaurante',
  autenticar,
  autorizarPapeis([PapelUsuario.ADMIN]),
  uploadImagem,
  atualizar
);

// Rotas de gestão de equipe
router.get(
  '/equipe',
  autenticar,
  autorizarPapeis([PapelUsuario.ADMIN]),
  UsuarioController.listar
);

router.post(
  '/equipe',
  autenticar,
  autorizarPapeis([PapelUsuario.ADMIN]),
  UsuarioController.criar
);

router.get(
  '/equipe/:id',
  autenticar,
  autorizarPapeis([PapelUsuario.ADMIN]),
  UsuarioController.buscar
);

router.delete(
  '/equipe/:id',
  autenticar,
  autorizarPapeis([PapelUsuario.ADMIN]),
  UsuarioController.deletar
);

/**
 * @swagger
 * /restaurantes/{slug}:
 *   get:
 *     tags: [Onboarding Restaurante]
 *     summary: Buscar restaurante por slug
 *     description: Rota pública para buscar dados básicos do restaurante pelo slug
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: Slug do restaurante
 *     responses:
 *       200:
 *         description: Dados básicos do restaurante
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string, format: uuid }
 *                 nome: { type: string }
 *                 slug: { type: string }
 *       404:
 *         description: Restaurante não encontrado
 */
// Rota pública para buscar restaurante por slug (DEVE FICAR POR ÚLTIMO)
router.get('/:slug', buscarPorSlug);

export default router;
