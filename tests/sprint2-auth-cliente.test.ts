import request from 'supertest';
import app from '../src/app';
import prisma from '../src/config/database';
import {
  criarDadosTesteCliente,
  limparDadosTesteCliente,
  clienteTestIds,
} from './helpers/clienteTestDatabase';

// Mock para evitar envio real de emails durante testes
jest.mock('../src/services/notificacaoService', () => ({
  ...jest.requireActual('../src/services/notificacaoService'),
  enviarBoasVindas: jest.fn().mockResolvedValue(undefined),
  enviarTicketChamado: jest.fn().mockResolvedValue(undefined),
}));

beforeAll(async () => {
  await prisma.$connect();
  await limparDadosTesteCliente();
  await criarDadosTesteCliente();
});

afterAll(async () => {
  await limparDadosTesteCliente();
  await prisma.$disconnect();
});

describe('Sprint 2 - Autenticação de Cliente', () => {
  describe('1. Cadastro de Cliente', () => {
    it('deve cadastrar um novo cliente com dados válidos', async () => {
      const response = await request(app)
        .post('/api/v1/auth/cliente/cadastro')
        .send({
          nomeCompleto: 'João Silva',
          email: 'joao.silva@email.com',
          senha: 'SenhaForte123!',
          telefone: '(11) 98888-8888',
          cidade: 'São Paulo',
          estado: 'SP',
          restauranteSlug: 'restaurante-sp-centro',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('cliente');
      expect(response.body.cliente.email).toBe('joao.silva@email.com');
      expect(response.body.cliente.nomeCompleto).toBe('João Silva');
      expect(response.body.cliente).not.toHaveProperty('senha'); // Não deve retornar senha

      // Verificar se o cliente foi criado no banco
      const clienteCriado = await prisma.cliente.findFirst({
        where: { email: 'joao.silva@email.com' },
      });
      expect(clienteCriado).toBeTruthy();
      expect(clienteCriado?.isVip).toBe(false);
      expect(clienteCriado?.bloqueado).toBe(false);
      expect(clienteCriado?.totalVisitas).toBe(0);
    });

    it('deve rejeitar cadastro com email duplicado', async () => {
      const response = await request(app)
        .post('/api/v1/auth/cliente/cadastro')
        .send({
          nomeCompleto: 'Outro Cliente',
          email: 'cliente1@teste.com', // Email já existente
          senha: 'SenhaForte123!',
          telefone: '(11) 99999-9999',
          cidade: 'São Paulo',
          estado: 'SP',
          restauranteSlug: 'restaurante-sp-centro',
        });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('erro');
    });

    it('deve validar campos obrigatórios com Zod', async () => {
      const response = await request(app)
        .post('/api/v1/auth/cliente/cadastro')
        .send({
          nomeCompleto: 'João',
          // Faltando email, senha, telefone, cidade, estado, restauranteSlug
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('erro');
    });

    it('deve validar formato de email', async () => {
      const response = await request(app)
        .post('/api/v1/auth/cliente/cadastro')
        .send({
          nomeCompleto: 'João Silva',
          email: 'email-invalido', // Email sem formato válido
          senha: 'SenhaForte123!',
          telefone: '(11) 98888-8888',
          cidade: 'São Paulo',
          estado: 'SP',
          restauranteSlug: 'restaurante-sp-centro',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('erro');
    });

    it('deve validar tamanho mínimo da senha', async () => {
      const response = await request(app)
        .post('/api/v1/auth/cliente/cadastro')
        .send({
          nomeCompleto: 'João Silva',
          email: 'joao2@email.com',
          senha: '123', // Senha muito curta
          telefone: '(11) 98888-8888',
          cidade: 'São Paulo',
          estado: 'SP',
          restauranteSlug: 'restaurante-sp-centro',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('erro');
    });

    it('deve normalizar email para lowercase', async () => {
      const response = await request(app)
        .post('/api/v1/auth/cliente/cadastro')
        .send({
          nomeCompleto: 'Maria Santos',
          email: 'MARIA.SANTOS@EMAIL.COM', // Email em uppercase
          senha: 'SenhaForte123!',
          telefone: '(11) 97777-7777',
          cidade: 'Campinas',
          estado: 'SP',
          restauranteSlug: 'restaurante-sp-centro',
        });

      expect(response.status).toBe(201);
      expect(response.body.cliente.email).toBe('maria.santos@email.com');
    });
  });

  describe('2. Login de Cliente', () => {
    it('deve fazer login com credenciais válidas e retornar JWT', async () => {
      const response = await request(app)
        .post('/api/v1/auth/cliente/login')
        .send({
          email: 'cliente1@teste.com',
          senha: 'senha123',
          restauranteSlug: 'restaurante-sp-centro',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('cliente');
      expect(response.body.cliente.email).toBe('cliente1@teste.com');
      expect(response.body.cliente).not.toHaveProperty('senha'); // Não deve retornar senha
    });

    it('deve rejeitar login com senha incorreta', async () => {
      const response = await request(app)
        .post('/api/v1/auth/cliente/login')
        .send({
          email: 'cliente1@teste.com',
          senha: 'senhaerrada',
          restauranteSlug: 'restaurante-sp-centro',
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('erro');
    });

    it('deve rejeitar login com email não cadastrado', async () => {
      const response = await request(app)
        .post('/api/v1/auth/cliente/login')
        .send({
          email: 'naoexiste@teste.com',
          senha: 'senha123',
          restauranteSlug: 'restaurante-sp-centro',
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('erro');
    });

    it('deve rejeitar login de cliente bloqueado', async () => {
      const response = await request(app)
        .post('/api/v1/auth/cliente/login')
        .send({
          email: 'clientebloqueado@teste.com',
          senha: 'senha123',
          restauranteSlug: 'restaurante-sp-zona-sul',
        });

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('erro');
      expect(response.body.erro).toMatch(/[Cc]onta bloqueada/i);
    });

    it('deve normalizar email para lowercase no login', async () => {
      const response = await request(app)
        .post('/api/v1/auth/cliente/login')
        .send({
          email: 'CLIENTE1@TESTE.COM', // Email em uppercase
          senha: 'senha123',
          restauranteSlug: 'restaurante-sp-centro',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
    });
  });

  describe('3. Validação de JWT', () => {
    let tokenCliente: string;

    beforeAll(async () => {
      // Fazer login para obter token válido
      const loginResponse = await request(app)
        .post('/api/v1/auth/cliente/login')
        .send({
          email: 'cliente1@teste.com',
          senha: 'senha123',
          restauranteSlug: 'restaurante-sp-centro',
        });
      tokenCliente = loginResponse.body.token;
    });

    it('deve acessar rota protegida com JWT válido', async () => {
      const response = await request(app)
        .get('/api/v1/cliente/perfil')
        .set('Authorization', `Bearer ${tokenCliente}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id');
      expect(response.body.email).toBe('cliente1@teste.com');
    });

    it('deve rejeitar acesso sem token', async () => {
      const response = await request(app)
        .get('/api/v1/cliente/perfil');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('erro');
    });

    it('deve rejeitar token inválido', async () => {
      const response = await request(app)
        .get('/api/v1/cliente/perfil')
        .set('Authorization', 'Bearer token-invalido-xyz');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('erro');
    });

    it('deve rejeitar token de cliente bloqueado', async () => {
      // Fazer login com cliente que será bloqueado
      const loginResponse = await request(app)
        .post('/api/v1/auth/cliente/login')
        .send({
          email: 'cliente1@teste.com',
          senha: 'senha123',
          restauranteSlug: 'restaurante-sp-centro',
        });
      const token = loginResponse.body.token;

      // Bloquear o cliente
      await prisma.cliente.update({
        where: { id: clienteTestIds.cliente1 },
        data: { bloqueado: true },
      });

      // Tentar acessar rota protegida
      const response = await request(app)
        .get('/api/v1/cliente/perfil')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('erro');

      // Desbloquear para não afetar outros testes
      await prisma.cliente.update({
        where: { id: clienteTestIds.cliente1 },
        data: { bloqueado: false },
      });
    });

    it('deve rejeitar token de cliente inexistente', async () => {
      const jwt = require('jsonwebtoken');
      const tokenFalso = jwt.sign(
        { clienteId: 'cliente-inexistente-id', tipo: 'CLIENTE' },
        process.env.JWT_SECRET || 'test-secret-key',
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get('/api/v1/cliente/perfil')
        .set('Authorization', `Bearer ${tokenFalso}`);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('erro');
    });
  });

  describe('4. Campos de Cliente', () => {
    it('deve retornar todos os campos relevantes do perfil', async () => {
      // Login com cliente VIP
      const loginResponse = await request(app)
        .post('/api/v1/auth/cliente/login')
        .send({
          email: 'clientevip@teste.com',
          senha: 'senha123',
          restauranteSlug: 'restaurante-sp-centro',
        });

      const perfilResponse = await request(app)
        .get('/api/v1/cliente/perfil')
        .set('Authorization', `Bearer ${loginResponse.body.token}`);

      expect(perfilResponse.status).toBe(200);
      expect(perfilResponse.body).toHaveProperty('id');
      expect(perfilResponse.body).toHaveProperty('nomeCompleto');
      expect(perfilResponse.body).toHaveProperty('email');
      expect(perfilResponse.body).toHaveProperty('telefone');
      expect(perfilResponse.body).toHaveProperty('cidade');
      expect(perfilResponse.body).toHaveProperty('estado');
      expect(perfilResponse.body).toHaveProperty('isVip');
      expect(perfilResponse.body).toHaveProperty('totalVisitas');
      expect(perfilResponse.body).toHaveProperty('totalFastLane');
      expect(perfilResponse.body).toHaveProperty('totalVip');
      expect(perfilResponse.body.isVip).toBe(true);
      expect(perfilResponse.body.totalVisitas).toBeGreaterThan(0);
    });
  });
});
