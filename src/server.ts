import { createServer } from 'http';
import { Server } from 'socket.io';
import app from './app';
import { logger } from './config/logger';
import prisma from './config/database';
import { SocketService } from './services/socketService';

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

  // OPERADOR: Cliente pode entrar em sala específica de uma fila
  socket.on('entrar-fila', (filaId: string) => {
    socket.join(`fila:${filaId}`);
    logger.info({ socketId: socket.id, filaId }, 'Operador entrou na sala da fila');
  });

  // OPERADOR: Cliente sai da sala da fila
  socket.on('sair-fila', (filaId: string) => {
    socket.leave(`fila:${filaId}`);
    logger.info({ socketId: socket.id, filaId }, 'Operador saiu da sala da fila');
  });

  // CLIENTE APP: Entrar na sala do ticket para receber notificações
  socket.on('entrar-ticket', async (dados: { ticketId: string; clienteId?: string }) => {
    const { ticketId, clienteId } = dados;
    
    if (!ticketId) {
      socket.emit('erro', { 
        mensagem: 'ticketId é obrigatório',
        codigo: 'DADOS_INVALIDOS' 
      });
      return;
    }

    await SocketService.validarEEntrarNaSalaTicket(socket, ticketId, clienteId);
  });

  // CLIENTE APP: Sair da sala do ticket
  socket.on('sair-ticket', (ticketId: string) => {
    if (ticketId) {
      socket.leave(`ticket:${ticketId}`);
      logger.info({ socketId: socket.id, ticketId }, 'Cliente saiu da sala do ticket');
      
      socket.emit('ticket:saiu', { 
        ticketId,
        timestamp: new Date().toISOString()
      });
    }
  });

  socket.on('disconnect', () => {
    logger.info({ socketId: socket.id, restauranteId }, 'Cliente desconectado');
  });
});

async function testDatabaseConnection() {
  try {
    await prisma.$connect();
    logger.info(' Conexão com PostgreSQL estabelecida');
  } catch (error) {
    logger.error(' Erro ao conectar com PostgreSQL:');
    logger.error(error);
    process.exit(1);
  }
}

async function startServer() {
  await testDatabaseConnection();

  httpServer.listen(PORT, () => {
    logger.info(`Servidor rodando na porta ${PORT}`);
    logger.info(`Health check: http://localhost:${PORT}/health`);
    logger.info(`Socket.io configurado com namespaces por restaurante`);
  });
}

startServer();

process.on('SIGINT', async () => {
  logger.info('Encerrando servidor...');
  io.close();
  await prisma.$disconnect();
  process.exit(0);
});
