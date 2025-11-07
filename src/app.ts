import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { logger } from './config/logger';
import authRoutes from './routes/authRoutes';
import ticketRoutes from './routes/ticketRoutes';
import { tratarErros } from './middlewares/erroMiddleware';

dotenv.config();

const app = express();

// Middlewares Globais
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rotas de Teste
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

app.get('/', (req, res) => {
  logger.info('Rota raiz acessada');
  res.json({ message: 'Queue Manager API - Sprint 0 ✅' });
});

// Rotas da Aplicação
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/tickets', ticketRoutes);
app.use(tratarErros); 

export default app;