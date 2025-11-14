import dotenv from 'dotenv';

// Carregar variáveis de ambiente do .env
dotenv.config();

// Setup global para os testes
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Mock para prevenir a execução do server.ts
jest.mock('../src/server', () => ({}), { virtual: true });
