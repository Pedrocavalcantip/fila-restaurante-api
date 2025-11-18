import request from 'supertest';
import app from '../src/app';
import prisma from '../src/config/database';
import {
  criarDadosTesteCliente,
  limparDadosTesteCliente,
  limparTicketsTesteCliente,
  clienteTestIds,
} from './helpers/clienteTestDatabase';

// Mock para evitar envio real de emails durante testes
jest.mock('../src/services/notificacaoService', () => ({
  ...jest.requireActual('../src/services/notificacaoService'),
  enviarBoasVindas: jest.fn().mockResolvedValue(undefined),
  enviarTicketChamado: jest.fn().mockResolvedValue(undefined),
}));

let tokenClienteNormal: string;
let tokenClienteVip: string;
let tokenOperador: string;

beforeAll(async () => {
  await prisma.$connect();
  
  // Configurar dados de teste para clientes
  await limparDadosTesteCliente();
  await criarDadosTesteCliente();

  // Login cliente normal
  const loginResponse1 = await request(app)
    .post('/api/v1/auth/cliente/login')
    .send({
      email: 'cliente1@teste.com',
      senha: 'senha123',
      restauranteSlug: 'restaurante-sp-centro',
    });
  tokenClienteNormal = loginResponse1.body.token;

  // Login cliente VIP
  const loginResponse2 = await request(app)
    .post('/api/v1/auth/cliente/login')
    .send({
      email: 'clientevip@teste.com',
      senha: 'senha123',
      restauranteSlug: 'restaurante-sp-centro',
    });
  tokenClienteVip = loginResponse2.body.token;

  // Login operador
  const loginResponse3 = await request(app)
    .post('/api/v1/auth/login')
    .send({
      email: 'operador-cliente@teste.com',
      senha: 'senha123',
    });
  tokenOperador = loginResponse3.body.token;
});

afterAll(async () => {
  await limparDadosTesteCliente();
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Limpar tickets e eventos (respeitando foreign keys)
  await limparTicketsTesteCliente();
  
  // Resetar estatísticas (single query)
  await prisma.cliente.update({
    where: { id: clienteTestIds.cliente1 },
    data: {
      totalVisitas: 0,
      totalFastLane: 0,
      totalVip: 0,
    }
  });
});

