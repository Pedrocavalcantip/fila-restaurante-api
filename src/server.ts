import { createServer } from 'http';
import { Server } from 'socket.io';
import app from './app';
import { logger } from './config/logger';
import prisma from './config/database';

const PORT = process.env.PORT || 3000;

// Criar servidor HTTP para integrar com Socket.io
const httpServer = createServer(app);

// Configurar Socket.io
export const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Namespace por restaurante: /restaurante/:restauranteId
io.of(/^\/restaurante\/[\w-]+$/).on('connection', (socket) => {
  const namespace = socket.nsp.name; // Ex: /restaurante/abc-123
  const restauranteId = namespace.split('/')[2];
  
  logger.info({ 
    socketId: socket.id, 
    restauranteId, 
    namespace 
  }, 'Cliente conectado ao namespace do restaurante');

  // Cliente entra na sala do restaurante
  socket.join(`restaurante:${restauranteId}`);

  // Cliente pode entrar em sala específica de uma fila
  socket.on('entrar-fila', (filaId: string) => {
    socket.join(`fila:${filaId}`);
    logger.info({ socketId: socket.id, filaId }, 'Cliente entrou na sala da fila');
  });

  // Cliente sai da sala da fila
  socket.on('sair-fila', (filaId: string) => {
    socket.leave(`fila:${filaId}`);
    logger.info({ socketId: socket.id, filaId }, 'Cliente saiu da sala da fila');
  });

  socket.on('disconnect', () => {
    logger.info({ socketId: socket.id, restauranteId }, 'Cliente desconectado');
  });
});

async function testDatabaseConnection() {
  try {
    await prisma.$connect();
    logger.info('✅ Conexão com PostgreSQL estabelecida');
  } catch (error) {
    logger.error('❌ Erro ao conectar com PostgreSQL:');
    logger.error(error);
    process.exit(1);
  }
}

async function startServer() {
  await testDatabaseConnection();

  httpServer.listen(PORT, () => {
    logger.info(`🚀 Servidor rodando na porta ${PORT}`);
    logger.info(`🔗 Health check: http://localhost:${PORT}/health`);
    logger.info(`🌍 Ambiente: ${process.env.NODE_ENV}`);
    logger.info(`⚡ Socket.io configurado com namespaces por restaurante`);
  });
}

startServer();

process.on('SIGINT', async () => {
  logger.info('⚠️  Encerrando servidor...');
  io.close();
  await prisma.$disconnect();
  process.exit(0);
});
