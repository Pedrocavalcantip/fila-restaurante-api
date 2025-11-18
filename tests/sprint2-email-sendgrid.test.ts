import prisma from '../src/config/database';
import * as notificacaoService from '../src/services/notificacaoService';
import {
  criarDadosTesteCliente,
  limparDadosTesteCliente,
  clienteTestIds,
} from './helpers/clienteTestDatabase';

/**
 * TESTES DO SERVIÇO DE NOTIFICAÇÕES (SendGrid)
 * 
 * Estes testes validam a LÓGICA do serviço de notificações.
 * NÃO fazem envio real de emails (requer SENDGRID_API_KEY configurada).
 */

describe('Sprint 2 - Email e Notificações SendGrid (Tópico 7)', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await limparDadosTesteCliente();
    await criarDadosTesteCliente();
  });

  afterAll(async () => {
    await limparDadosTesteCliente();
    await prisma.$disconnect();
  });

  describe('1. Estrutura e Configuração', () => {
    it('deve ter função enviarBoasVindas exportada', () => {
      expect(typeof notificacaoService.enviarBoasVindas).toBe('function');
    });

    it('deve ter função enviarChamado exportada', () => {
      expect(typeof notificacaoService.enviarChamado).toBe('function');
    });

    it('deve funcionar sem SENDGRID_API_KEY configurada', async () => {
      const payload: notificacaoService.BoasVindasPayload = {
        clienteId: clienteTestIds.cliente1,
        restauranteId: clienteTestIds.restaurante1,
        nomeCompleto: 'Cliente Teste',
        email: 'teste@teste.com',
        telefone: '(11) 99999-9999',
        cidade: 'São Paulo',
        estado: 'SP',
      };

      await expect(notificacaoService.enviarBoasVindas(payload)).resolves.not.toThrow();
    });
  });

  describe('2. Funcionalidade de Envio', () => {
    it('deve processar boas-vindas sem erros', async () => {
      const payload: notificacaoService.BoasVindasPayload = {
        clienteId: clienteTestIds.cliente1,
        restauranteId: clienteTestIds.restaurante1,
        nomeCompleto: 'Cliente Teste Boas Vindas',
        email: 'cliente-bv@teste.com',
        telefone: '(11) 91111-1111',
        cidade: 'São Paulo',
        estado: 'SP',
      };

      await expect(notificacaoService.enviarBoasVindas(payload)).resolves.not.toThrow();
    });

    it('deve processar chamado sem erros', async () => {
      const ticket = await prisma.ticket.create({
        data: {
          restauranteId: clienteTestIds.restaurante1,
          filaId: clienteTestIds.fila1,
          clienteId: clienteTestIds.cliente1,
          nomeCliente: 'Cliente Teste Chamado',
          numeroTicket: 'A-999',
          status: 'CHAMADO',
          prioridade: 'NORMAL',
          valorPrioridade: 0,
          tipoEntrada: 'REMOTO',
        },
      });

      const payload: notificacaoService.ChamadoPayload = {
        ticketId: ticket.id,
        clienteId: clienteTestIds.cliente1,
        nomeCliente: 'Cliente Teste Chamado',
        emailCliente: 'cliente-chamado@teste.com',
        numeroTicket: 'A-999',
        nomeRestaurante: 'Restaurante Teste',
        restauranteId: clienteTestIds.restaurante1,
        prioridade: 'NORMAL',
        valorPrioridade: 0,
      };

      await expect(notificacaoService.enviarChamado(payload)).resolves.not.toThrow();

      // Limpar
      await prisma.eventoTicket.deleteMany({ where: { ticketId: ticket.id } });
      await prisma.notificacao.deleteMany({ where: { ticketId: ticket.id } });
      await prisma.ticket.delete({ where: { id: ticket.id } });
    });
  });

  describe('3. Validação de Payload', () => {
    it('deve processar boas-vindas com campos opcionais ausentes', async () => {
      const payload: notificacaoService.BoasVindasPayload = {
        clienteId: clienteTestIds.cliente1,
        restauranteId: clienteTestIds.restaurante1,
        nomeCompleto: 'Cliente Mínimo',
        email: 'minimo@teste.com',
      };

      await expect(notificacaoService.enviarBoasVindas(payload)).resolves.not.toThrow();
    });

    it('deve processar chamado com campos opcionais ausentes', async () => {
      const ticket = await prisma.ticket.create({
        data: {
          restauranteId: clienteTestIds.restaurante1,
          filaId: clienteTestIds.fila1,
          nomeCliente: 'Cliente Sem Email',
          numeroTicket: 'C-001',
          status: 'CHAMADO',
          prioridade: 'NORMAL',
          valorPrioridade: 0,
          tipoEntrada: 'LOCAL',
        },
      });

      const payload: notificacaoService.ChamadoPayload = {
        ticketId: ticket.id,
        nomeCliente: 'Cliente Sem Email',
        numeroTicket: 'C-001',
        nomeRestaurante: 'Restaurante Teste',
        restauranteId: clienteTestIds.restaurante1,
        prioridade: 'NORMAL',
        valorPrioridade: 0,
      };

      await expect(notificacaoService.enviarChamado(payload)).resolves.not.toThrow();

      // Limpar
      await prisma.eventoTicket.deleteMany({ where: { ticketId: ticket.id } });
      await prisma.notificacao.deleteMany({ where: { ticketId: ticket.id } });
      await prisma.ticket.delete({ where: { id: ticket.id } });
    });
  });

  describe('4. Templates do Banco de Dados', () => {
    it('deve buscar template de boas-vindas do restaurante', async () => {
      const template = await prisma.templatesMensagem.findFirst({
        where: {
          restauranteId: clienteTestIds.restaurante1,
          chave: 'cliente.boas_vindas',
        },
      });

      expect(template).not.toBeNull();
      expect(template?.assunto).toBeDefined();
      expect(template?.conteudo).toBeDefined();
    });

    it('deve buscar template de chamado do restaurante', async () => {
      const template = await prisma.templatesMensagem.findFirst({
        where: {
          restauranteId: clienteTestIds.restaurante1,
          chave: 'ticket.chamado',
        },
      });

      expect(template).not.toBeNull();
      expect(template?.assunto).toBeDefined();
      expect(template?.conteudo).toBeDefined();
    });
  });

  describe('5. Integração com Cadastro de Cliente', () => {
    it('cadastro de cliente deve poder chamar enviarBoasVindas', async () => {
      const emailTeste = 'novo-cliente-notif@teste.com';

      const cliente = await prisma.cliente.create({
        data: {
          restauranteId: clienteTestIds.restaurante1,
          nomeCompleto: 'Cliente Novo Notificação',
          email: emailTeste,
          senhaHash: 'hash123',
          telefone: '(11) 99999-9999',
          cidade: 'São Paulo',
          estado: 'SP',
        },
      });

      await expect(
        notificacaoService.enviarBoasVindas({
          clienteId: cliente.id,
          restauranteId: clienteTestIds.restaurante1,
          nomeCompleto: cliente.nomeCompleto,
          email: cliente.email,
          telefone: cliente.telefone || undefined,
          cidade: cliente.cidade || undefined,
          estado: cliente.estado || undefined,
        })
      ).resolves.not.toThrow();

      // Limpar
      await prisma.cliente.delete({ where: { id: cliente.id } });
    });
  });

  describe('6. Múltiplas Chamadas', () => {
    it('deve permitir múltiplas chamadas de enviarBoasVindas', async () => {
      const payload1: notificacaoService.BoasVindasPayload = {
        clienteId: clienteTestIds.cliente1,
        restauranteId: clienteTestIds.restaurante1,
        nomeCompleto: 'Cliente Multi',
        email: 'multi1@teste.com',
      };

      const payload2: notificacaoService.BoasVindasPayload = {
        clienteId: clienteTestIds.cliente1,
        restauranteId: clienteTestIds.restaurante1,
        nomeCompleto: 'Cliente Multi',
        email: 'multi2@teste.com',
      };

      await expect(notificacaoService.enviarBoasVindas(payload1)).resolves.not.toThrow();
      await expect(notificacaoService.enviarBoasVindas(payload2)).resolves.not.toThrow();
    });
  });
});