describe('Sprint 2 - Estatísticas de Cliente', () => {
  describe('1. Incrementar totalVisitas', () => {
    it('deve incrementar totalVisitas ao finalizar ticket NORMAL', async () => {
      // Verificar estatísticas iniciais
      const clienteAntes = await prisma.cliente.findUnique({
        where: { id: clienteTestIds.cliente1 },
        select: { totalVisitas: true, totalFastLane: true, totalVip: true },
      });
      expect(clienteAntes?.totalVisitas).toBe(0);

      // Criar ticket
      const ticketResponse = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'NORMAL',
          quantidadePessoas: 2,
        });

      const ticketId = ticketResponse.body.ticket.id;

      // Chamar ticket
      await request(app)
        .post(`/api/v1/tickets/${ticketId}/chamar`)
        .set('Authorization', `Bearer ${tokenOperador}`);

      // Finalizar ticket
      await request(app)
        .post(`/api/v1/tickets/${ticketId}/finalizar`)
        .set('Authorization', `Bearer ${tokenOperador}`);

      // Verificar estatísticas atualizadas
      const clienteDepois = await prisma.cliente.findUnique({
        where: { id: clienteTestIds.cliente1 },
        select: { totalVisitas: true, totalFastLane: true, totalVip: true },
      });

      expect(clienteDepois?.totalVisitas).toBe(1);
      expect(clienteDepois?.totalFastLane).toBe(0);
      expect(clienteDepois?.totalVip).toBe(0);
    });

    it('deve incrementar totalVisitas múltiplas vezes', async () => {
      // Criar e finalizar primeiro ticket
      const ticket1Response = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'NORMAL',
          quantidadePessoas: 2,
        });

      await request(app)
        .post(`/api/v1/tickets/${ticket1Response.body.ticket.id}/chamar`)
        .set('Authorization', `Bearer ${tokenOperador}`);

      await request(app)
        .post(`/api/v1/tickets/${ticket1Response.body.ticket.id}/finalizar`)
        .set('Authorization', `Bearer ${tokenOperador}`);

      // Criar e finalizar segundo ticket
      const ticket2Response = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'NORMAL',
          quantidadePessoas: 2,
        });

      await request(app)
        .post(`/api/v1/tickets/${ticket2Response.body.ticket.id}/chamar`)
        .set('Authorization', `Bearer ${tokenOperador}`);

      await request(app)
        .post(`/api/v1/tickets/${ticket2Response.body.ticket.id}/finalizar`)
        .set('Authorization', `Bearer ${tokenOperador}`);

      // Verificar estatísticas
      const cliente = await prisma.cliente.findUnique({
        where: { id: clienteTestIds.cliente1 },
        select: { totalVisitas: true },
      });

      expect(cliente?.totalVisitas).toBe(2);
    });
  });

  describe('2. Incrementar totalFastLane', () => {
    it('deve incrementar totalFastLane ao finalizar ticket FAST_LANE', async () => {
      // Verificar estatísticas iniciais
      const clienteAntes = await prisma.cliente.findUnique({
        where: { id: clienteTestIds.cliente1 },
        select: { totalVisitas: true, totalFastLane: true, totalVip: true },
      });
      expect(clienteAntes?.totalFastLane).toBe(0);

      // Criar ticket FAST_LANE
      const ticketResponse = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'FAST_LANE',
          quantidadePessoas: 2,
        });

      const ticketId = ticketResponse.body.ticket.id;

      // Chamar e finalizar
      await request(app)
        .post(`/api/v1/tickets/${ticketId}/chamar`)
        .set('Authorization', `Bearer ${tokenOperador}`);

      await request(app)
        .post(`/api/v1/tickets/${ticketId}/finalizar`)
        .set('Authorization', `Bearer ${tokenOperador}`);

      // Verificar estatísticas atualizadas
      const clienteDepois = await prisma.cliente.findUnique({
        where: { id: clienteTestIds.cliente1 },
        select: { totalVisitas: true, totalFastLane: true, totalVip: true },
      });

      expect(clienteDepois?.totalVisitas).toBe(1);
      expect(clienteDepois?.totalFastLane).toBe(1);
      expect(clienteDepois?.totalVip).toBe(0);
    });

    it('deve incrementar ambos totalVisitas e totalFastLane', async () => {
      // Criar ticket FAST_LANE
      const ticketResponse = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'FAST_LANE',
          quantidadePessoas: 3,
        });

      await request(app)
        .post(`/api/v1/tickets/${ticketResponse.body.ticket.id}/chamar`)
        .set('Authorization', `Bearer ${tokenOperador}`);

      await request(app)
        .post(`/api/v1/tickets/${ticketResponse.body.ticket.id}/finalizar`)
        .set('Authorization', `Bearer ${tokenOperador}`);

      // Verificar que ambos foram incrementados
      const cliente = await prisma.cliente.findUnique({
        where: { id: clienteTestIds.cliente1 },
        select: { totalVisitas: true, totalFastLane: true },
      });

      expect(cliente?.totalVisitas).toBe(1);
      expect(cliente?.totalFastLane).toBe(1);
    });
  });

  describe('3. Incrementar totalVip', () => {
    it('deve incrementar totalVip ao finalizar ticket VIP', async () => {
      // Verificar estatísticas iniciais
      const clienteAntes = await prisma.cliente.findUnique({
        where: { id: clienteTestIds.cliente1 },
        select: { totalVisitas: true, totalFastLane: true, totalVip: true },
      });
      expect(clienteAntes?.totalVip).toBe(0);

      // Criar ticket VIP
      const ticketResponse = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'VIP',
          quantidadePessoas: 4,
        });

      const ticketId = ticketResponse.body.ticket.id;

      // Chamar e finalizar
      await request(app)
        .post(`/api/v1/tickets/${ticketId}/chamar`)
        .set('Authorization', `Bearer ${tokenOperador}`);

      await request(app)
        .post(`/api/v1/tickets/${ticketId}/finalizar`)
        .set('Authorization', `Bearer ${tokenOperador}`);

      // Verificar estatísticas atualizadas
      const clienteDepois = await prisma.cliente.findUnique({
        where: { id: clienteTestIds.cliente1 },
        select: { totalVisitas: true, totalFastLane: true, totalVip: true },
      });

      expect(clienteDepois?.totalVisitas).toBe(1);
      expect(clienteDepois?.totalFastLane).toBe(0);
      expect(clienteDepois?.totalVip).toBe(1);
    });

    it('deve incrementar ambos totalVisitas e totalVip', async () => {
      // Criar ticket VIP
      const ticketResponse = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'VIP',
          quantidadePessoas: 4,
        });

      await request(app)
        .post(`/api/v1/tickets/${ticketResponse.body.ticket.id}/chamar`)
        .set('Authorization', `Bearer ${tokenOperador}`);

      await request(app)
        .post(`/api/v1/tickets/${ticketResponse.body.ticket.id}/finalizar`)
        .set('Authorization', `Bearer ${tokenOperador}`);

      // Verificar que ambos foram incrementados
      const cliente = await prisma.cliente.findUnique({
        where: { id: clienteTestIds.cliente1 },
        select: { totalVisitas: true, totalVip: true },
      });

      expect(cliente?.totalVisitas).toBe(1);
      expect(cliente?.totalVip).toBe(1);
    });
  });

  describe('4. Cenários Mistos', () => {
    it('deve rastrear corretamente múltiplas prioridades diferentes', async () => {
      // Já resetado pelo beforeEach - não precisa fazer novamente

      // Criar e finalizar ticket NORMAL
      const ticketNormal = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'NORMAL',
          quantidadePessoas: 2,
        });

      await request(app)
        .post(`/api/v1/tickets/${ticketNormal.body.ticket.id}/chamar`)
        .set('Authorization', `Bearer ${tokenOperador}`);

      await request(app)
        .post(`/api/v1/tickets/${ticketNormal.body.ticket.id}/finalizar`)
        .set('Authorization', `Bearer ${tokenOperador}`);

      // Criar e finalizar ticket FAST_LANE
      const ticketFastLane = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'FAST_LANE',
          quantidadePessoas: 2,
        });

      await request(app)
        .post(`/api/v1/tickets/${ticketFastLane.body.ticket.id}/chamar`)
        .set('Authorization', `Bearer ${tokenOperador}`);

      await request(app)
        .post(`/api/v1/tickets/${ticketFastLane.body.ticket.id}/finalizar`)
        .set('Authorization', `Bearer ${tokenOperador}`);

      // Criar e finalizar ticket VIP
      const ticketVip = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'VIP',
          quantidadePessoas: 4,
        });

      await request(app)
        .post(`/api/v1/tickets/${ticketVip.body.ticket.id}/chamar`)
        .set('Authorization', `Bearer ${tokenOperador}`);

      await request(app)
        .post(`/api/v1/tickets/${ticketVip.body.ticket.id}/finalizar`)
        .set('Authorization', `Bearer ${tokenOperador}`);

      // Verificar estatísticas finais
      const cliente = await prisma.cliente.findUnique({
        where: { id: clienteTestIds.cliente1 },
        select: { totalVisitas: true, totalFastLane: true, totalVip: true },
      });

      expect(cliente?.totalVisitas).toBe(3); // 1 NORMAL + 1 FAST_LANE + 1 VIP
      expect(cliente?.totalFastLane).toBe(1);
      expect(cliente?.totalVip).toBe(1);
    });

    it('deve incrementar totalFastLane múltiplas vezes', async () => {
      // Criar e finalizar 3 tickets FAST_LANE
      for (let i = 0; i < 3; i++) {
        const ticketResponse = await request(app)
          .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
          .set('Authorization', `Bearer ${tokenClienteNormal}`)
          .send({
            prioridade: 'FAST_LANE',
            quantidadePessoas: 2,
          });

        await request(app)
          .post(`/api/v1/tickets/${ticketResponse.body.ticket.id}/chamar`)
          .set('Authorization', `Bearer ${tokenOperador}`);

        await request(app)
          .post(`/api/v1/tickets/${ticketResponse.body.ticket.id}/finalizar`)
          .set('Authorization', `Bearer ${tokenOperador}`);
      }

      // Verificar estatísticas
      const cliente = await prisma.cliente.findUnique({
        where: { id: clienteTestIds.cliente1 },
        select: { totalVisitas: true, totalFastLane: true, totalVip: true },
      });

      expect(cliente?.totalVisitas).toBe(3);
      expect(cliente?.totalFastLane).toBe(3);
      expect(cliente?.totalVip).toBe(0);
    });
  });

  describe('5. Validações de Não-Incremento', () => {
    it('NÃO deve incrementar estatísticas se ticket não for finalizado', async () => {
      const clienteAntes = await prisma.cliente.findUnique({
        where: { id: clienteTestIds.cliente1 },
        select: { totalVisitas: true, totalFastLane: true, totalVip: true },
      });

      // Criar ticket mas NÃO finalizar
      await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'FAST_LANE',
          quantidadePessoas: 2,
        });

      // Verificar que estatísticas não mudaram
      const clienteDepois = await prisma.cliente.findUnique({
        where: { id: clienteTestIds.cliente1 },
        select: { totalVisitas: true, totalFastLane: true, totalVip: true },
      });

      expect(clienteDepois).toEqual(clienteAntes);
    });

    it('NÃO deve incrementar estatísticas se ticket for cancelado', async () => {
      const clienteAntes = await prisma.cliente.findUnique({
        where: { id: clienteTestIds.cliente1 },
        select: { totalVisitas: true, totalFastLane: true, totalVip: true },
      });

      // Criar ticket
      const ticketResponse = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'VIP',
          quantidadePessoas: 4,
        });

      // Cancelar ticket (por cliente)
      await request(app)
        .post(`/api/v1/cliente/ticket/${ticketResponse.body.ticket.id}/cancelar`)
        .set('Authorization', `Bearer ${tokenClienteNormal}`);

      // Verificar que estatísticas não mudaram
      const clienteDepois = await prisma.cliente.findUnique({
        where: { id: clienteTestIds.cliente1 },
        select: { totalVisitas: true, totalFastLane: true, totalVip: true },
      });

      expect(clienteDepois).toEqual(clienteAntes);
    });
  });

  describe('6. Visibilidade no Perfil', () => {
    it('deve retornar estatísticas atualizadas no endpoint de perfil', async () => {
      // Criar e finalizar ticket
      const ticketResponse = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'FAST_LANE',
          quantidadePessoas: 2,
        });

      await request(app)
        .post(`/api/v1/tickets/${ticketResponse.body.ticket.id}/chamar`)
        .set('Authorization', `Bearer ${tokenOperador}`);

      await request(app)
        .post(`/api/v1/tickets/${ticketResponse.body.ticket.id}/finalizar`)
        .set('Authorization', `Bearer ${tokenOperador}`);

      // Buscar perfil
      const perfilResponse = await request(app)
        .get('/api/v1/cliente/perfil')
        .set('Authorization', `Bearer ${tokenClienteNormal}`);

      expect(perfilResponse.status).toBe(200);
      expect(perfilResponse.body).toHaveProperty('id');
      expect(perfilResponse.body.totalVisitas).toBe(1);
      expect(perfilResponse.body.totalFastLane).toBe(1);
      expect(perfilResponse.body.totalVip).toBe(0);
    });
  });
});
