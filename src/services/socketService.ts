import { io } from '../server';
import { logger } from '../config/logger';

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

 
  static emitirFilaAtualizada(
    restauranteId: string,
    filaId: string,
    tickets: any[]
  ): void {
    this.emitirParaFila(restauranteId, filaId, 'fila:atualizada', {
      filaId,
      tickets,
      timestamp: new Date().toISOString()
    });
  }

  
  static emitirTicketChamado(
    restauranteId: string,
    filaId: string,
    ticket: any
  ): void {
    this.emitirParaFila(restauranteId, filaId, 'ticket:chamado', {
      ticketId: ticket.id,
      numeroTicket: ticket.numeroTicket,
      nomeCliente: ticket.nomeCliente,
      timestamp: new Date().toISOString()
    });
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
    this.emitirParaFila(restauranteId, filaId, 'ticket:cancelado', {
      ticketId,
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
