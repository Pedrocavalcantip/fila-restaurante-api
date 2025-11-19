import { Router } from 'express';
import { login, quemSouEu } from '../controllers/authControllers'; 
import { cadastrar as cadastrarCliente, login as loginCliente } from '../controllers/authClienteController';
import { generalLimiter } from '../middlewares/rateLimiter';
import { autenticar } from '../middlewares/authMiddleware'; 

const router = Router();

/**
 * @swagger
 * /auth/cliente/cadastro:
 *   post:
 *     tags: [Autenticação Cliente]
 *     summary: Cadastrar novo cliente
 *     description: Cadastro público de cliente com email/senha (retorna JWT)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nome, email, telefone, senha, cidade, estado, restauranteSlug]
 *             properties:
 *               nome: { type: string, example: "Maria Silva" }
 *               email: { type: string, format: email, example: "maria@email.com" }
 *               telefone: { type: string, example: "+5511999999999" }
 *               senha: { type: string, minLength: 8, example: "senha12345" }
 *               cpf: { type: string, example: "12345678901" }
 *               cidade: { type: string, example: "São Paulo" }
 *               estado: { type: string, example: "SP" }
 *               restauranteSlug: { type: string, example: "restaurante-gourmet" }
 *     responses:
 *       201:
 *         description: Cliente cadastrado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token: { type: string }
 *                 cliente: { $ref: '#/components/schemas/Cliente' }
 *       409:
 *         description: Email já cadastrado
 *       400:
 *         description: Dados inválidos (validação Zod)
 */
router.post('/cliente/cadastro', generalLimiter, cadastrarCliente);

/**
 * @swagger
 * /auth/cliente/login:
 *   post:
 *     tags: [Autenticação Cliente]
 *     summary: Login de cliente
 *     description: Autenticação com email/senha (retorna JWT)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, senha, restauranteSlug]
 *             properties:
 *               email: { type: string, format: email, example: "maria@email.com" }
 *               senha: { type: string, example: "senha12345" }
 *               restauranteSlug: { type: string, example: "restaurante-gourmet" }
 *     responses:
 *       200:
 *         description: Login bem-sucedido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token: { type: string }
 *                 cliente: { $ref: '#/components/schemas/Cliente' }
 *       401:
 *         description: Credenciais inválidas
 *       403:
 *         description: Cliente bloqueado
 */
router.post('/cliente/login', generalLimiter, loginCliente);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Autenticação Operador]
 *     summary: Login de operador/admin
 *     description: Autenticação de operador ou administrador do restaurante
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, senha, restauranteSlug]
 *             properties:
 *               email: { type: string, format: email, example: "operador@restaurante.com" }
 *               senha: { type: string, example: "senha123" }
 *               restauranteSlug: { type: string, example: "restaurante-gourmet" }
 *     responses:
 *       200:
 *         description: Login bem-sucedido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token: { type: string }
 *                 usuario: { $ref: '#/components/schemas/Usuario' }
 *       401:
 *         description: Credenciais inválidas
 */
router.post('/login', generalLimiter, login); 

/**
 * @swagger
 * /auth/me:
 *   get:
 *     tags: [Autenticação Operador]
 *     summary: Obter dados do usuário autenticado
 *     description: Retorna informações do operador/admin logado
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dados do usuário
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Usuario'
 *       401:
 *         description: Token ausente ou inválido
 */
router.get('/me', autenticar, quemSouEu);

export default router;