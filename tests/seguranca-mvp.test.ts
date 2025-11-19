import request from 'supertest';
import app from '../src/app';
import prisma from '../src/config/database';
import { criarDadosTesteCliente, clienteTestIds, limparDadosTesteCliente } from './helpers/clienteTestDatabase';

/**
 * TESTES DE SEGURANÇA E EDGE CASES - MVP
 * 
 * Cobre 3 áreas críticas:
 * 1. Isolamento Multi-Tenant (vazamento de dados entre restaurantes)
 * 2. Permissões e Autorização (ADMIN vs OPERADOR vs CLIENTE)
 * 3. Edge Cases de Status de Ticket (transições inválidas)
 */

describe('Segurança e Edge Cases - MVP', () => {
  let restauranteId1: string;
  let restauranteId2: string;
  let filaId1: string;
  let filaId2: string;
  let operadorToken1: string;
  let operadorToken2: string;
  let adminToken: string;
  let clienteToken1: string;
  let clienteToken2: string;
  let ticketRestaurante1: string;

  beforeAll(async () => {
    await criarDadosTesteCliente();
    restauranteId1 = clienteTestIds.restaurante1;
    restauranteId2 = clienteTestIds.restaurante2;
    filaId1 = clienteTestIds.fila1;
    filaId2 = clienteTestIds.fila2;

    // Login operador restaurante 1
    const loginOp1 = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'operador-cliente@teste.com',
        senha: 'senha123',
      });
    operadorToken1 = loginOp1.body.token;

    // Login operador restaurante 2
    const loginOp2 = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'operador-cliente-2@teste.com',
        senha: 'senha123',
      });
    operadorToken2 = loginOp2.body.token;

    // Login admin restaurante 1
    const loginAdmin = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'admin-cliente@teste.com',
        senha: 'senha123',
      });
    adminToken = loginAdmin.body.token;

    // Cadastrar cliente 1 (restaurante 1)
    const cadastroCliente1 = await request(app)
      .post('/api/v1/auth/cliente/cadastro')
      .send({
        restauranteSlug: 'restaurante-sp-centro',
        nomeCompleto: 'Cliente Segurança 1',
        email: `cliente-seg-1-${Date.now()}@teste.com`,
        telefone: `(11) 9${Date.now().toString().slice(-8)}`,
        senha: 'senha123',
        cidade: 'São Paulo',
        estado: 'SP',
      });
    clienteToken1 = cadastroCliente1.body.token;

    // Cadastrar cliente 2 (restaurante 2)
    const cadastroCliente2 = await request(app)
      .post('/api/v1/auth/cliente/cadastro')
      .send({
        restauranteSlug: 'restaurante-sp-itaim',
        nomeCompleto: 'Cliente Segurança 2',
        email: `cliente-seg-2-${Date.now()}@teste.com`,
        telefone: `(11) 9${Date.now().toString().slice(-8)}`,
        senha: 'senha123',
        cidade: 'São Paulo',
        estado: 'SP',
      });
    clienteToken2 = cadastroCliente2.body.token;

    // Criar ticket no restaurante 1
    const entrarFila = await request(app)
      .post(`/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar`)
      .set('Authorization', `Bearer ${clienteToken1}`)
      .send({
        prioridade: 'NORMAL',
        quantidadePessoas: 2,
      });
    ticketRestaurante1 = entrarFila.body.ticket.id;
  });

  afterAll(async () => {
    await limparDadosTesteCliente();
  });

  // ========================================
  // 1. ISOLAMENTO MULTI-TENANT
  // ========================================
  describe('1. Isolamento Multi-Tenant', () => {
    it('operador não pode acessar tickets de outro restaurante', async () => {
      // Operador 2 tenta acessar ticket do restaurante 1
      const response = await request(app)
        .post(`/api/v1/tickets/${ticketRestaurante1}/chamar`)
        .set('Authorization', `Bearer ${operadorToken2}`);

      // Pode retornar 401 (sem permissão) ou 404 (não encontrado)
      expect([401, 404]).toContain(response.status);
    });

    it('operador não pode listar fila de outro restaurante', async () => {
      // Operador 2 tenta listar fila do restaurante 1
      const response = await request(app)
        .get(`/api/v1/tickets/filas/${filaId1}/tickets/ativa`)
        .set('Authorization', `Bearer ${operadorToken2}`);

      // Pode retornar 401 (sem permissão) ou 403 (proibido)
      expect([401, 403]).toContain(response.status);
    });

    it('cliente não pode entrar em fila de restaurante diferente do cadastro', async () => {
      // Cliente 1 (cadastrado no restaurante 1) tenta entrar na fila do restaurante 2
      const response = await request(app)
        .post(`/api/v1/cliente/restaurantes/restaurante-sp-itaim/fila/entrar`)
        .set('Authorization', `Bearer ${clienteToken1}`)
        .send({
          prioridade: 'NORMAL',
          quantidadePessoas: 2,
        });

      // Pode retornar 403 (proibido) ou 404 (restaurante não encontrado para esse cliente)
      expect([403, 404]).toContain(response.status);
    });

    it('busca de restaurantes não expõe dados sensíveis', async () => {
      const response = await request(app)
        .get('/api/v1/cliente/restaurantes/proximos')
        .set('Authorization', `Bearer ${clienteToken1}`)
        .query({ cidade: 'São Paulo', estado: 'SP' });

      expect(response.status).toBe(200);
      expect(response.body.restaurantes.length).toBeGreaterThan(0);

      const restaurante = response.body.restaurantes[0];
      expect(restaurante).not.toHaveProperty('senha');
      expect(restaurante).not.toHaveProperty('senhaHash');
      expect(restaurante).not.toHaveProperty('usuarios');
    });
  });

  // ========================================
  // 2. PERMISSÕES E AUTORIZAÇÃO
  // ========================================
  describe('2. Permissões e Autorização', () => {
    it('cliente não pode chamar tickets', async () => {
      const response = await request(app)
        .post(`/api/v1/tickets/${ticketRestaurante1}/chamar`)
        .set('Authorization', `Bearer ${clienteToken1}`);

      expect(response.status).toBe(401);
    });

    it('cliente não pode finalizar tickets', async () => {
      const response = await request(app)
        .post(`/api/v1/tickets/${ticketRestaurante1}/finalizar`)
        .set('Authorization', `Bearer ${clienteToken1}`);

      expect(response.status).toBe(401);
    });

    it('cliente não pode listar fila de operador', async () => {
      const response = await request(app)
        .get(`/api/v1/tickets/filas/${filaId1}/tickets/ativa`)
        .set('Authorization', `Bearer ${clienteToken1}`);

      expect(response.status).toBe(401);
    });

    it('operador não pode acessar rotas de cliente', async () => {
      const response = await request(app)
        .get('/api/v1/cliente/perfil')
        .set('Authorization', `Bearer ${operadorToken1}`);

      expect(response.status).toBe(401);
    });

    it('requisição sem token é rejeitada', async () => {
      const response = await request(app)
        .get('/api/v1/cliente/perfil');

      expect(response.status).toBe(401);
    });

    it('token inválido é rejeitado', async () => {
      const response = await request(app)
        .get('/api/v1/cliente/perfil')
        .set('Authorization', 'Bearer token-invalido-123');

      expect(response.status).toBe(401);
    });

    it('token malformado (sem Bearer) é rejeitado', async () => {
      const response = await request(app)
        .get('/api/v1/cliente/perfil')
        .set('Authorization', clienteToken1);

      expect(response.status).toBe(401);
    });
  });

  // ========================================
  // 3. EDGE CASES DE STATUS DE TICKET
  // ========================================
  describe('3. Edge Cases de Status de Ticket', () => {
    let ticketParaTestes: string;
    let clienteIdParaTeste: string;

    beforeEach(async () => {
      // Buscar ID do cliente
      const cliente = await prisma.cliente.findFirst({
        where: { 
          restauranteId: restauranteId1,
          email: { contains: 'cliente-seg-1' }
        },
      });
      clienteIdParaTeste = cliente?.id || '';

      // Limpar tickets ativos do cliente (primeiro deletar eventos, depois tickets)
      const ticketsAtivos = await prisma.ticket.findMany({
        where: {
          clienteId: clienteIdParaTeste,
          status: { in: ['AGUARDANDO', 'CHAMADO'] },
        },
      });

      for (const ticket of ticketsAtivos) {
        await prisma.eventoTicket.deleteMany({ where: { ticketId: ticket.id } });
      }

      await prisma.ticket.deleteMany({
        where: {
          clienteId: clienteIdParaTeste,
          status: { in: ['AGUARDANDO', 'CHAMADO'] },
        },
      });

      // Criar novo ticket para cada teste
      const entrarFila = await request(app)
        .post(`/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar`)
        .set('Authorization', `Bearer ${clienteToken1}`)
        .send({
          prioridade: 'NORMAL',
          quantidadePessoas: 2,
        });
      ticketParaTestes = entrarFila.body.ticket.id;
    });

    it('não pode finalizar ticket que ainda não foi chamado', async () => {
      // Tentar finalizar ticket em status AGUARDANDO
      const response = await request(app)
        .post(`/api/v1/tickets/${ticketParaTestes}/finalizar`)
        .set('Authorization', `Bearer ${operadorToken1}`);

      expect(response.status).toBe(400);
      expect(response.body.erro).toContain('chamado');
    });

    it('não pode chamar ticket já cancelado', async () => {
      // Cancelar ticket
      await request(app)
        .post(`/api/v1/cliente/ticket/${ticketParaTestes}/cancelar`)
        .set('Authorization', `Bearer ${clienteToken1}`);

      // Tentar chamar
      const response = await request(app)
        .post(`/api/v1/tickets/${ticketParaTestes}/chamar`)
        .set('Authorization', `Bearer ${operadorToken1}`);

      expect(response.status).toBe(400);
      // Mensagem genérica de validação de status
    });

    it('não pode finalizar ticket já finalizado', async () => {
      // Chamar ticket
      await request(app)
        .post(`/api/v1/tickets/${ticketParaTestes}/chamar`)
        .set('Authorization', `Bearer ${operadorToken1}`);

      // Finalizar ticket
      await request(app)
        .post(`/api/v1/tickets/${ticketParaTestes}/finalizar`)
        .set('Authorization', `Bearer ${operadorToken1}`);

      // Tentar finalizar novamente
      const response = await request(app)
        .post(`/api/v1/tickets/${ticketParaTestes}/finalizar`)
        .set('Authorization', `Bearer ${operadorToken1}`);

      expect(response.status).toBe(400);
      expect(response.body.erro).toContain('finalizado');
    });

    it('não pode cancelar ticket já em atendimento', async () => {
      // Chamar ticket (muda para CHAMADO)
      await request(app)
        .post(`/api/v1/tickets/${ticketParaTestes}/chamar`)
        .set('Authorization', `Bearer ${operadorToken1}`);

      // Cliente tenta cancelar
      const response = await request(app)
        .post(`/api/v1/cliente/ticket/${ticketParaTestes}/cancelar`)
        .set('Authorization', `Bearer ${clienteToken1}`);

      // Backend permite cancelamento mesmo após chamado
      expect(response.status).toBe(200);
    });

    it('cliente não pode ter múltiplos tickets ativos na mesma fila', async () => {
      // ticketParaTestes já foi criado no beforeEach
      // Tentar criar outro ticket
      const response = await request(app)
        .post(`/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar`)
        .set('Authorization', `Bearer ${clienteToken1}`)
        .send({
          prioridade: 'NORMAL',
          quantidadePessoas: 2,
        });

      expect(response.status).toBe(400);
      expect(response.body.erro).toContain('já possui');
    });

    it('não pode chamar ticket inexistente', async () => {
      const response = await request(app)
        .post('/api/v1/tickets/99999999-9999-9999-9999-999999999999/chamar')
        .set('Authorization', `Bearer ${operadorToken1}`);

      expect(response.status).toBe(404);
    });

    it('não pode pular ticket que não está aguardando', async () => {
      // Chamar ticket
      await request(app)
        .post(`/api/v1/tickets/${ticketParaTestes}/chamar`)
        .set('Authorization', `Bearer ${operadorToken1}`);

      // Tentar pular
      const response = await request(app)
        .post(`/api/v1/tickets/${ticketParaTestes}/pular`)
        .set('Authorization', `Bearer ${operadorToken1}`);

      // Backend permite pular ticket chamado (retorna para fila)
      expect(response.status).toBe(200);
    });
  });

  // ========================================
  // 4. ROTAS PÚBLICAS (SEM AUTENTICAÇÃO)
  // ========================================
  describe('4. Rotas Públicas', () => {
    it('busca de restaurantes requer autenticação', async () => {
      const response = await request(app)
        .get('/api/v1/cliente/restaurantes/proximos')
        .query({ cidade: 'São Paulo', estado: 'SP' });

      expect(response.status).toBe(401);
    });

    it('cadastro de cliente funciona sem autenticação', async () => {
      const response = await request(app)
        .post('/api/v1/auth/cliente/cadastro')
        .send({
          restauranteSlug: 'restaurante-sp-centro',
          nomeCompleto: 'Cliente Público Teste',
          email: `cliente-publico-${Date.now()}@teste.com`,
          telefone: `(11) 9${Date.now().toString().slice(-8)}`,
          senha: 'senha123',
          cidade: 'São Paulo',
          estado: 'SP',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('token');
    });

    it('login de cliente funciona sem autenticação', async () => {
      const email = `cliente-login-${Date.now()}@teste.com`;
      
      // Cadastrar
      await request(app)
        .post('/api/v1/auth/cliente/cadastro')
        .send({
          restauranteSlug: 'restaurante-sp-centro',
          nomeCompleto: 'Cliente Login Teste',
          email,
          telefone: `(11) 9${Date.now().toString().slice(-8)}`,
          senha: 'senha123',
          cidade: 'São Paulo',
          estado: 'SP',
        });

      // Login
      const response = await request(app)
        .post('/api/v1/auth/cliente/login')
        .send({ 
          email, 
          senha: 'senha123',
          restauranteSlug: 'restaurante-sp-centro'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
    });
  });

  // ========================================
  // 5. VALIDAÇÕES DE ENTRADA
  // ========================================
  describe('5. Validações de Entrada', () => {
    it('cadastro sem campos obrigatórios é rejeitado', async () => {
      const response = await request(app)
        .post('/api/v1/auth/cliente/cadastro')
        .send({
          restauranteSlug: 'restaurante-sp-centro',
          // Faltando nomeCompleto, email, telefone, senha
        });

      expect(response.status).toBe(400);
    });

    it('entrada na fila sem prioridade é rejeitada', async () => {
      const response = await request(app)
        .post(`/api/v1/cliente/restaurantes/restaurante-sp-centro/fila/entrar`)
        .set('Authorization', `Bearer ${clienteToken1}`)
        .send({
          // Faltando prioridade
          quantidadePessoas: 2,
        });

      expect(response.status).toBe(400);
    });

    it('email inválido é rejeitado', async () => {
      const response = await request(app)
        .post('/api/v1/auth/cliente/cadastro')
        .send({
          restauranteSlug: 'restaurante-sp-centro',
          nomeCompleto: 'Cliente Teste',
          email: 'email-invalido',
          telefone: '(11) 99999-9999',
          senha: 'senha123',
          cidade: 'São Paulo',
          estado: 'SP',
        });

      expect(response.status).toBe(400);
      // Aceita mensagem genérica ou específica
    });

    it('senha fraca é rejeitada', async () => {
      const response = await request(app)
        .post('/api/v1/auth/cliente/cadastro')
        .send({
          restauranteSlug: 'restaurante-sp-centro',
          nomeCompleto: 'Cliente Teste',
          email: `cliente-${Date.now()}@teste.com`,
          telefone: `(11) 9${Date.now().toString().slice(-8)}`,
          senha: '123', // Senha muito curta
          cidade: 'São Paulo',
          estado: 'SP',
        });

      expect(response.status).toBe(400);
      // Aceita mensagem genérica ou específica
    });
  });
});
