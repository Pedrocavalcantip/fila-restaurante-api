import { Router } from 'express';
import { login, quemSouEu } from '../controllers/authControllers'; 
import { cadastrar as cadastrarCliente, login as loginCliente } from '../controllers/authClienteController';
import { generalLimiter } from '../middlewares/rateLimiter';
import { autenticar } from '../middlewares/authMiddleware'; 

const router = Router();

router.post('/cliente/cadastro', generalLimiter, cadastrarCliente);
router.post('/cliente/login', generalLimiter, loginCliente);

router.post('/login', generalLimiter, login); 

router.get('/me', autenticar, quemSouEu);

export default router;