import app from './app';
import { logger } from './config/logger';
import prisma from './config/database';

const PORT = process.env.PORT || 3000;

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

  app.listen(PORT, () => {
    logger.info(`🚀 Servidor rodando na porta ${PORT}`);
    logger.info(`🔗 Health check: http://localhost:${PORT}/health`);
    logger.info(`🌍 Ambiente: ${process.env.NODE_ENV}`);
  });
}

startServer();

process.on('SIGINT', async () => {
  logger.info('⚠️  Encerrando servidor...');
  await prisma.$disconnect();
  process.exit(0);
});
