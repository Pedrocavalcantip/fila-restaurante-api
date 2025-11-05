import { Router } from 'express';
import { login, quemSouEu } from '../controllers/authControllers'; 
import { generalLimiter } from '../middlewares/rateLimiter';
import { autenticar } from '../middlewares/authMiddleware'; 

const router = Router();

router.post('/login', generalLimiter, login); 

router.get('/me', autenticar, quemSouEu);

export default router;