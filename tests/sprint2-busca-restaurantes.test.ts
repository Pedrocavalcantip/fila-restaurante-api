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

let tokenCliente1: string;
let tokenCliente2: string;

beforeAll(async () => {
  await prisma.$connect();
  await limparDadosTesteCliente();
  await criarDadosTesteCliente();

  // Fazer login com cliente de São Paulo
  const loginResponse1 = await request(app)
    .post('/api/v1/auth/cliente/login')
    .send({
      email: 'cliente1@teste.com',
      senha: 'senha123',
      restauranteSlug: 'restaurante-sp-centro',
    });
  tokenCliente1 = loginResponse1.body.token;

  // Fazer login com cliente do Rio de Janeiro (bloqueado, mas desbloqueamos para o teste)
  await prisma.cliente.update({
    where: { id: clienteTestIds.clienteBloqueado },
    data: { bloqueado: false },
  });

  const loginResponse2 = await request(app)
    .post('/api/v1/auth/cliente/login')
    .send({
      email: 'clientebloqueado@teste.com',
      senha: 'senha123',
      restauranteSlug: 'restaurante-sp-zona-sul',
    });
  tokenCliente2 = loginResponse2.body.token;
});

afterAll(async () => {
  await limparDadosTesteCliente();
  await prisma.$disconnect();
});

