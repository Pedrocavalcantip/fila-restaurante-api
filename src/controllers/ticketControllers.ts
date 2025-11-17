import { Request, Response, NextFunction } from 'express';
import { TicketService } from '../services/ticketservice';
import { SocketService } from '../services/socketService';
import { StatusTicket } from '@prisma/client';
import { ErroDadosInvalidos, ErroNaoAutenticado } from '../utils/ErrosCustomizados';
import { logger } from '../config/logger';
import { criarTicketLocalSchema, entrarNaFilaRemotoSchema } from '../utils/schemasZod';

// HELPERS DE VALIDAÇÃO
const validarPaginacao = (query: Request['query']) => {
  const page = parseInt(query.page as string) || 1;
  const limit = parseInt(query.limit as string) || 10;

  if (page < 1) {
    throw new ErroDadosInvalidos('A página deve ser maior que 0');
  }
  if (limit < 1 || limit > 100) {
    throw new ErroDadosInvalidos('O limite deve estar entre 1 e 100');
  }

  return { page, limit };
};

// CONTROLLER
export class TicketController {

  // POST /api/restaurantes/:restauranteId/filas/:filaId/tickets
  // Criar novo ticket na fila
  static async criarTicketLocal(req: Request, res: Response, next: NextFunction) {
    try {
      // 1. Validar autenticação
      const ator = req.usuario; 
      if (!ator) throw new ErroNaoAutenticado();

      const { filaId } = req.params;
      
      // 2. Validar body com Zod
      const { nomeCliente, telefoneCliente, emailCliente } = criarTicketLocalSchema.parse(req.body);

      // 3. Delegar para o Service
      const ticket = await TicketService.criarTicketLocal(
        {
          nomeCliente,
          telefoneCliente: telefoneCliente || undefined,
          emailCliente: emailCliente || undefined,
          filaId
        },
        ator
      );

      // 4. Calcular posição e ETA APÓS a criação (dinâmico)
      const { posicao, tempoEstimado } = await TicketService.calcularPosicao(ticket.id);

      logger.info({ ticketId: ticket.id, filaId }, 'Ticket criado via controller');

      // Emitir evento Socket.io - fila atualizada
      SocketService.emitirFilaAtualizada(
        ator.restauranteId,
        filaId,
        [{ ...ticket, posicao, tempoEstimado }]
      );

      // 5. Responder
      res.status(201).json({
        mensagem: 'Ticket criado com sucesso',
        ticket: {
          ...ticket,
          posicao,
          tempoEstimado
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/clientes/restaurantes/:slug/fila/entrar
  // Cliente entra na fila remotamente (APP)
  static async entrarNaFilaRemoto(req: Request, res: Response, next: NextFunction) {
    try {
      // 1. Validar autenticação do cliente
      const cliente = req.cliente;
      if (!cliente) throw new ErroNaoAutenticado();

      const { slug } = req.params;

      // 2. Validar body com Zod
      const { body } = entrarNaFilaRemotoSchema.parse({ body: req.body });
      const { prioridade, quantidadePessoas } = body;

      // 3. Delegar para o Service
      const ticketComPosicao = await TicketService.criarTicketRemoto({
        clienteId: cliente.id,
        restauranteSlug: slug,
        prioridade,
        quantidadePessoas
      });

      logger.info({ 
        ticketId: ticketComPosicao.id, 
        clienteId: cliente.id,
        prioridade 
      }, 'Cliente entrou na fila remotamente');

      // 4. Emitir evento Socket.io - fila atualizada
      SocketService.emitirFilaAtualizada(
        ticketComPosicao.restauranteId,
        ticketComPosicao.filaId,
        [ticketComPosicao]
      );

      // 5. Responder
      res.status(201).json({
        mensagem: 'Você entrou na fila com sucesso!',
        ticket: {
          id: ticketComPosicao.id,
          numeroTicket: ticketComPosicao.numeroTicket,
          prioridade: ticketComPosicao.prioridade,
          valorPrioridade: ticketComPosicao.valorPrioridade,
          posicao: ticketComPosicao.posicao,
          tempoEstimado: ticketComPosicao.tempoEstimado,
          status: ticketComPosicao.status,
          criadoEm: ticketComPosicao.criadoEm
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/clientes/meu-ticket
  // Buscar ticket ativo do cliente autenticado
  static async buscarMeuTicket(req: Request, res: Response, next: NextFunction) {
    try {
      const cliente = req.cliente;
      if (!cliente) throw new ErroNaoAutenticado();

      const ticket = await TicketService.buscarMeuTicket(cliente.id);

      if (!ticket) {
        return res.status(200).json({
          mensagem: 'Você não possui tickets ativos no momento',
          ticket: null
        });
      }

      res.status(200).json({
        ticket: {
          id: ticket.id,
          numeroTicket: ticket.numeroTicket,
          prioridade: ticket.prioridade,
          valorPrioridade: ticket.valorPrioridade,
          status: ticket.status,
          posicao: ticket.posicao,
          tempoEstimado: ticket.tempoEstimado,
          restaurante: {
            id: ticket.restauranteId,
            nome: (ticket as any).restaurante?.nome
          },
          fila: {
            id: ticket.filaId,
            nome: (ticket as any).fila?.nome
          },
          criadoEm: ticket.criadoEm,
          chamadoEm: ticket.chamadoEm
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/clientes/ticket/:ticketId/cancelar
  // Cliente cancela seu próprio ticket
  static async cancelarMeuTicket(req: Request, res: Response, next: NextFunction) {
    try {
      const cliente = req.cliente;
      if (!cliente) throw new ErroNaoAutenticado();

      const { ticketId } = req.params;

      const ticket = await TicketService.cancelarMeuTicket(ticketId, cliente.id);

      logger.info({ ticketId, clienteId: cliente.id }, 'Cliente cancelou seu ticket');

      // Emitir evento Socket.io
      SocketService.emitirTicketCancelado(
        ticket.restauranteId,
        ticket.filaId,
        ticketId
      );

      res.status(200).json({
        mensagem: 'Ticket cancelado com sucesso',
        ticket: {
          id: ticket.id,
          numeroTicket: ticket.numeroTicket,
          status: ticket.status,
          canceladoEm: ticket.canceladoEm
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/restaurantes/:restauranteId/filas/:filaId/tickets/ativa
  // Listar fila ativa (sem busca, com posição)
  static async listarFilaAtiva(req: Request, res: Response, next: NextFunction) {
    try {
      const ator = req.usuario;
      if (!ator) throw new ErroNaoAutenticado();
      
      const { filaId } = req.params;
      const { page, limit } = validarPaginacao(req.query);

      const resultado = await TicketService.listarFilaAtiva(
        filaId,
        ator.restauranteId,
        { page, limit }
      );

      res.status(200).json({
        tickets: resultado.tickets,
        paginacao: {
          totalItens: resultado.total,
          paginaAtual: resultado.pagina,
          limite: resultado.limite,
          totalPaginas: resultado.totalPaginas
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/restaurantes/:restauranteId/filas/:filaId/tickets/historico
  // Listar histórico (com busca, sem posição)
  static async listarHistorico(req: Request, res: Response, next: NextFunction) {
    try {
      const ator = req.usuario;
      if (!ator) throw new ErroNaoAutenticado();

      const { filaId } = req.params;
      const { page, limit } = validarPaginacao(req.query);

      let status: StatusTicket[] | undefined;
      if (req.query.status) {
        const statusStr = req.query.status as string;
        status = statusStr.split(',').map(s => s.trim() as StatusTicket);
      }

      const busca = req.query.busca as string | undefined;

      const resultado = await TicketService.listarHistorico(
        filaId,
        ator.restauranteId,
        { status, busca, page, limit }
      );

      res.status(200).json({
        tickets: resultado.tickets,
        paginacao: {
          totalItens: resultado.total,
          paginaAtual: resultado.pagina,
          limite: resultado.limite,
          totalPaginas: resultado.totalPaginas
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================================================
  // GET /api/tickets/publico/:ticketId
  // Buscar ticket por ID (público - para clientes)
  // ==========================================================================
  static async buscarPorId(req: Request, res: Response, next: NextFunction) {
    try {
      const { ticketId } = req.params;

      const ticket = await TicketService.buscarPorIdComPosicao(ticketId);

      res.status(200).json(ticket);
    } catch (error) {
      next(error);
    }
  }

  // ==========================================================================
  // GET /api/restaurantes/:restauranteId/tickets/:ticketId
  // Buscar ticket por ID (privado - validado por restaurante)
  // ==========================================================================
  static async buscarPorIdRestaurante(req: Request, res: Response, next: NextFunction) {
    try {
      const ator = req.usuario;
      if (!ator) throw new ErroNaoAutenticado();
      
      const { ticketId } = req.params;

      const ticket = await TicketService.buscarPorIdComPosicao(
        ticketId,
        ator.restauranteId
      );

      res.status(200).json(ticket);
    } catch (error) {
      next(error);
    }
  }

  // ==========================================================================
  // POST /api/restaurantes/:restauranteId/tickets/:ticketId/chamar
  // Chamar ticket
  // ==========================================================================
  static async chamar(req: Request, res: Response, next: NextFunction) {
    try {
      const ator = req.usuario;
      if (!ator) throw new ErroNaoAutenticado();
      
      const { ticketId } = req.params;

      const ticket = await TicketService.chamar(ticketId, ator);
      
      logger.info({ ticketId, atorId: ator.id }, 'Ticket chamado via controller');

      // Emitir evento Socket.io
      SocketService.emitirTicketChamado(
        ator.restauranteId,
        ticket.filaId,
        ticket
      );

      res.status(200).json({
        mensagem: 'Ticket chamado com sucesso',
        ticket
      });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================================================
  // POST /api/restaurantes/:restauranteId/tickets/:ticketId/pular
  // Pular ticket (voltar para fila)
  // ==========================================================================
  static async pular(req: Request, res: Response, next: NextFunction) {
    try {
      const ator = req.usuario;
      if (!ator) throw new ErroNaoAutenticado();
      
      const { ticketId } = req.params;

      const ticket = await TicketService.pular(ticketId, ator);
      
      logger.info({ ticketId, atorId: ator.id }, 'Ticket pulado via controller');

      // Emitir evento Socket.io - fila atualizada
      SocketService.emitirFilaAtualizada(
        ator.restauranteId,
        ticket.filaId,
        []
      );
  
      res.status(200).json({
        mensagem: 'Ticket retornou para a fila',
        ticket
      });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================================================
  // POST /api/restaurantes/:restauranteId/tickets/:ticketId/no-show
  // Marcar no-show
  // ==========================================================================
  static async marcarNoShow(req: Request, res: Response, next: NextFunction) {
    try {
      const ator = req.usuario;
      if (!ator) throw new ErroNaoAutenticado();
      
      const { ticketId } = req.params;

      const ticket = await TicketService.marcarNoShow(ticketId, ator);
      
      logger.info({ ticketId, atorId: ator.id }, 'No-show marcado via controller');

      // Emitir evento Socket.io
      SocketService.emitirTicketNoShow(
        ator.restauranteId,
        ticket.filaId,
        ticketId
      );

      res.status(200).json({
        mensagem: 'Ticket marcado como no-show',
        ticket
      });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================================================
  // POST /api/restaurantes/:restauranteId/tickets/:ticketId/rechamar
  // Rechamar ticket
  // ==========================================================================
  static async rechamar(req: Request, res: Response, next: NextFunction) {
    try {
      const ator = req.usuario;
      if (!ator) throw new ErroNaoAutenticado();
      
      const { ticketId } = req.params;

      const ticket = await TicketService.rechamar(ticketId, ator);
      
      logger.info({ ticketId, atorId: ator.id }, 'Ticket rechamado via controller');
      
      // Emitir evento Socket.io
      SocketService.emitirTicketChamado(
        ator.restauranteId,
        ticket.filaId,
        ticket
      );

      res.status(200).json({
        mensagem: 'Ticket rechamado com sucesso',
        ticket
      });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================================================
  // POST /api/restaurantes/:restauranteId/tickets/:ticketId/finalizar
  // Finalizar atendimento
  // ==========================================================================
  static async finalizar(req: Request, res: Response, next: NextFunction) {
    try {
      const ator = req.usuario;
      if (!ator) throw new ErroNaoAutenticado();
      
      const { ticketId } = req.params;
      const { observacoes = "" } = req.body || {};

      if (observacoes && observacoes.length > 500) {
        throw new ErroDadosInvalidos('Observações muito longas (máximo 500 caracteres)');
      }

      const ticket = await TicketService.finalizar(
        ticketId,
        ator,
        observacoes?.trim()
      );

      logger.info({ ticketId, atorId: ator.id }, 'Ticket finalizado via controller');

      // Emitir evento Socket.io
      SocketService.emitirTicketFinalizado(
        ator.restauranteId,
        ticket.filaId,
        ticketId
      );

      res.status(200).json({
        mensagem: 'Atendimento finalizado com sucesso',
        ticket
      });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================================================
  // POST /api/restaurantes/:restauranteId/tickets/:ticketId/cancelar
  // Cancelar ticket
  // ==========================================================================
  static async cancelarPorOperador(req: Request, res: Response, next: NextFunction) {
    try {
      const ator = req.usuario;
      if (!ator) throw new ErroNaoAutenticado();
      
      const { ticketId } = req.params;
      const { motivo } = req.body;

      if (motivo && motivo.length > 500) {
        throw new ErroDadosInvalidos('Motivo muito longo (máximo 500 caracteres)');
      }

      const ticket = await TicketService.cancelarPorOperador(
        ticketId,
        ator,
        motivo?.trim()
      );
      
      logger.info({ ticketId, atorId: ator.id }, 'Ticket cancelado via controller');
      
      // Emitir evento Socket.io
      SocketService.emitirTicketCancelado(
        ator.restauranteId,
        ticket.filaId,
        ticketId
      );

      res.status(200).json({
        mensagem: 'Ticket cancelado com sucesso',
        ticket
      });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================================================
  // GET /api/tickets/publico/:ticketId/posicao
  // Consultar posição atual do ticket (para clientes via polling)
  // ==========================================================================
  static async consultarPosicao(req: Request, res: Response, next: NextFunction) {
    try {
      const { ticketId } = req.params;

      const { posicao, tempoEstimado } = await TicketService.calcularPosicao(ticketId);

      res.status(200).json({
        ticketId,
        posicao,
        tempoEstimado,
        tempoEstimadoFormatado: `~${tempoEstimado} minutos`
      });
    } catch (error) {
      next(error);
    }
  }
}

export default TicketController;