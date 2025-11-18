import { io } from '../server';
import { logger } from '../config/logger';
import prisma from '../config/database';
import { StatusTicket } from '@prisma/client';

/**
 * ========================================
 * DOCUMENTAÇÃO - EVENTOS WEBSOCKET
 * ========================================
 * 
 * EVENTOS EMITIDOS PELO CLIENTE:
 * - entrar-fila: { filaId: string } 
 *   Cliente operador entra na sala da fila para receber atualizações
 * 
 * - sair-fila: { filaId: string }
 *   Cliente operador sai da sala da fila
 * 
 * - entrar-ticket: { ticketId: string, clienteId?: string }
 *   Cliente APP entra na sala do ticket para receber notificações personalizadas
 * 
 * - sair-ticket: { ticketId: string }
 *   Cliente APP sai da sala do ticket
 * 
 * ========================================
 * EVENTOS RECEBIDOS PELO CLIENTE APP:
 * - ticket:posicao: { ticketId, posicao, tempoEstimado, timestamp }
 *   Notifica mudança de posição na fila
 * 
 * - ticket:proximo: { ticketId, posicao, mensagem, timestamp }
 *   Notifica que faltam 2 pessoas (prepare-se)
 * 
 * - ticket:chamado: { ticketId, numeroTicket, mensagem, timestamp }
 *   Notifica que é a vez do cliente comparecer
 * 
 * - ticket:cancelado: { ticketId, timestamp }
 *   Notifica cancelamento do ticket
 * 
 * ========================================
 * EVENTOS RECEBIDOS PELO OPERADOR:
 * - fila:atualizada: { filaId, tickets[], timestamp }
 *   Lista completa de tickets da fila atualizada
 * 
 * - ticket:criado: { ticket, timestamp }
 *   Novo ticket criado na fila
 * 
 * - ticket:finalizado: { ticketId, timestamp }
 *   Ticket finalizado
 * 
 * - ticket:no-show: { ticketId, timestamp }
 *   Ticket marcado como no-show
 * ========================================
 */

export class SocketService {


  static emitirParaRestaurante(
    restauranteId: string, 
    evento: string, 
    dados: any
  ): void {
    try {
      const namespace = io.of(`/restaurante/${restauranteId}`);
      namespace.emit(evento, dados);
      
      logger.debug({ 
        restauranteId, 
        evento, 
        quantidadeClientes: namespace.sockets.size 
      }, 'Evento emitido para restaurante');
    } catch (error) {
      logger.error({ restauranteId, evento, error }, 'Erro ao emitir evento Socket.io');
    }
  }


  static emitirParaFila(
    restauranteId: string,
    filaId: string,
    evento: string,
    dados: any
  ): void {
    try {
      const namespace = io.of(`/restaurante/${restauranteId}`);
      namespace.to(`fila:${filaId}`).emit(evento, dados);
      
      logger.debug({ 
        restauranteId, 
        filaId, 
        evento 
      }, 'Evento emitido para fila específica');
    } catch (error) {
      logger.error({ restauranteId, filaId, evento, error }, 'Erro ao emitir evento para fila');
    }
  }

  static emitirParaTicket(
    restauranteId: string,
    ticketId: string,
    evento: string,
    dados: any
  ): void {
    try {
      const namespace = io.of(`/restaurante/${restauranteId}`);
      namespace.to(`ticket:${ticketId}`).emit(evento, dados);
      
      logger.debug({ 
        restauranteId, 
        ticketId, 
        evento 
      }, 'Evento emitido para ticket específico');
    } catch (error) {
      logger.error({ restauranteId, ticketId, evento, error }, 'Erro ao emitir evento para ticket');
    }
  }

  static async validarEEntrarNaSalaTicket(
    socket: any,
    ticketId: string,
    clienteId?: string
  ): Promise<boolean> {
    try {
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { 
          id: true, 
          clienteId: true, 
          restauranteId: true,
          status: true 
        }
      });

      if (!ticket) {
        socket.emit('erro', { 
          mensagem: 'Ticket não encontrado',
          codigo: 'TICKET_NAO_ENCONTRADO' 
        });
        return false;
      }

      // Se clienteId foi fornecido, validar ownership
      if (clienteId && ticket.clienteId !== clienteId) {
        socket.emit('erro', { 
          mensagem: 'Você não tem permissão para acessar este ticket',
          codigo: 'ACESSO_NEGADO' 
        });
        return false;
      }

      // Apenas tickets ativos devem receber notificações
      if (ticket.status !== StatusTicket.AGUARDANDO && ticket.status !== StatusTicket.CHAMADO) {
        socket.emit('erro', { 
          mensagem: 'Este ticket não está mais ativo',
          codigo: 'TICKET_INATIVO' 
        });
        return false;
      }

