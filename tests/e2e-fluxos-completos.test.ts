import request from 'supertest';
import app from '../src/app';
import prisma from '../src/config/database';
import {
  criarDadosTesteCliente,
  limparDadosTesteCliente,
  clienteTestIds,
} from './helpers/clienteTestDatabase';

/**
 * TESTES E2E - FLUXOS COMPLETOS DE NEGÓCIO
 * 
 * Testa jornadas completas do usuário, do início ao fim,
 * validando integração entre múltiplos endpoints e serviços.
 * 
 * COBERTURA:
 * ✅ Fluxo Feliz: Cadastro → Busca → Fila → Chamada → Finalização → VIP
 * ✅ Fluxo Cancelamento Cliente: Entrada → Desistência → Sem estatísticas
 * ✅ Fluxo No-Show: Chamada → Não comparece → Penalização
 */

describe('E2E - Fluxos Completos de Negócio', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await limparDadosTesteCliente();
    await criarDadosTesteCliente();
  });

  afterAll(async () => {
    await limparDadosTesteCliente();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Limpar tickets e clientes dinâmicos antes de cada teste
    await prisma.eventoTicket.deleteMany({
      where: {
        ticket: {
          restauranteId: clienteTestIds.restaurante1,
        },
      },
    });
    await prisma.ticket.deleteMany({
      where: {
        restauranteId: clienteTestIds.restaurante1,
      },
    });
    await prisma.cliente.deleteMany({
      where: {
        restauranteId: clienteTestIds.restaurante1,
        email: { startsWith: 'e2e-' },
      },
    });
  });

  describe('1. Fluxo Feliz Completo: Cadastro → Fila → Atendimento', () => {
    it('deve executar jornada completa do cliente com múltiplas visitas', async () => {
      const timestamp = Date.now();
      const emailCliente = `e2e-cliente-${timestamp}@teste.com`;
      const telefoneCliente = `(11) 9${timestamp.toString().slice(-8)}`;

      // ====================================
      // ETAPA 1: Cliente se cadastra
      // ====================================
      const cadastroResponse = await request(app)
        .post('/api/v1/auth/cliente/cadastro')
        .send({
          restauranteSlug: 'restaurante-sp-centro',
          nomeCompleto: 'Cliente E2E Teste',
          email: emailCliente,
          telefone: telefoneCliente,
          senha: 'senha123',
          cidade: 'São Paulo',
          estado: 'SP',
        });

      expect(cadastroResponse.status).toBe(201);
      expect(cadastroResponse.body).toHaveProperty('token');
      expect(cadastroResponse.body.cliente.email).toBe(emailCliente);
      expect(cadastroResponse.body.cliente.totalVisitas).toBe(0);

      const tokenCliente = cadastroResponse.body.token;
      const clienteId = cadastroResponse.body.cliente.id;

      // ====================================
      // ETAPA 2: Cliente busca restaurantes próximos
      // ====================================
      const buscaResponse = await request(app)
        .get('/api/v1/cliente/restaurantes/proximos')
        .set('Authorization', `Bearer ${tokenCliente}`)
        .query({ cidade: 'São Paulo', estado: 'SP' });

      expect(buscaResponse.status).toBe(200);
      expect(buscaResponse.body.restaurantes.length).toBeGreaterThan(0);
      const restaurante = buscaResponse.body.restaurantes.find(
        (r: any) => r.slug === 'restaurante-sp-centro'
      );
      expect(restaurante).toBeDefined();

      // ====================================
      // ETAPA 3-8: Simular 3 visitas completas
      // ====================================
      let operadorToken: string;

      // Login do operador (necessário para chamar/finalizar)
      const loginOperadorResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'operador-cliente@teste.com',
          senha: 'senha123',
        });

      expect(loginOperadorResponse.status).toBe(200);
      operadorToken = loginOperadorResponse.body.token;

      // Realizar 3 ciclos completos: entrar → chamar → finalizar
      for (let i = 1; i <= 3; i++) {
        // ETAPA 3: Cliente entra na fila
        const entrarFilaResponse = await request(app)
          .post(`/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar`)
          .set('Authorization', `Bearer ${tokenCliente}`)
          .send({
            prioridade: 'NORMAL',
            quantidadePessoas: 2,
          });

        expect(entrarFilaResponse.status).toBe(201);
        expect(entrarFilaResponse.body.ticket).toHaveProperty('id');
        expect(entrarFilaResponse.body.ticket.status).toBe('AGUARDANDO');

        const ticketId = entrarFilaResponse.body.ticket.id;

        // ETAPA 4: Operador lista fila ativa
        const listarFilaResponse = await request(app)
          .get(`/api/v1/tickets/filas/${clienteTestIds.fila1}/tickets/ativa`)
          .set('Authorization', `Bearer ${operadorToken}`);

        expect(listarFilaResponse.status).toBe(200);
        expect(listarFilaResponse.body.tickets.length).toBeGreaterThan(0);
        const ticketNaFila = listarFilaResponse.body.tickets.find(
          (t: any) => t.id === ticketId
        );
        expect(ticketNaFila).toBeDefined();

        // ETAPA 5: Operador chama o ticket
        const chamarResponse = await request(app)
          .post(`/api/v1/tickets/${ticketId}/chamar`)
          .set('Authorization', `Bearer ${operadorToken}`);

        expect(chamarResponse.status).toBe(200);
        expect(chamarResponse.body.ticket.status).toBe('CHAMADO');

        // ETAPA 6: Cliente recebe notificação (validado em websocket-e2e-cliente.test.ts)
        // ETAPA 7: Operador finaliza o atendimento
        const finalizarResponse = await request(app)
          .post(`/api/v1/tickets/${ticketId}/finalizar`)
          .set('Authorization', `Bearer ${operadorToken}`);

        expect(finalizarResponse.status).toBe(200);
        expect(finalizarResponse.body.ticket.status).toBe('FINALIZADO');

        // ETAPA 8: Validar estatísticas atualizadas
        const perfilResponse = await request(app)
          .get('/api/v1/cliente/perfil')
          .set('Authorization', `Bearer ${tokenCliente}`);

        expect(perfilResponse.status).toBe(200);
        expect(perfilResponse.body.totalVisitas).toBe(i);
      }

      // ====================================
      // VALIDAÇÃO FINAL: Estatísticas do cliente
      // ====================================
      const perfilFinalResponse = await request(app)
        .get('/api/v1/cliente/perfil')
        .set('Authorization', `Bearer ${tokenCliente}`);

      expect(perfilFinalResponse.status).toBe(200);
      expect(perfilFinalResponse.body.totalVisitas).toBe(3);
      expect(perfilFinalResponse.body.totalFastLane).toBe(0);
      expect(perfilFinalResponse.body.totalNoShows).toBe(0);
    });
  });

  describe('2. Fluxo de Cancelamento pelo Cliente', () => {
    it('deve cancelar ticket sem incrementar estatísticas', async () => {
      const timestamp = Date.now();
      const emailCliente = `e2e-cancelamento-${timestamp}@teste.com`;
      const telefoneCliente = `(11) 9${timestamp.toString().slice(-8)}`;

      // ETAPA 1: Cadastro
      const cadastroResponse = await request(app)
        .post('/api/v1/auth/cliente/cadastro')
        .send({
          restauranteSlug: 'restaurante-sp-centro',
          nomeCompleto: 'Cliente Cancelamento E2E',
          email: emailCliente,
          telefone: telefoneCliente,
          senha: 'senha123',
          cidade: 'São Paulo',
          estado: 'SP',
        });

      expect(cadastroResponse.status).toBe(201);
      const tokenCliente = cadastroResponse.body.token;

      // ETAPA 2: Cliente entra na fila
      const entrarFilaResponse = await request(app)
        .post(`/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar`)
        .set('Authorization', `Bearer ${tokenCliente}`)
        .send({
          prioridade: 'NORMAL',
          quantidadePessoas: 3,
        });

      expect(entrarFilaResponse.status).toBe(201);
      const ticketId = entrarFilaResponse.body.ticket.id;
      expect(entrarFilaResponse.body.ticket.status).toBe('AGUARDANDO');

      // Validar estatísticas antes do cancelamento
      const perfilAntes = await request(app)
        .get('/api/v1/cliente/perfil')
        .set('Authorization', `Bearer ${tokenCliente}`);

      expect(perfilAntes.body.totalVisitas).toBe(0);

      // ETAPA 3: Cliente desiste e cancela
      const cancelarResponse = await request(app)
        .post(`/api/v1/cliente/ticket/${ticketId}/cancelar`)
        .set('Authorization', `Bearer ${tokenCliente}`)
        .send({
          motivo: 'Mudei de ideia',
        });

      expect(cancelarResponse.status).toBe(200);
      expect(cancelarResponse.body.ticket.status).toBe('CANCELADO');

      // ETAPA 4: Operador vê ticket como cancelado
      const loginOperadorResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'operador-cliente@teste.com',
          senha: 'senha123',
        });

      const operadorToken = loginOperadorResponse.body.token;

      const ticketDetalheResponse = await request(app)
        .get(`/api/v1/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${operadorToken}`);

      expect(ticketDetalheResponse.status).toBe(200);
      expect(ticketDetalheResponse.body.status).toBe('CANCELADO');

      // ETAPA 5: Estatísticas NÃO são incrementadas
      const perfilDepois = await request(app)
        .get('/api/v1/cliente/perfil')
        .set('Authorization', `Bearer ${tokenCliente}`);

      expect(perfilDepois.body.totalVisitas).toBe(0); // Não incrementou
      expect(perfilDepois.body.totalNoShows).toBe(0);
      expect(perfilDepois.body.totalFastLane).toBe(0);
      expect(perfilDepois.body.totalVip).toBe(0);

      // Validar que evento de cancelamento foi registrado
      const evento = await prisma.eventoTicket.findFirst({
        where: {
          ticketId: ticketId,
          tipo: 'CANCELADO',
        },
      });

      expect(evento).toBeTruthy();
      expect(evento?.tipoAtor).toBe('CLIENTE');
    }, 30000);
  });

  describe('3. Fluxo de No-Show', () => {
    it('deve marcar no-show e incrementar totalNoShows', async () => {
      const timestamp = Date.now();
      const emailCliente = `e2e-noshow-${timestamp}@teste.com`;
      const telefoneCliente = `(11) 9${timestamp.toString().slice(-8)}`;

      // ETAPA 1: Cadastro
      const cadastroResponse = await request(app)
        .post('/api/v1/auth/cliente/cadastro')
        .send({
          restauranteSlug: 'restaurante-sp-centro',
          nomeCompleto: 'Cliente No-Show E2E',
          email: emailCliente,
          telefone: telefoneCliente,
          senha: 'senha123',
          cidade: 'São Paulo',
          estado: 'SP',
        });

      expect(cadastroResponse.status).toBe(201);
      const tokenCliente = cadastroResponse.body.token;

      // ETAPA 2: Login do operador
      const loginOperadorResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'operador-cliente@teste.com',
          senha: 'senha123',
        });

      const operadorToken = loginOperadorResponse.body.token;

      // ETAPA 3: Cliente entra na fila
      const entrarFilaResponse = await request(app)
        .post(`/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar`)
        .set('Authorization', `Bearer ${tokenCliente}`)
        .send({
          prioridade: 'NORMAL',
          quantidadePessoas: 2,
        });

      expect(entrarFilaResponse.status).toBe(201);
      const ticketId = entrarFilaResponse.body.ticket.id;

      // ETAPA 4: Operador chama o ticket
      const chamarResponse = await request(app)
        .post(`/api/v1/tickets/${ticketId}/chamar`)
        .set('Authorization', `Bearer ${operadorToken}`);

      expect(chamarResponse.status).toBe(200);
      expect(chamarResponse.body.ticket.status).toBe('CHAMADO');

      // ETAPA 5: Cliente não comparece
      // (Simulado - na prática seria esperar timeout ou ação manual)

      // ETAPA 6: Operador marca no-show
      const noShowResponse = await request(app)
        .post(`/api/v1/tickets/${ticketId}/no-show`)
        .set('Authorization', `Bearer ${operadorToken}`);

      expect(noShowResponse.status).toBe(200);
      expect(noShowResponse.body.ticket.status).toBe('NO_SHOW');

      // ETAPA 7: totalNoShows do cliente é incrementado
      const perfilResponse = await request(app)
        .get('/api/v1/cliente/perfil')
        .set('Authorization', `Bearer ${tokenCliente}`);

      expect(perfilResponse.status).toBe(200);
      expect(perfilResponse.body.totalNoShows).toBe(1);
      expect(perfilResponse.body.totalVisitas).toBe(0); // Não conta como visita

      // ETAPA 8: Validar que evento foi registrado
      const evento = await prisma.eventoTicket.findFirst({
        where: {
          ticketId: ticketId,
          tipo: 'NO_SHOW',
        },
      });

      expect(evento).toBeTruthy();
      expect(evento?.tipoAtor).toBe('OPERADOR');

      // ETAPA 9: Simular múltiplos no-shows para validar bloqueio (se configurado)
      // Repetir processo mais 2 vezes
      for (let i = 2; i <= 3; i++) {
        const entrarResponse = await request(app)
          .post(`/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar`)
          .set('Authorization', `Bearer ${tokenCliente}`)
          .send({ prioridade: 'NORMAL', quantidadePessoas: 1 });

        const tId = entrarResponse.body.ticket.id;

        await request(app)
          .post(`/api/v1/tickets/${tId}/chamar`)
          .set('Authorization', `Bearer ${operadorToken}`);

        await request(app)
          .post(`/api/v1/tickets/${tId}/no-show`)
          .set('Authorization', `Bearer ${operadorToken}`);
      }

      // Validar totalNoShows final
      const perfilFinalResponse = await request(app)
        .get('/api/v1/cliente/perfil')
        .set('Authorization', `Bearer ${tokenCliente}`);

      expect(perfilFinalResponse.body.totalNoShows).toBe(3);
      expect(perfilFinalResponse.body.totalVisitas).toBe(0);

      // Cliente pode ser bloqueado automaticamente (depende de configuração do restaurante)
      // Validação adicional: se restaurante tiver configuração de bloqueio após N no-shows
      const clienteDb = await prisma.cliente.findUnique({
        where: { id: cadastroResponse.body.cliente.id },
        select: { bloqueado: true, motivoBloqueio: true, totalNoShows: true },
      });

      expect(clienteDb?.totalNoShows).toBe(3);
      // bloqueado pode ser true ou false dependendo da configuração do restaurante
      // Para MVP, apenas validamos que o contador está correto
    }, 45000);
  });

  describe('4. Fluxo de Prioridade FAST_LANE e VIP', () => {
    it('deve cobrar taxa FAST_LANE e incrementar totalFastLane', async () => {
      const timestamp = Date.now();
      const emailCliente = `e2e-fastlane-${timestamp}@teste.com`;
      const telefoneCliente = `(11) 9${timestamp.toString().slice(-8)}`;

      // Cadastro
      const cadastroResponse = await request(app)
        .post('/api/v1/auth/cliente/cadastro')
        .send({
          restauranteSlug: 'restaurante-sp-centro',
          nomeCompleto: 'Cliente FastLane E2E',
          email: emailCliente,
          telefone: telefoneCliente,
          senha: 'senha123',
          cidade: 'São Paulo',
          estado: 'SP',
        });

      const tokenCliente = cadastroResponse.body.token;

      // Login operador
      const loginOperadorResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'operador-cliente@teste.com', senha: 'senha123' });

      const operadorToken = loginOperadorResponse.body.token;

      // Cliente entra com FAST_LANE
      const entrarResponse = await request(app)
        .post(`/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar`)
        .set('Authorization', `Bearer ${tokenCliente}`)
        .send({
          prioridade: 'FAST_LANE',
          quantidadePessoas: 2,
        });

      expect(entrarResponse.status).toBe(201);
      expect(entrarResponse.body.ticket.prioridade).toBe('FAST_LANE');
      expect(entrarResponse.body.ticket.valorPrioridade).toBeGreaterThan(0);

      const ticketId = entrarResponse.body.ticket.id;

      // Chamar e finalizar
      await request(app)
        .post(`/api/v1/tickets/${ticketId}/chamar`)
        .set('Authorization', `Bearer ${operadorToken}`);

      const finalizarResponse = await request(app)
        .post(`/api/v1/tickets/${ticketId}/finalizar`)
        .set('Authorization', `Bearer ${operadorToken}`);

      expect(finalizarResponse.status).toBe(200);

      // Validar estatísticas
      const perfilResponse = await request(app)
        .get('/api/v1/cliente/perfil')
        .set('Authorization', `Bearer ${tokenCliente}`);

      expect(perfilResponse.body.totalVisitas).toBe(1);
      expect(perfilResponse.body.totalFastLane).toBe(1);
      expect(perfilResponse.body.totalVip).toBe(0);
    }, 30000);
  });
});
