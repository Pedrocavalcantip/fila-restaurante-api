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

beforeAll(async () => {
  await prisma.$connect();
  await limparDadosTesteCliente();
  await criarDadosTesteCliente();

  // Login cliente normal (São Paulo)
  const loginResponse1 = await request(app)
    .post('/api/v1/auth/cliente/login')
    .send({
      email: 'cliente1@teste.com',
      senha: 'senha123',
      restauranteSlug: 'restaurante-sp-centro',
    });
  tokenClienteNormal = loginResponse1.body.token;

  // Login cliente VIP (São Paulo)
  const loginResponse2 = await request(app)
    .post('/api/v1/auth/cliente/login')
    .send({
      email: 'clientevip@teste.com',
      senha: 'senha123',
      restauranteSlug: 'restaurante-sp-centro',
    });
  tokenClienteVip = loginResponse2.body.token;
});

afterAll(async () => {
  await limparDadosTesteCliente();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await limparTicketsTesteCliente();
  
  // Garantir que clientes não estão bloqueados
  await prisma.cliente.updateMany({
    where: {
      id: {
        in: [clienteTestIds.cliente1, clienteTestIds.cliente2],
      },
    },
    data: {
      bloqueado: false,
      motivoBloqueio: null,
    },
  });
});

describe('Sprint 2 - Entrada Remota na Fila', () => {
  describe('1. Criar Ticket Remoto - Prioridade NORMAL', () => {
    it('deve criar ticket remoto com prioridade NORMAL', async () => {
      const response = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'NORMAL',
          quantidadePessoas: 2,
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('ticket');
      
      const ticket = response.body.ticket;
      expect(ticket).toHaveProperty('id');
      expect(ticket).toHaveProperty('numeroTicket');
      expect(ticket.prioridade).toBe('NORMAL');
      expect(ticket.tipoEntrada).toBe('REMOTO');
      expect(ticket.valorPrioridade).toBe(0);
      expect(ticket.clienteId).toBeTruthy();
      expect(ticket).toHaveProperty('posicao');
      expect(ticket).toHaveProperty('tempoEstimado');

      // Verificar dados do cliente foram preenchidos
      expect(ticket.nomeCliente).toBe('Cliente Teste Normal');
      expect(ticket.telefoneCliente).toBe('(11) 91111-1111');
      expect(ticket.emailCliente).toBe('cliente1@teste.com');
    });

    it('deve incrementar número do ticket sequencialmente', async () => {
      // Criar primeiro ticket
      const response1 = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'NORMAL',
          quantidadePessoas: 1,
        });

      expect(response1.status).toBe(201);
      const ticket1 = response1.body.ticket;
      expect(ticket1.numeroTicket).toMatch(/A-\d{3}/);

      // Criar segundo ticket (como cliente diferente)
      const response2 = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteVip}`)
        .send({
          prioridade: 'NORMAL',
          quantidadePessoas: 1,
        });

      expect(response2.status).toBe(201);
      const ticket2 = response2.body.ticket;

      // Verificar incremento
      const numero1 = parseInt(ticket1.numeroTicket.split('-')[1]);
      const numero2 = parseInt(ticket2.numeroTicket.split('-')[1]);
      expect(numero2).toBe(numero1 + 1);
    });
  });

  describe('2. Criar Ticket Remoto - Prioridade FAST_LANE', () => {
    it('deve criar ticket FAST_LANE com preço cheio para cliente não-VIP', async () => {
      const restaurante = await prisma.restaurante.findUnique({
        where: { id: clienteTestIds.restaurante1 },
        select: { precoFastLane: true },
      });

      const response = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'FAST_LANE',
          quantidadePessoas: 2,
        });

      expect(response.status).toBe(201);
      
      const ticket = response.body.ticket;
      expect(ticket.prioridade).toBe('FAST_LANE');
      expect(ticket.tipoEntrada).toBe('REMOTO');
      expect(ticket.valorPrioridade).toBe(Number(restaurante?.precoFastLane));
    });

    it('deve aplicar desconto de 50% em FAST_LANE para cliente VIP', async () => {
      const restaurante = await prisma.restaurante.findUnique({
        where: { id: clienteTestIds.restaurante1 },
        select: { precoFastLane: true },
      });

      const response = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteVip}`)
        .send({
          prioridade: 'FAST_LANE',
          quantidadePessoas: 2,
        });

      expect(response.status).toBe(201);
      
      const ticket = response.body.ticket;
      expect(ticket.prioridade).toBe('FAST_LANE');
      expect(ticket.tipoEntrada).toBe('REMOTO');
      
      const precoEsperado = Number(restaurante?.precoFastLane) * 0.5;
      expect(ticket.valorPrioridade).toBe(precoEsperado);
    });
  });

  describe('3. Criar Ticket Remoto - Prioridade VIP', () => {
    it('deve criar ticket VIP com preço cheio para cliente não-VIP', async () => {
      const restaurante = await prisma.restaurante.findUnique({
        where: { id: clienteTestIds.restaurante1 },
        select: { precoVip: true },
      });

      const response = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'VIP',
          quantidadePessoas: 4,
        });

      expect(response.status).toBe(201);
      
      const ticket = response.body.ticket;
      expect(ticket.prioridade).toBe('VIP');
      expect(ticket.tipoEntrada).toBe('REMOTO');
      expect(ticket.valorPrioridade).toBe(Number(restaurante?.precoVip));
    });

    it('deve criar ticket VIP gratuito para cliente VIP', async () => {
      const response = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteVip}`)
        .send({
          prioridade: 'VIP',
          quantidadePessoas: 4,
        });

      expect(response.status).toBe(201);
      
      const ticket = response.body.ticket;
      expect(ticket.prioridade).toBe('VIP');
      expect(ticket.tipoEntrada).toBe('REMOTO');
      expect(ticket.valorPrioridade).toBe(0); // Gratuito para VIP
    });
  });

  describe('4. Validações de Negócio', () => {
    it('deve rejeitar entrada sem autenticação', async () => {
      const response = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .send({
          prioridade: 'NORMAL',
          quantidadePessoas: 2,
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('erro');
    });

    it('deve rejeitar cliente bloqueado', async () => {
      // Bloquear cliente
      await prisma.cliente.update({
        where: { id: clienteTestIds.cliente1 },
        data: { bloqueado: true },
      });

      const response = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'NORMAL',
          quantidadePessoas: 2,
        });

      expect(response.status).toBe(403);
      expect(response.body.erro).toMatch(/[Cc]onta bloqueada/i);

      // Desbloquear para não afetar outros testes
      await prisma.cliente.update({
        where: { id: clienteTestIds.cliente1 },
        data: { bloqueado: false },
      });
    });

    it('deve rejeitar entrada em restaurante inexistente', async () => {
      const response = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-inexistente-xyz/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'NORMAL',
          quantidadePessoas: 2,
        });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('erro');
    });

    it('deve rejeitar se cliente já tem ticket ativo no restaurante', async () => {
      // Criar primeiro ticket
      const response1 = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'NORMAL',
          quantidadePessoas: 2,
        });

      expect(response1.status).toBe(201);

      // Tentar criar segundo ticket (deve falhar)
      const response2 = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'NORMAL',
          quantidadePessoas: 1,
        });

      expect(response2.status).toBe(400);
      expect(response2.body.erro).toContain('ticket ativo');
    });

    it('deve validar campo prioridade com Zod', async () => {
      const response = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'INVALIDA',
          quantidadePessoas: 2,
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('erro');
    });

    it('deve validar campo quantidadePessoas com Zod', async () => {
      const response = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'NORMAL',
          quantidadePessoas: -1, // Valor inválido
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('erro');
    });

    it('deve permitir que cliente entre em restaurantes diferentes simultaneamente', async () => {
      // Criar ticket no primeiro restaurante
      const response1 = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'NORMAL',
          quantidadePessoas: 2,
        });

      expect(response1.status).toBe(201);

      // Criar ticket no segundo restaurante (deve permitir)
      const response2 = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-zona-sul/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'NORMAL',
          quantidadePessoas: 2,
        });

      expect(response2.status).toBe(201);
      expect(response2.body.ticket.restauranteId).not.toBe(response1.body.ticket.restauranteId);
    });
  });

  describe('5. Cálculo de Posição e Tempo Estimado', () => {
    it('deve calcular posição corretamente na fila vazia', async () => {
      const response = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'NORMAL',
          quantidadePessoas: 2,
        });

      expect(response.status).toBe(201);
      
      const ticket = response.body.ticket;
      expect(ticket.posicao).toBe(1);
      expect(ticket.tempoEstimado).toBeGreaterThanOrEqual(0);
    });

    it('deve calcular posição corretamente com múltiplos tickets', async () => {
      // Criar primeiro ticket
      await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'NORMAL',
          quantidadePessoas: 2,
        });

      // Criar segundo ticket (com cliente diferente)
      const response2 = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteVip}`)
        .send({
          prioridade: 'NORMAL',
          quantidadePessoas: 2,
        });

      expect(response2.status).toBe(201);
      expect(response2.body.ticket.posicao).toBe(2);
    });
  });

  describe('6. Criar Evento de Ticket', () => {
    it('deve criar evento CRIADO ao criar ticket remoto', async () => {
      const response = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'FAST_LANE',
          quantidadePessoas: 3,
        });

      expect(response.status).toBe(201);
      const ticketId = response.body.ticket.id;

      // Verificar que o evento foi criado
      const evento = await prisma.eventoTicket.findFirst({
        where: {
          ticketId,
          tipo: 'CRIADO',
        },
      });

      expect(evento).toBeTruthy();
      expect(evento?.tipoAtor).toBe('CLIENTE');
      expect(evento?.atorId).toBe(clienteTestIds.cliente1);
      expect(evento?.metadados).toHaveProperty('prioridade');
      expect(evento?.metadados).toHaveProperty('tipoEntrada');
      expect(evento?.metadados).toHaveProperty('valorPrioridade');
    });
  });
});
