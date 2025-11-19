import request from 'supertest';
import app from '../src/app';
import prisma from '../src/config/database';
import SocketService from '../src/services/socketService';
import {
  criarDadosTesteCliente,
  limparDadosTesteCliente,
  clienteTestIds,
} from './helpers/clienteTestDatabase';
import * as authService from '../src/services/authService';
import * as authClienteService from '../src/services/authClienteService';

describe('WebSocket - Emissões Reais do Backend', () => {
  let tokenOperador: string;
  let tokenCliente: string;
  let ticketId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await limparDadosTesteCliente();
    await criarDadosTesteCliente();

    // Obter token do operador
    const loginOperador = await authService.autenticarUsuario(
      'operador-cliente@teste.com',
      'senha123'
    );
    tokenOperador = loginOperador.token;

    // Obter token do cliente
    const loginCliente = await authClienteService.loginCliente({
      restauranteSlug: 'restaurante-sp-centro',
      email: 'cliente1@teste.com',
      senha: 'senha123',
    });
    tokenCliente = loginCliente.token;
  });

  afterAll(async () => {
    await limparDadosTesteCliente();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Limpar tickets antes de cada teste
    await prisma.eventoTicket.deleteMany({
      where: {
        ticket: {
          restauranteId: { in: [clienteTestIds.restaurante1, clienteTestIds.restaurante2] },
        },
      },
    });
    await prisma.ticket.deleteMany({
      where: {
        restauranteId: { in: [clienteTestIds.restaurante1, clienteTestIds.restaurante2] },
      },
    });
  });

  describe('1. Finalizar Ticket → Emite ticket:finalizado', () => {
    it('deve chamar SocketService.emitirParaFila ao finalizar ticket', async () => {
      // Criar ticket
      const ticket = await prisma.ticket.create({
        data: {
          restauranteId: clienteTestIds.restaurante1,
          filaId: clienteTestIds.fila1,
          clienteId: clienteTestIds.cliente1,
          nomeCliente: 'Cliente Teste Finalizar',
          numeroTicket: 'T-001',
          status: 'CHAMADO', // Precisa estar CHAMADO para poder finalizar
          prioridade: 'NORMAL',
          tipoEntrada: 'REMOTO',
        },
      });
      ticketId = ticket.id;

      // Spy no método de emissão
      const spy = jest.spyOn(SocketService, 'emitirParaFila').mockImplementation(() => {});

      // Finalizar ticket via API
      const response = await request(app)
        .post(`/api/v1/tickets/${ticketId}/finalizar`)
        .set('Authorization', `Bearer ${tokenOperador}`)
        .send();

      expect(response.status).toBe(200);
      expect(response.body.ticket.status).toBe('FINALIZADO');

      // Verificar que o socket foi emitido
      expect(spy).toHaveBeenCalledWith(
        clienteTestIds.restaurante1,
        clienteTestIds.fila1,
        'ticket:finalizado',
        expect.objectContaining({
          ticketId: ticketId,
          timestamp: expect.any(String),
        })
      );

      spy.mockRestore();
    });
  });

  describe('2. Chamar Ticket → Emite ticket:chamado', () => {
    it('deve chamar SocketService.emitirTicketChamado ao chamar ticket', async () => {
      // Criar ticket
      const ticket = await prisma.ticket.create({
        data: {
          restauranteId: clienteTestIds.restaurante1,
          filaId: clienteTestIds.fila1,
          clienteId: clienteTestIds.cliente1,
          nomeCliente: 'Cliente Teste Chamar',
          numeroTicket: 'T-002',
          status: 'AGUARDANDO',
          prioridade: 'NORMAL',
          tipoEntrada: 'REMOTO',
        },
      });
      ticketId = ticket.id;

      // Spy no método de emissão
      const spy = jest.spyOn(SocketService, 'emitirTicketChamado').mockImplementation(() => {});

      // Chamar ticket via API
      const response = await request(app)
        .post(`/api/v1/tickets/${ticketId}/chamar`)
        .set('Authorization', `Bearer ${tokenOperador}`)
        .send();

      expect(response.status).toBe(200);
      expect(response.body.ticket.status).toBe('CHAMADO');

      // Verificar que o socket foi emitido
      expect(spy).toHaveBeenCalledWith(
        clienteTestIds.restaurante1,
        clienteTestIds.fila1,
        expect.objectContaining({
          id: ticketId,
          numeroTicket: 'T-002',
          nomeCliente: 'Cliente Teste Chamar',
        })
      );

      spy.mockRestore();
    });
  });

  describe('3. Cancelar Ticket → Emite ticket:cancelado', () => {
    it('deve emitir ticket:cancelado quando cliente cancela', async () => {
      // Criar ticket
      const ticket = await prisma.ticket.create({
        data: {
          restauranteId: clienteTestIds.restaurante1,
          filaId: clienteTestIds.fila1,
          clienteId: clienteTestIds.cliente1,
          nomeCliente: 'Cliente Teste Cancelar',
          numeroTicket: 'T-003',
          status: 'AGUARDANDO',
          prioridade: 'NORMAL',
          tipoEntrada: 'REMOTO',
        },
      });
      ticketId = ticket.id;

      // Spy no método de emissão
      const spy = jest.spyOn(SocketService, 'emitirTicketCancelado').mockImplementation(() => {});

      // Cliente cancela via API
      const response = await request(app)
        .post(`/api/v1/cliente/ticket/${ticketId}/cancelar`)
        .set('Authorization', `Bearer ${tokenCliente}`)
        .send({ motivo: 'Mudei de ideia' });

      expect(response.status).toBe(200);
      expect(response.body.ticket.status).toBe('CANCELADO');

      // Verificar que o socket foi emitido
      expect(spy).toHaveBeenCalledWith(
        clienteTestIds.restaurante1,
        clienteTestIds.fila1,
        ticketId
      );

      spy.mockRestore();
    });

    it('deve emitir ticket:cancelado quando operador cancela', async () => {
      // Criar ticket
      const ticket = await prisma.ticket.create({
        data: {
          restauranteId: clienteTestIds.restaurante1,
          filaId: clienteTestIds.fila1,
          clienteId: clienteTestIds.cliente1,
          nomeCliente: 'Cliente Teste Cancelar Operador',
          numeroTicket: 'T-004',
          status: 'AGUARDANDO',
          prioridade: 'NORMAL',
          tipoEntrada: 'REMOTO',
        },
      });
      ticketId = ticket.id;

      // Spy no método de emissão
      const spy = jest.spyOn(SocketService, 'emitirTicketCancelado').mockImplementation(() => {});

      // Operador cancela via API
      const response = await request(app)
        .post(`/api/v1/tickets/${ticketId}/cancelar`)
        .set('Authorization', `Bearer ${tokenOperador}`)
        .send({ motivo: 'Cliente não compareceu' });

      expect(response.status).toBe(200);
      expect(response.body.ticket.status).toBe('CANCELADO');

      // Verificar que o socket foi emitido
      expect(spy).toHaveBeenCalledWith(
        clienteTestIds.restaurante1,
        clienteTestIds.fila1,
        ticketId
      );

      spy.mockRestore();
    });
  });

  describe('4. Entrada Remota → Emite fila:atualizada', () => {
    it('deve emitir fila:atualizada quando cliente entra na fila', async () => {
      // Spy no método de emissão
      const spy = jest.spyOn(SocketService, 'emitirFilaAtualizada').mockImplementation(async () => {});

      // Cliente entra na fila via API
      const response = await request(app)
        .post(`/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar`)
        .set('Authorization', `Bearer ${tokenCliente}`)
        .send({
          prioridade: 'NORMAL',
          quantidadePessoas: 2,
        });

      expect(response.status).toBe(201);
      expect(response.body.ticket).toHaveProperty('id');

      // Verificar que o socket foi emitido
      expect(spy).toHaveBeenCalledWith(
        clienteTestIds.restaurante1,
        clienteTestIds.fila1,
        expect.any(Array) // Lista de tickets
      );

      spy.mockRestore();
    });
  });

  describe('5. Pular Ticket → Atualiza Posições', () => {
    it('deve emitir fila:atualizada ao pular ticket', async () => {
      // Criar ticket chamado
      const ticket = await prisma.ticket.create({
        data: {
          restauranteId: clienteTestIds.restaurante1,
          filaId: clienteTestIds.fila1,
          clienteId: clienteTestIds.cliente1,
          nomeCliente: 'Cliente Teste Pular',
          numeroTicket: 'T-005',
          status: 'CHAMADO',
          prioridade: 'NORMAL',
          tipoEntrada: 'REMOTO',
        },
      });
      ticketId = ticket.id;

      // Spy no método de emissão
      const spy = jest.spyOn(SocketService, 'emitirFilaAtualizada').mockImplementation(async () => {});

      // Pular ticket via API
      const response = await request(app)
        .post(`/api/v1/tickets/${ticketId}/pular`)
        .set('Authorization', `Bearer ${tokenOperador}`)
        .send();

      expect(response.status).toBe(200);
      expect(response.body.ticket.status).toBe('AGUARDANDO');

      // Verificar que o socket foi emitido (recalcula posições)
      expect(spy).toHaveBeenCalledWith(
        clienteTestIds.restaurante1,
        clienteTestIds.fila1,
        expect.any(Array)
      );

      spy.mockRestore();
    });
  });

  describe('6. Marcar No-Show → Emite ticket:no-show', () => {
    it('deve emitir ticket:no-show quando operador marca no-show', async () => {
      // Criar ticket chamado
      const ticket = await prisma.ticket.create({
        data: {
          restauranteId: clienteTestIds.restaurante1,
          filaId: clienteTestIds.fila1,
          clienteId: clienteTestIds.cliente1,
          nomeCliente: 'Cliente Teste No-Show',
          numeroTicket: 'T-006',
          status: 'CHAMADO',
          prioridade: 'NORMAL',
          tipoEntrada: 'REMOTO',
        },
      });
      ticketId = ticket.id;

      // Spy no método de emissão
      const spy = jest.spyOn(SocketService, 'emitirTicketNoShow').mockImplementation(() => {});

      // Marcar no-show via API
      const response = await request(app)
        .post(`/api/v1/tickets/${ticketId}/no-show`)
        .set('Authorization', `Bearer ${tokenOperador}`)
        .send();

      expect(response.status).toBe(200);
      expect(response.body.ticket.status).toBe('NO_SHOW');

      // Verificar que o socket foi emitido
      expect(spy).toHaveBeenCalledWith(
        clienteTestIds.restaurante1,
        clienteTestIds.fila1,
        ticketId
      );

      spy.mockRestore();
    });
  });
});
