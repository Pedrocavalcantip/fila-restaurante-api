import dotenv from 'dotenv';
import path from 'path';

// Carregar .env.test se existir, senão .env padrão
const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
const envPath = path.resolve(__dirname, '..', envFile);

dotenv.config({ path: envPath });

// Setup global para os testes
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Desabilitar logs em testes para melhor performance
if (process.env.NODE_ENV === 'test') {
  console.log = jest.fn();
  console.info = jest.fn();
  console.warn = jest.fn();
}

// Mock para prevenir a execução do server.ts
jest.mock('../src/server', () => ({}), { virtual: true });