      // Cliente entra na sala do ticket
      socket.join(`ticket:${ticketId}`);
      
      logger.info({ 
        socketId: socket.id, 
        ticketId,
        clienteId,
        restauranteId: ticket.restauranteId
      }, 'Cliente entrou na sala do ticket');

      // Confirmar entrada
      socket.emit('ticket:entrou', { 
        ticketId,
        status: ticket.status,
        timestamp: new Date().toISOString()
      });

      return true;
    } catch (error) {
      logger.error({ ticketId, clienteId, error }, 'Erro ao validar entrada na sala do ticket');
      socket.emit('erro', { 
        mensagem: 'Erro ao entrar na sala do ticket',
        codigo: 'ERRO_INTERNO' 
      });
      return false;
    }
  }
 
  static async emitirFilaAtualizada(
    restauranteId: string,
    filaId: string,
    tickets: any[]
  ): Promise<void> {
    // Emitir para operadores (sala da fila)
    this.emitirParaFila(restauranteId, filaId, 'fila:atualizada', {
      filaId,
      tickets,
      timestamp: new Date().toISOString()
    });

    // Notificar cada ticket sobre sua posição atual
    for (const ticket of tickets) {
      if (ticket.posicao && ticket.posicao > 0) {
        this.emitirParaTicket(
          restauranteId,
          ticket.id,
          'ticket:posicao',
          {
            ticketId: ticket.id,
            posicao: ticket.posicao,
            tempoEstimado: ticket.tempoEstimado || 0,
            timestamp: new Date().toISOString()
          }
        );

        // Se faltam 2 pessoas, notificar "você é o próximo"
        if (ticket.posicao === 2) {
          this.emitirProximo(restauranteId, ticket.id, ticket.posicao);
        }
      }
    }
  }

  static emitirProximo(
    restauranteId: string,
    ticketId: string,
    posicao: number
  ): void {
    this.emitirParaTicket(
      restauranteId,
      ticketId,
      'ticket:proximo',
      {
        ticketId,
        posicao,
        mensagem: 'Você é o próximo! Prepare-se para ser chamado.',
        timestamp: new Date().toISOString()
      }
    );

    logger.info({ ticketId, posicao }, 'Cliente notificado que é o próximo');
  }

  static emitirTicketChamado(
    restauranteId: string,
    filaId: string,
    ticket: any
  ): void {
    // Emitir para operadores na sala da fila
    this.emitirParaFila(restauranteId, filaId, 'ticket:chamado', {
      ticketId: ticket.id,
      numeroTicket: ticket.numeroTicket,
      nomeCliente: ticket.nomeCliente,
      timestamp: new Date().toISOString()
    });

    // Emitir para o cliente específico na sala do ticket
    this.emitirParaTicket(
      restauranteId,
      ticket.id,
      'ticket:chamado',
      {
        ticketId: ticket.id,
        numeroTicket: ticket.numeroTicket,
        mensagem: 'É SUA VEZ! Compareça ao balcão agora.',
        timestamp: new Date().toISOString()
      }
    );

    logger.info({ ticketId: ticket.id, numeroTicket: ticket.numeroTicket }, 'Ticket chamado - notificações enviadas');
  }

  
  static emitirPosicaoAtualizada(
    restauranteId: string,
    filaId: string,
    ticketId: string,
    posicao: number,
    tempoEstimado: number
  ): void {
    this.emitirParaFila(restauranteId, filaId, 'ticket:posicao', {
      ticketId,
      posicao,
      tempoEstimado,
      timestamp: new Date().toISOString()
    });
  }

 
  static emitirTicketFinalizado(
    restauranteId: string,
    filaId: string,
    ticketId: string
  ): void {
    this.emitirParaFila(restauranteId, filaId, 'ticket:finalizado', {
      ticketId,
      timestamp: new Date().toISOString()
    });
  }

  static emitirTicketCancelado(
    restauranteId: string,
    filaId: string,
    ticketId: string
  ): void {
    // Emitir para operadores
    this.emitirParaFila(restauranteId, filaId, 'ticket:cancelado', {
      ticketId,
      timestamp: new Date().toISOString()
    });

    // Emitir para o cliente na sala do ticket
    this.emitirParaTicket(restauranteId, ticketId, 'ticket:cancelado', {
      ticketId,
      mensagem: 'Seu ticket foi cancelado',
      timestamp: new Date().toISOString()
    });
  }

 
  static emitirTicketNoShow(
    restauranteId: string,
    filaId: string,
    ticketId: string
  ): void {
    this.emitirParaFila(restauranteId, filaId, 'ticket:no-show', {
      ticketId,
      timestamp: new Date().toISOString()
    });
  }
}

export default SocketService;