describe('Sprint 2 - Busca de Restaurantes Próximos', () => {
  describe('1. Filtro por Localização do Cliente', () => {
    it('deve listar restaurantes da mesma cidade e estado do cliente', async () => {
      // Cliente1 é de São Paulo/SP
      const response = await request(app)
        .get('/api/v1/cliente/restaurantes/proximos')
        .set('Authorization', `Bearer ${tokenCliente1}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('restaurantes');
      expect(response.body).toHaveProperty('total');
      expect(response.body.total).toBeGreaterThan(0);

      // Verificar que todos os restaurantes são de São Paulo/SP
      const restaurantes = response.body.restaurantes;
      restaurantes.forEach((rest: any) => {
        expect(rest.cidade).toBe('São Paulo');
        expect(rest.estado).toBe('SP');
      });
    });

    it('deve retornar lista vazia para cliente de localização sem restaurantes', async () => {
      // Cliente do Rio de Janeiro não tem restaurantes próximos
      const response = await request(app)
        .get('/api/v1/cliente/restaurantes/proximos')
        .set('Authorization', `Bearer ${tokenCliente2}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('restaurantes');
      expect(response.body.restaurantes).toEqual([]);
      expect(response.body.total).toBe(0);
    });

    it('deve incluir informações completas do restaurante', async () => {
      const response = await request(app)
        .get('/api/v1/cliente/restaurantes/proximos')
        .set('Authorization', `Bearer ${tokenCliente1}`);

      expect(response.status).toBe(200);
      expect(response.body.total).toBeGreaterThan(0);

      const restaurante = response.body.restaurantes[0];
      expect(restaurante).toHaveProperty('id');
      expect(restaurante).toHaveProperty('nome');
      expect(restaurante).toHaveProperty('slug');
      expect(restaurante).toHaveProperty('cidade');
      expect(restaurante).toHaveProperty('estado');
      expect(restaurante).toHaveProperty('status');
    });

    it('deve incluir informações da fila ativa do restaurante', async () => {
      const response = await request(app)
        .get('/api/v1/cliente/restaurantes/proximos')
        .set('Authorization', `Bearer ${tokenCliente1}`);

      expect(response.status).toBe(200);

      const restaurante = response.body.restaurantes[0];
      expect(restaurante).toHaveProperty('filas');
      expect(Array.isArray(restaurante.filas)).toBe(true);

      if (restaurante.filas.length > 0) {
        const fila = restaurante.filas[0];
        expect(fila).toHaveProperty('id');
        expect(fila).toHaveProperty('nome');
        expect(fila).toHaveProperty('slug');
        expect(fila).toHaveProperty('status');
      }
    });

    it('deve incluir contagem de tickets aguardando', async () => {
      // Criar alguns tickets para testar
      await prisma.ticket.create({
        data: {
          restauranteId: clienteTestIds.restaurante1,
          filaId: clienteTestIds.fila1,
          nomeCliente: 'Cliente Teste',
          numeroTicket: 'A-001',
          status: 'AGUARDANDO',
          prioridade: 'NORMAL',
          tipoEntrada: 'LOCAL',
        },
      });

      await prisma.ticket.create({
        data: {
          restauranteId: clienteTestIds.restaurante1,
          filaId: clienteTestIds.fila1,
          nomeCliente: 'Cliente Teste 2',
          numeroTicket: 'A-002',
          status: 'AGUARDANDO',
          prioridade: 'NORMAL',
          tipoEntrada: 'LOCAL',
        },
      });

      const response = await request(app)
        .get('/api/v1/cliente/restaurantes/proximos')
        .set('Authorization', `Bearer ${tokenCliente1}`);

      expect(response.status).toBe(200);

      const restaurante = response.body.restaurantes[0];
      expect(restaurante.filas[0]).toHaveProperty('_count');
      expect(restaurante.filas[0]._count.tickets).toBeGreaterThanOrEqual(2);
    });
  });

  describe('2. Segurança e Autenticação', () => {
    it('deve rejeitar acesso sem autenticação', async () => {
      const response = await request(app)
        .get('/api/v1/cliente/restaurantes/proximos');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('erro');
    });

    it('deve rejeitar token inválido', async () => {
      const response = await request(app)
        .get('/api/v1/cliente/restaurantes/proximos')
        .set('Authorization', 'Bearer token-invalido-xyz');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('erro');
    });
  });

  describe('3. Casos Especiais', () => {
    it('deve retornar múltiplos restaurantes da mesma localização', async () => {
      const response = await request(app)
        .get('/api/v1/cliente/restaurantes/proximos')
        .set('Authorization', `Bearer ${tokenCliente1}`);

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(2); // Temos 2 restaurantes em São Paulo/SP

      const restaurantes = response.body.restaurantes;
      expect(restaurantes.length).toBe(2);

      // Verificar que são restaurantes diferentes
      const slugs = restaurantes.map((r: any) => r.slug);
      expect(slugs).toContain('restaurante-sp-centro');
      expect(slugs).toContain('restaurante-sp-zona-sul');
    });

    it('deve filtrar apenas restaurantes com status ATIVO', async () => {
      // Desativar um restaurante
      await prisma.restaurante.update({
        where: { id: clienteTestIds.restaurante2 },
        data: { status: 'INATIVO' },
      });

      const response = await request(app)
        .get('/api/v1/cliente/restaurantes/proximos')
        .set('Authorization', `Bearer ${tokenCliente1}`);

      expect(response.status).toBe(200);

      const restaurantes = response.body.restaurantes;
      restaurantes.forEach((rest: any) => {
        expect(rest.status).toBe('ATIVO');
      });

      // Reativar para não afetar outros testes
      await prisma.restaurante.update({
        where: { id: clienteTestIds.restaurante2 },
        data: { status: 'ATIVO' },
      });
    });

    it('deve incluir apenas filas com status ATIVA', async () => {
      // Pausar uma fila
      await prisma.fila.update({
        where: { id: clienteTestIds.fila1 },
        data: { status: 'PAUSADA' },
      });

      const response = await request(app)
        .get('/api/v1/cliente/restaurantes/proximos')
        .set('Authorization', `Bearer ${tokenCliente1}`);

      expect(response.status).toBe(200);

      const restaurante1 = response.body.restaurantes.find(
        (r: any) => r.id === clienteTestIds.restaurante1
      );

      if (restaurante1 && restaurante1.filas) {
        restaurante1.filas.forEach((fila: any) => {
          expect(fila.status).toBe('ATIVA');
        });
      }

      // Reativar para não afetar outros testes
      await prisma.fila.update({
        where: { id: clienteTestIds.fila1 },
        data: { status: 'ATIVA' },
      });
    });
  });
});
