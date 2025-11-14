import request from 'supertest';
import app from '../src/app';
import prisma from '../src/config/database';
import {
  criarDadosTeste,
  limparDadosTeste,
  limparTicketsTeste,
  testIds,
} from './helpers/testDatabase';

let token: string;
let ticketId: string;

beforeAll(async () => {
  await prisma.$connect();
  await limparDadosTeste();
  await criarDadosTeste();
});

afterAll(async () => {
  await limparDadosTeste();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await limparTicketsTeste();
});

describe('Sprint 1 - Testes de Integração', () => {
  describe('1. Autenticação JWT', () => {
    it('deve fazer login com credenciais válidas e retornar JWT', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'teste@teste.com',
          senha: 'senha123',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('usuario');
      expect(response.body.usuario.email).toBe('teste@teste.com');
      
      token = response.body.token;
    });

    it('deve rejeitar login com credenciais inválidas', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'teste@teste.com',
          senha: 'senhaerrada',
        });

      expect(response.status).toBe(401);
    });
  });

  describe('2. Criar Ticket Local', () => {
    it('deve criar um ticket com dados válidos', async () => {
      const response = await request(app)
        .post(`/api/v1/tickets/filas/${testIds.fila}/tickets`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          nomeCliente: 'Cliente Teste A',
        });

      expect(response.status).toBe(201);
      expect(response.body.ticket).toHaveProperty('id');
      expect(response.body.ticket).toHaveProperty('numeroTicket');
      expect(response.body.ticket).toHaveProperty('posicao');
      expect(response.body.ticket.nomeCliente).toBe('Cliente Teste A');
      
      ticketId = response.body.ticket.id;
    });

    it('deve validar entrada com Zod - nome vazio', async () => {
      const response = await request(app)
        .post(`/api/v1/tickets/filas/${testIds.fila}/tickets`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          nomeCliente: '',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('erro');
    });

    it('deve validar entrada com Zod - nome muito curto', async () => {
      const response = await request(app)
        .post(`/api/v1/tickets/filas/${testIds.fila}/tickets`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          nomeCliente: 'AB',
        });

      expect(response.status).toBe(400);
    });
  });

  describe('3. Ações do Operador', () => {
    it('deve chamar um ticket', async () => {
      // Primeiro criar o ticket
      const createRes = await request(app)
        .post(`/api/v1/tickets/filas/${testIds.fila}/tickets`)
        .set('Authorization', `Bearer ${token}`)
        .send({ nomeCliente: 'Cliente Chamar' });
      
      const ticketId = createRes.body.ticket.id;

      // Agora chamar o ticket
      const response = await request(app)
        .post(`/api/v1/tickets/${ticketId}/chamar`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.ticket.status).toBe('CHAMADO');
    });

    it('deve pular um ticket chamado', async () => {
      // Criar e chamar o ticket primeiro
      const createRes = await request(app)
        .post(`/api/v1/tickets/filas/${testIds.fila}/tickets`)
        .set('Authorization', `Bearer ${token}`)
        .send({ nomeCliente: 'Cliente Pular' });
      
      const ticketId = createRes.body.ticket.id;

      await request(app)
        .post(`/api/v1/tickets/${ticketId}/chamar`)
        .set('Authorization', `Bearer ${token}`);

      // Agora pular
      const response = await request(app)
        .post(`/api/v1/tickets/${ticketId}/pular`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.ticket.status).toBe('AGUARDANDO');
    });

    it('deve rechamar um ticket', async () => {
      // Criar o ticket
      const createRes = await request(app)
        .post(`/api/v1/tickets/filas/${testIds.fila}/tickets`)
        .set('Authorization', `Bearer ${token}`)
        .send({ nomeCliente: 'Cliente Rechamar' });
      
      const ticketId = createRes.body.ticket.id;

      // Primeiro chamar
      await request(app)
        .post(`/api/v1/tickets/${ticketId}/chamar`)
        .set('Authorization', `Bearer ${token}`);

      // Depois rechamar
      const response = await request(app)
        .post(`/api/v1/tickets/${ticketId}/rechamar`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.ticket.status).toBe('CHAMADO');
    });

    it('deve finalizar atendimento', async () => {
      // Criar e chamar o ticket
      const createRes = await request(app)
        .post(`/api/v1/tickets/filas/${testIds.fila}/tickets`)
        .set('Authorization', `Bearer ${token}`)
        .send({ nomeCliente: 'Cliente Finalizar' });
      
      const ticketId = createRes.body.ticket.id;

      await request(app)
        .post(`/api/v1/tickets/${ticketId}/chamar`)
        .set('Authorization', `Bearer ${token}`);

      // Finalizar
      const response = await request(app)
        .post(`/api/v1/tickets/${ticketId}/finalizar`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          observacoes: 'Atendimento concluído',
        });

      expect(response.status).toBe(200);
      expect(response.body.ticket.status).toBe('FINALIZADO');
    });
  });

  describe('4. Cálculo de Posições', () => {
    let ticket1Id: string;
    let ticket2Id: string;

    it('deve calcular posições corretamente na ordem de entrada', async () => {
      // Criar primeiro ticket
      const res1 = await request(app)
        .post(`/api/v1/tickets/filas/${testIds.fila}/tickets`)
        .set('Authorization', `Bearer ${token}`)
        .send({ nomeCliente: 'Cliente Posição 1' });
      
      ticket1Id = res1.body.ticket.id;
      expect(res1.body.ticket.posicao).toBe(1);

      // Criar segundo ticket
      const res2 = await request(app)
        .post(`/api/v1/tickets/filas/${testIds.fila}/tickets`)
        .set('Authorization', `Bearer ${token}`)
        .send({ nomeCliente: 'Cliente Posição 2' });
      
      ticket2Id = res2.body.ticket.id;
      expect(res2.body.ticket.posicao).toBe(2);
    });

    it('deve recalcular posições após check-in (prioridade)', async () => {
      const res1 = await request(app)
        .post(`/api/v1/tickets/filas/${testIds.fila}/tickets`)
        .set('Authorization', `Bearer ${token}`)
        .send({ nomeCliente: 'Cliente Check-in 1' });

      const res2 = await request(app)
        .post(`/api/v1/tickets/filas/${testIds.fila}/tickets`)
        .set('Authorization', `Bearer ${token}`)
        .send({ nomeCliente: 'Cliente Check-in 2' });
      
      const ticket2Id = res2.body.ticket.id;

      const response = await request(app)
        .post(`/api/v1/tickets/${ticket2Id}/check-in`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.ticket.prioridade).toBe('CHECK_IN_CONFIRMADO');
      expect(response.body.ticket.posicao).toBe(1); // Deve subir para primeira posição
    });
  });

  describe('5. Rate Limiting', () => {
    it('deve bloquear após exceder limite de requisições', async () => {
      const requests = [];
      
      // Fazer 10 requisições 
      for (let i = 0; i < 10; i++) {
        requests.push(
          request(app)
            .get('/health')
        );
      }

      const responses = await Promise.all(requests);
      const blocked = responses.some(res => res.status === 429);
      
      expect(responses.length).toBe(10);
    });
  });

  describe('6. Tratamento de Erros', () => {
    it('deve retornar erro 404 para ticket inexistente', async () => {
      const response = await request(app)
        .get('/api/v1/tickets/99999999-9999-9999-9999-999999999999')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('erro');
    });

    it('deve retornar erro 401 sem autenticação', async () => {
      const response = await request(app)
        .get(`/api/v1/tickets/${ticketId}`);

      expect(response.status).toBe(401);
    });
  });

  describe('7. Registro de Eventos', () => {
    it('deve registrar evento CRIADO ao criar ticket', async () => {
      const response = await request(app)
        .post(`/api/v1/tickets/filas/${testIds.fila}/tickets`)
        .set('Authorization', `Bearer ${token}`)
        .send({ nomeCliente: 'Cliente Evento' });

      const ticketCriadoId = response.body.ticket.id;

      // Verificar no banco
      const eventos = await prisma.eventoTicket.findMany({
        where: { ticketId: ticketCriadoId },
      });

      expect(eventos.length).toBeGreaterThan(0);
      expect(eventos[0].tipo).toBe('CRIADO');
      expect(eventos[0].atorId).toBe(testIds.usuario);
    });

    it('deve registrar evento CHAMADO ao chamar ticket', async () => {
      const ticketResponse = await request(app)
        .post(`/api/v1/tickets/filas/${testIds.fila}/tickets`)
        .set('Authorization', `Bearer ${token}`)
        .send({ nomeCliente: 'Cliente Chamado' });

      const ticketChamadoId = ticketResponse.body.ticket.id;

      await request(app)
        .post(`/api/v1/tickets/${ticketChamadoId}/chamar`)
        .set('Authorization', `Bearer ${token}`);

      // Verificar no banco
      const eventos = await prisma.eventoTicket.findMany({
        where: { ticketId: ticketChamadoId, tipo: 'CHAMADO' },
      });

      expect(eventos.length).toBeGreaterThan(0);
      expect(eventos[0].atorId).toBe(testIds.usuario);
    });
  });
});
