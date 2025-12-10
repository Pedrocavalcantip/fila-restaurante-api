import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import { logger } from './config/logger';
import { swaggerSpec } from './config/swagger';
import authRoutes from './routes/authRoutes';
import ticketRoutes from './routes/ticketRoutes';
import restauranteRoutes from './routes/restauranteRoutes';
import clienteRoutes from './routes/clienteRoutes';
import { tratarErros } from './middlewares/erroMiddleware';

dotenv.config();

const app = express();

// Trust proxy para Railway/Vercel
app.set('trust proxy', 1);

// Middlewares Globais
app.use(helmet({
  contentSecurityPolicy: false, // Permitir Swagger UI carregar estilos
}));
app.use(
  cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Documentação Swagger
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Fila Restaurante API Docs',
}));

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
  res.json({ 
    message: 'Fila Restaurante API - MVP ',
    version: '1.0.0',
    docs: '/api-docs',
    health: '/health',
  });
});

// Rotas da Aplicação
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/restaurantes', restauranteRoutes);
app.use('/api/v1/cliente', clienteRoutes);
app.use('/api/v1/tickets', ticketRoutes);
app.use(tratarErros); 

export default app;