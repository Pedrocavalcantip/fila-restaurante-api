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
let precoFastLane: number;
let precoVip: number;

beforeAll(async () => {
  await prisma.$connect();
  await limparDadosTesteCliente();
  await criarDadosTesteCliente();

  // Atualizar preços do restaurante para valores conhecidos
  await prisma.restaurante.update({
    where: { id: clienteTestIds.restaurante1 },
    data: {
      precoFastLane: 20.00,
      precoVip: 50.00,
    },
  });

  const restaurante = await prisma.restaurante.findUnique({
    where: { id: clienteTestIds.restaurante1 },
    select: { precoFastLane: true, precoVip: true },
  });
  precoFastLane = Number(restaurante?.precoFastLane);
  precoVip = Number(restaurante?.precoVip);

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
});

afterAll(async () => {
  await limparDadosTesteCliente();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await limparTicketsTesteCliente();
});

describe('Sprint 2 - Cálculo de Taxa de Prioridade', () => {
  describe('1. Prioridade NORMAL', () => {
    it('deve ter valorPrioridade = 0 para cliente normal', async () => {
      const response = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'NORMAL',
          quantidadePessoas: 2,
        });

      expect(response.status).toBe(201);
      expect(response.body.ticket.prioridade).toBe('NORMAL');
      expect(response.body.ticket.valorPrioridade).toBe(0);
    });

    it('deve ter valorPrioridade = 0 para cliente VIP', async () => {
      const response = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteVip}`)
        .send({
          prioridade: 'NORMAL',
          quantidadePessoas: 2,
        });

      expect(response.status).toBe(201);
      expect(response.body.ticket.prioridade).toBe('NORMAL');
      expect(response.body.ticket.valorPrioridade).toBe(0);
    });
  });

  describe('2. Prioridade FAST_LANE - Cliente Normal', () => {
    it('deve cobrar preço cheio do FAST_LANE para cliente não-VIP', async () => {
      const response = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'FAST_LANE',
          quantidadePessoas: 2,
        });

      expect(response.status).toBe(201);
      expect(response.body.ticket.prioridade).toBe('FAST_LANE');
      expect(response.body.ticket.valorPrioridade).toBe(precoFastLane);
      expect(response.body.ticket.valorPrioridade).toBe(20.00);
    });

    it('deve armazenar valorPrioridade no banco de dados corretamente', async () => {
      const response = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'FAST_LANE',
          quantidadePessoas: 2,
        });

      const ticketId = response.body.ticket.id;

      // Verificar no banco
      const ticketDb = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { valorPrioridade: true },
      });

      expect(Number(ticketDb?.valorPrioridade)).toBe(precoFastLane);
    });
  });

  describe('3. Prioridade FAST_LANE - Cliente VIP (50% desconto)', () => {
    it('deve aplicar desconto de 50% em FAST_LANE para cliente VIP', async () => {
      const response = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteVip}`)
        .send({
          prioridade: 'FAST_LANE',
          quantidadePessoas: 2,
        });

      expect(response.status).toBe(201);
      expect(response.body.ticket.prioridade).toBe('FAST_LANE');
      
      const valorEsperado = precoFastLane * 0.5;
      expect(response.body.ticket.valorPrioridade).toBe(valorEsperado);
      expect(response.body.ticket.valorPrioridade).toBe(10.00);
    });

    it('deve salvar valor com desconto VIP no banco de dados', async () => {
      const response = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteVip}`)
        .send({
          prioridade: 'FAST_LANE',
          quantidadePessoas: 3,
        });

      const ticketId = response.body.ticket.id;

      // Verificar no banco
      const ticketDb = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { valorPrioridade: true },
      });

      const valorEsperado = precoFastLane * 0.5;
      expect(Number(ticketDb?.valorPrioridade)).toBe(valorEsperado);
    });

    it('deve registrar desconto VIP nos metadados do evento', async () => {
      const response = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteVip}`)
        .send({
          prioridade: 'FAST_LANE',
          quantidadePessoas: 2,
        });

      const ticketId = response.body.ticket.id;

      // Verificar evento
      const evento = await prisma.eventoTicket.findFirst({
        where: { ticketId, tipo: 'CRIADO' },
        select: { metadados: true },
      });

      expect(evento?.metadados).toHaveProperty('isVip');
      expect(evento?.metadados).toMatchObject({ isVip: true });
    });
  });

  describe('4. Prioridade VIP - Cliente Normal', () => {
    it('deve cobrar preço cheio do VIP para cliente não-VIP', async () => {
      const response = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'VIP',
          quantidadePessoas: 4,
        });

      expect(response.status).toBe(201);
      expect(response.body.ticket.prioridade).toBe('VIP');
      expect(response.body.ticket.valorPrioridade).toBe(precoVip);
      expect(response.body.ticket.valorPrioridade).toBe(50.00);
    });

    it('deve armazenar valorPrioridade VIP no banco de dados', async () => {
      const response = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'VIP',
          quantidadePessoas: 4,
        });

      const ticketId = response.body.ticket.id;

      // Verificar no banco
      const ticketDb = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { valorPrioridade: true },
      });

      expect(Number(ticketDb?.valorPrioridade)).toBe(precoVip);
    });
  });

  describe('5. Prioridade VIP - Cliente VIP (100% desconto / gratuito)', () => {
    it('deve ser gratuito (valorPrioridade = 0) para cliente VIP', async () => {
      const response = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteVip}`)
        .send({
          prioridade: 'VIP',
          quantidadePessoas: 4,
        });

      expect(response.status).toBe(201);
      expect(response.body.ticket.prioridade).toBe('VIP');
      expect(response.body.ticket.valorPrioridade).toBe(0);
    });

    it('deve salvar valorPrioridade = 0 no banco para VIP', async () => {
      const response = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteVip}`)
        .send({
          prioridade: 'VIP',
          quantidadePessoas: 4,
        });

      const ticketId = response.body.ticket.id;

      // Verificar no banco
      const ticketDb = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { valorPrioridade: true },
      });

      expect(Number(ticketDb?.valorPrioridade)).toBe(0);
    });

    it('deve registrar isVip=true nos metadados do evento', async () => {
      const response = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteVip}`)
        .send({
          prioridade: 'VIP',
          quantidadePessoas: 4,
        });

      const ticketId = response.body.ticket.id;

      // Verificar evento
      const evento = await prisma.eventoTicket.findFirst({
        where: { ticketId, tipo: 'CRIADO' },
        select: { metadados: true },
      });

      expect(evento?.metadados).toHaveProperty('isVip');
      expect(evento?.metadados).toMatchObject({ isVip: true });
      expect(evento?.metadados).toHaveProperty('valorPrioridade');
      if (evento?.metadados && typeof evento.metadados === 'object' && evento.metadados !== null) {
        expect((evento.metadados as any).valorPrioridade).toBe(0);
      }
    });
  });

  describe('6. Comparação de Valores', () => {
    it('deve ter NORMAL < FAST_LANE < VIP em valores para cliente não-VIP', async () => {
      const responseNormal = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'NORMAL',
          quantidadePessoas: 2,
        });

      await limparTicketsTesteCliente();

      const responseFastLane = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'FAST_LANE',
          quantidadePessoas: 2,
        });

      await limparTicketsTesteCliente();

      const responseVip = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'VIP',
          quantidadePessoas: 2,
        });

      const valorNormal = responseNormal.body.ticket.valorPrioridade;
      const valorFastLane = responseFastLane.body.ticket.valorPrioridade;
      const valorVip = responseVip.body.ticket.valorPrioridade;

      expect(valorNormal).toBe(0);
      expect(valorFastLane).toBeGreaterThan(valorNormal);
      expect(valorVip).toBeGreaterThan(valorFastLane);
    });

    it('deve economizar exatamente 50% em FAST_LANE com status VIP', async () => {
      // Cliente normal paga preço cheio
      const responseNormal = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'FAST_LANE',
          quantidadePessoas: 2,
        });

      const valorSemDesconto = responseNormal.body.ticket.valorPrioridade;

      await limparTicketsTesteCliente();

      // Cliente VIP paga metade
      const responseVip = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteVip}`)
        .send({
          prioridade: 'FAST_LANE',
          quantidadePessoas: 2,
        });

      const valorComDesconto = responseVip.body.ticket.valorPrioridade;

      expect(valorComDesconto).toBe(valorSemDesconto * 0.5);
      expect(valorComDesconto).toBe(10.00);
      expect(valorSemDesconto).toBe(20.00);
    });

    it('deve economizar 100% em VIP com status VIP', async () => {
      // Cliente normal paga preço cheio
      const responseNormal = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'VIP',
          quantidadePessoas: 4,
        });

      const valorSemDesconto = responseNormal.body.ticket.valorPrioridade;

      await limparTicketsTesteCliente();

      // Cliente VIP não paga nada
      const responseVip = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteVip}`)
        .send({
          prioridade: 'VIP',
          quantidadePessoas: 4,
        });

      const valorComDesconto = responseVip.body.ticket.valorPrioridade;

      expect(valorComDesconto).toBe(0);
      expect(valorSemDesconto).toBe(50.00);
    });
  });

  describe('7. Consistência de Dados', () => {
    it('deve manter valorPrioridade consistente entre resposta e banco', async () => {
      const response = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteVip}`)
        .send({
          prioridade: 'FAST_LANE',
          quantidadePessoas: 2,
        });

      const ticketId = response.body.ticket.id;
      const valorResposta = response.body.ticket.valorPrioridade;

      // Buscar do banco
      const ticketDb = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { valorPrioridade: true },
      });

      expect(Number(ticketDb?.valorPrioridade)).toBe(valorResposta);
    });

    it('deve usar tipo Decimal corretamente para valores monetários', async () => {
      const response = await request(app)
        .post('/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar')
        .set('Authorization', `Bearer ${tokenClienteNormal}`)
        .send({
          prioridade: 'FAST_LANE',
          quantidadePessoas: 2,
        });

      const ticketId = response.body.ticket.id;

      // Buscar do banco
      const ticketDb = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { valorPrioridade: true },
      });

      // Verificar que é um número válido (não NaN, não Infinity)
      const valor = Number(ticketDb?.valorPrioridade);
      expect(isNaN(valor)).toBe(false);
      expect(isFinite(valor)).toBe(true);
      expect(valor).toBeGreaterThanOrEqual(0);
    });
  });
});
