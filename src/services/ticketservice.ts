// src/services/ticketService.ts
// VERSÃO FINAL V3 - Segura, Performática e com Lógica Unificada

import prisma from '../config/database';
import { 
  PapelUsuario, 
  StatusTicket, 
  PrioridadeTicket, 
  TipoAtor, 
  TipoEventoTicket, 
  Ticket, 
  StatusFila,
  Prisma
} from '@prisma/client';
import { ErroNaoEncontrado, ErroDadosInvalidos } from '../utils/ErrosCustomizados';
import { logger } from '../config/logger';
import { stat } from 'fs';

// ============================================================================
// MAPA DE PRIORIDADES - ÚNICA FONTE DA VERDADE
// ============================================================================
const ordemPrioridade: Record<PrioridadeTicket, number> = {
  [PrioridadeTicket.CHECK_IN_CONFIRMADO]: 1,
  [PrioridadeTicket.VIP]: 2,
  [PrioridadeTicket.FAST_LANE]: 3,
  [PrioridadeTicket.NORMAL]: 4,
};

// ============================================================================
// TYPES
// ============================================================================
type CriarTicketDTO = {
  nomeCliente: string;
  telefoneCliente?: string;
  filaId: string;
}

type AtorDTO = {
  id: string;
  restauranteId: string;
  papel: PapelUsuario;
};

// Tipo atualizado: posicao e tempoEstimado são calculados, não armazenados
type TicketComPosicao = Ticket & {
  posicao: number;
  tempoEstimado: number;
};

// Tipo para resultado paginado
type ResultadoPaginado<T> = {
  tickets: T[];
  total: number;
  pagina: number;
  limite: number;
  totalPaginas: number;
};

// ============================================================================
// SERVICE
// ============================================================================
export class TicketService {
  
  // ==========================================================================
  // HELPER: Validar acesso ao ticket pelo restaurante (Segurança Multi-Tenant)
  // ==========================================================================
  private static async validarTicketRestaurante(ticketId: string, restauranteId: string, ator?: AtorDTO) {
    const ticket = await prisma.ticket.findFirst({
      where: { id: ticketId, restauranteId }
    });
    if (!ticket) {
      throw new ErroNaoEncontrado('Ticket não encontrado neste restaurante.');
    }

    if (ator && ator.papel === PapelUsuario.ADMIN && ator.restauranteId !== restauranteId) {
      throw new ErroNaoEncontrado('Acesso negado.');
    }

    return ticket;
  }

  // ==========================================================================
  // HELPER: Ordenar tickets (Fonte única da verdade)
  // ==========================================================================
  private static ordenarTicketsPorPrioridade<T extends { prioridade: PrioridadeTicket; entradaEm: Date }>(
    tickets: T[]
  ): T[] {
    return tickets.sort((a, b) => {
      const prioridadeA = ordemPrioridade[a.prioridade] || 99;
      const prioridadeB = ordemPrioridade[b.prioridade] || 99;
      
      if (prioridadeA !== prioridadeB) {
        return prioridadeA - prioridadeB; // Menor número = maior prioridade
      }
      
      // Mesma prioridade, ordena por tempo de entrada (mais antigo primeiro)
      return a.entradaEm.getTime() - b.entradaEm.getTime();
    });
  }

  // ==========================================================================
  // FUNÇÃO 1: Criar Ticket (Limpa e Rápida)
  // ==========================================================================
  static async criarTicketLocal(dados: CriarTicketDTO, ator: AtorDTO): Promise<Ticket & { fila: any }> {
    const { filaId, nomeCliente, telefoneCliente } = dados;

    // Validar fila
    const fila = await prisma.fila.findFirst({
      where: {
        id: filaId,
        restauranteId: ator.restauranteId,
      }
    });

    if (!fila) {
      throw new ErroNaoEncontrado('Fila não encontrada neste restaurante.');
    }
    if (fila.status !== StatusFila.ATIVA) {
      throw new ErroDadosInvalidos('Esta fila não está aceitando novos tickets no momento.');
    }

    // Validar regras de negócio (limites, etc.)
    const restaurante = await prisma.restaurante.findUnique({
      where: { id: ator.restauranteId },
      select: { maxReentradasPorDia: true }
    });

    if (telefoneCliente) {
      const inicioHoje = new Date();
      inicioHoje.setHours(0, 0, 0, 0);
      const ticketsHoje = await prisma.ticket.count({
        where: {
          restauranteId: ator.restauranteId,
          telefoneCliente,
          criadoEm: { gte: inicioHoje }
        }
      });
      if (restaurante && ticketsHoje >= restaurante.maxReentradasPorDia) {
        throw new ErroDadosInvalidos('Limite de reentradas diárias atingido para este cliente.');
      }
    }

    const ticketsAtivos = await prisma.ticket.count({
      where: { 
        filaId, 
        status: { in: [StatusTicket.AGUARDANDO, StatusTicket.CHAMADO] } 
      }
    });
    if (ticketsAtivos >= fila.maxSimultaneos) {
      throw new ErroDadosInvalidos(`Fila cheia. Capacidade máxima: ${fila.maxSimultaneos} pessoas.`);
    }

    // Transação SIMPLIFICADA (sem cálculo de ETA/Posição)
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const resultado = await prisma.$transaction(async (tx) => {
        const ultimoTicket = await tx.ticket.findFirst({
            where: { filaId, criadoEm: { gte: hoje } },
            orderBy: { numeroTicket: 'desc' },
            select: { numeroTicket: true }
        });

        let proximoNumero = 1;
        if (ultimoTicket) {
            // Extrair o número do formato "A-XXX"
            const match = ultimoTicket.numeroTicket.match(/A-(\d+)/);
            if (match) {
                proximoNumero = parseInt(match[1]) + 1;
            }
        }

        const numeroTicket = `A-${proximoNumero.toString().padStart(3, '0')}`;

      const novoTicket = await tx.ticket.create({
        data: {
          nomeCliente,
          telefoneCliente: telefoneCliente || null,
          filaId,
          restauranteId: ator.restauranteId,
          status: StatusTicket.AGUARDANDO,
          prioridade: PrioridadeTicket.NORMAL,
          numeroTicket,
          aceitaWhatsapp: !!telefoneCliente,
        },
        include: {
          fila: {
            select: { id: true, nome: true, slug: true, status: true }
          }
        }
      });

      await tx.eventoTicket.create({
        data: {
          ticketId: novoTicket.id,
          restauranteId: ator.restauranteId,
          tipo: TipoEventoTicket.CRIADO,
          tipoAtor: ator.papel === PapelUsuario.ADMIN ? TipoAtor.ADMIN : TipoAtor.OPERADOR,
          atorId: ator.id,
          metadados: { numeroTicket, prioridadeInicial: PrioridadeTicket.NORMAL }
        }
      });

      return novoTicket;
    });

    logger.info({ ticketId: resultado.id, restauranteId: ator.restauranteId }, 'Ticket local criado');
    return resultado;
  }

  // ==========================================================================
  // FUNÇÃO 2: Calcular Posição e ETA (Lógica Unificada)
  // ==========================================================================
  static async calcularPosicao(ticketId: string): Promise<{ posicao: number; tempoEstimado: number }> {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { 
        id: true,
        filaId: true, 
        prioridade: true, 
        entradaEm: true, 
        status: true 
      }
    });

    if (!ticket) {
      throw new ErroNaoEncontrado('Ticket não encontrado');
    }

    if (ticket.status !== StatusTicket.AGUARDANDO) {
      return { posicao: 0, tempoEstimado: 0 };
    }

    const todosTicketsAguardando = await prisma.ticket.findMany({
      where: {
        filaId: ticket.filaId,
        status: StatusTicket.AGUARDANDO
      },
      select: {
        id: true,
        prioridade: true,
        entradaEm: true
      },
      orderBy: { entradaEm: 'asc' }
    });

    const ticketsOrdenados = this.ordenarTicketsPorPrioridade(todosTicketsAguardando);
    const posicao = ticketsOrdenados.findIndex(t => t.id === ticketId) + 1;
    
    if (posicao === 0) {
      logger.error({ ticketId }, "Ticket AGUARDANDO não encontrado na fila ordenada.");
      return { posicao: 0, tempoEstimado: 0 };
    }

    const tempoEstimado = await this.calcularTempoEstimado(ticket.filaId, posicao);
    return { posicao, tempoEstimado };
  }

  // ==========================================================================
  // HELPERS DE CÁLCULO DE TEMPO (Sem N+1)
  // ==========================================================================
  static async calcularTempoMedio(filaId: string): Promise<number> {
    const atendimentosRecentes = await prisma.ticket.findMany({
      where: {
        filaId,
        status: StatusTicket.FINALIZADO,
        duracaoAtendimento: { not: null }
      },
      select: { duracaoAtendimento: true },
      orderBy: { finalizadoEm: 'desc' },
      take: 10
    });

    let tempoMedioPorAtendimento = 15; // Default

    if (atendimentosRecentes.length > 0) {
      const soma = atendimentosRecentes.reduce((acc, t) => acc + (t.duracaoAtendimento || 0), 0);
      const media = Math.ceil(soma / atendimentosRecentes.length);
      tempoMedioPorAtendimento = media > 0 ? media : 15;
    }
    
    return tempoMedioPorAtendimento;
  }

  static async calcularTempoEstimado(filaId: string, posicao: number): Promise<number> {
    const tempoMedio = await this.calcularTempoMedio(filaId);
    return posicao * tempoMedio;
  }

  // ==========================================================================
  // FUNÇÃO 3: Listar Fila (Paginação Correta)
  // ==========================================================================
  
  // Caso de Uso A: Listar a FILA ATIVA (AGUARDANDO/CHAMADO)
  // Esta função é otimizada para ordenação correta, não para filtros.
  static async listarFilaAtiva(
    filaId: string,
    restauranteId: string,
    filtros: {
      page: number;
      limit: number;
    }
  ): Promise<ResultadoPaginado<TicketComPosicao>> {
    
    const fila = await prisma.fila.findFirst({
      where: { id: filaId, restauranteId }
    });
    if (!fila) throw new ErroNaoEncontrado('Fila não encontrada');

    const page = Math.max(1, filtros.page);
    const limit = Math.min(100, Math.max(1, filtros.limit));
    const skip = (page - 1) * limit;

    const where: Prisma.TicketWhereInput = {
      filaId,
      restauranteId,
      status: { in: [StatusTicket.AGUARDANDO, StatusTicket.CHAMADO] }
    };

    // 1. Buscar TODOS os tickets ativos
    const todosTickets = await prisma.ticket.findMany({
      where,
      include: {
        fila: {
          select: { id: true, nome: true, status: true }
        }
      },
      orderBy: { entradaEm: 'asc' }
    });

    // 2. Ordenar TODOS em memória (Fonte Única da Verdade)
    const ticketsOrdenados = this.ordenarTicketsPorPrioridade(todosTickets);

    // 3. Aplicar paginação em memória
    const ticketsPaginados = ticketsOrdenados.slice(skip, skip + limit);

    // 4. Calcular posição e tempo estimado
    const tempoMedio = await this.calcularTempoMedio(filaId);
    const ticketsComPosicao: TicketComPosicao[] = [];

    ticketsPaginados.forEach((ticket) => {
      let posicao = 0;
      let tempoEstimado = 0;

      if(ticket.status === StatusTicket.AGUARDANDO) {
        // Encontrar a posição REAL (não a da página)
        const posicaoReal = ticketsOrdenados.findIndex(t => t.id === ticket.id) + 1;
        posicao = posicaoReal;
        tempoEstimado = posicaoReal * tempoMedio;
      }
      
      ticketsComPosicao.push({
        ...ticket,
        posicao,
        tempoEstimado
      });
    });

    return {
      tickets: ticketsComPosicao,
      total: ticketsOrdenados.length,
      pagina: page,
      limite: limit,
      totalPaginas: Math.ceil(ticketsOrdenados.length / limit)
    };
  }


  static async listarHistorico(
    filaId: string, 
    restauranteId: string,
    filtros: {
      status?: StatusTicket[];
      busca?: string;
      page: number;
      limit: number;
    }
  ): Promise<ResultadoPaginado<TicketComPosicao>> {

    const fila = await prisma.fila.findFirst({
      where: { id: filaId, restauranteId }
    });
    if (!fila) throw new ErroNaoEncontrado('Fila não encontrada');

    const page = Math.max(1, filtros.page);
    const limit = Math.min(100, Math.max(1, filtros.limit));
    const skip = (page - 1) * limit;

    const where: Prisma.TicketWhereInput = { 
      filaId, 
      restauranteId,
      // Garante que não pegue tickets ativos
      status: { in: [StatusTicket.FINALIZADO, StatusTicket.CANCELADO, StatusTicket.NO_SHOW] }
    };
    
    if (filtros?.status && filtros.status.length > 0) {
        const statusHistoricos: StatusTicket[] = [
            StatusTicket.FINALIZADO, 
            StatusTicket.CANCELADO, 
            StatusTicket.NO_SHOW
        ];
        
        const statusValidos = filtros.status.filter(s =>
            statusHistoricos.includes(s)
        );
        
        if (statusValidos.length > 0) {
            where.status = { in: statusValidos };
        }
    }

    if (filtros?.busca) {
      where.OR = [
        { nomeCliente: { contains: filtros.busca, mode: 'insensitive' } },
        { telefoneCliente: { contains: filtros.busca } },
        { numeroTicket: { contains: filtros.busca, mode: 'insensitive' } }
      ];
    }

    const total = await prisma.ticket.count({ where });

    const tickets = await prisma.ticket.findMany({
      where,
      include: {
        fila: {
          select: { id: true, nome: true, status: true }
        }
      },
      orderBy: { entradaEm: 'desc' }, // Histórico é melhor ver o mais recente
      skip,
      take: limit
    });
    
    // Histórico não tem posição nem ETA
    const ticketsComPosicao: TicketComPosicao[] = tickets.map(ticket => ({
      ...ticket,
      posicao: 0,
      tempoEstimado: 0
    }));

    return {
      tickets: ticketsComPosicao,
      total,
      pagina: page,
      limite: limit,
      totalPaginas: Math.ceil(total / limit)
    };
  }

  static async buscarPorIdComPosicao(
    ticketId: string, 
    restauranteId?: string // Opcional: se fornecido, valida o tenant
  ): Promise<TicketComPosicao> {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        fila: true,
        eventos: { 
          orderBy: { criadoEm: 'desc' }, 
          take: 10 
        }
      }
    });

    if (!ticket) {
      throw new ErroNaoEncontrado('Ticket não encontrado');
    }
    
    if (restauranteId && ticket.restauranteId !== restauranteId) {
      throw new ErroNaoEncontrado('Ticket não encontrado neste restaurante');
    }

    // Calcular posição e tempo estimado dinamicamente
    const { posicao, tempoEstimado } = await this.calcularPosicao(ticketId);

    return { ...ticket, posicao, tempoEstimado };
  }


  static async chamar(ticketId: string, ator: AtorDTO): Promise<Ticket> {
    const ticket = await this.validarTicketRestaurante(ticketId, ator.restauranteId);

    if (ticket.status !== StatusTicket.AGUARDANDO) {
      throw new ErroDadosInvalidos('Apenas tickets aguardando podem ser chamados');
    }

    const ticketAtualizado = await prisma.$transaction(async (tx) => {
      const atualizado = await tx.ticket.update({
        where: { id: ticketId },
        data: {
          status: StatusTicket.CHAMADO,
          chamadoEm: new Date(),
          // REMOVIDO: contagemRechamada (bug de lógica)
        },
        include: { fila: true }
      });

      await tx.eventoTicket.create({
        data: {
          ticketId,
          restauranteId: ator.restauranteId,
          tipo: TipoEventoTicket.CHAMADO,
          tipoAtor: ator.papel === PapelUsuario.ADMIN ? TipoAtor.ADMIN : TipoAtor.OPERADOR,
          atorId: ator.id
        }
      });
      return atualizado;
    });

    logger.info({ ticketId }, 'Ticket chamado');
    return ticketAtualizado;
  }

  static async pular(ticketId: string, ator: AtorDTO): Promise<Ticket> {
    const ticket = await this.validarTicketRestaurante(ticketId, ator.restauranteId);

    if (ticket.status !== StatusTicket.CHAMADO) {
      throw new ErroDadosInvalidos('Apenas tickets chamados podem ser pulados');
    }

    const ticketAtualizado = await prisma.$transaction(async (tx) => {
      const atualizado = await tx.ticket.update({
        where: { id: ticketId },
        data: {
          status: StatusTicket.AGUARDANDO, // Devolve para a fila
          chamadoEm: null,
        },
        include: { fila: true }
      });

      await tx.eventoTicket.create({
        data: {
          ticketId,
          restauranteId: ator.restauranteId,
          tipo: TipoEventoTicket.PULADO,
          tipoAtor: ator.papel === PapelUsuario.ADMIN ? TipoAtor.ADMIN : TipoAtor.OPERADOR,
          atorId: ator.id
        }
      });
      return atualizado;
    });

    logger.info({ ticketId }, 'Ticket pulado');
    return ticketAtualizado;
  }

  static async marcarNoShow(ticketId: string, ator: AtorDTO): Promise<Ticket> {
    const ticket = await this.validarTicketRestaurante(ticketId, ator.restauranteId);

    if (ticket.status !== StatusTicket.CHAMADO) {
      throw new ErroDadosInvalidos('Apenas tickets chamados podem ser marcados como no-show');
    }

    const restaurante = await prisma.restaurante.findUnique({
      where: { id: ator.restauranteId },
      select: { avisosNoShow: true }
    });

    const ticketAtualizado = await prisma.$transaction(async (tx) => {
      const atualizado = await tx.ticket.update({
        where: { id: ticketId },
        data: {
          status: StatusTicket.NO_SHOW,
          contagemNoShow: { increment: 1 }
        },
        include: { fila: true }
      });
      await tx.eventoTicket.create({
        data: {
          ticketId,
          restauranteId: ator.restauranteId,
          tipo: TipoEventoTicket.NO_SHOW,
          tipoAtor: ator.papel === PapelUsuario.ADMIN ? TipoAtor.ADMIN : TipoAtor.OPERADOR,
          atorId: ator.id
        }
      });
      return atualizado;
    });

    if (restaurante && ticketAtualizado.contagemNoShow >= restaurante.avisosNoShow) {
      logger.warn({ 
        ticketId, 
        totalNoShows: ticketAtualizado.contagemNoShow 
      }, 'Cliente atingiu limite de no-shows');
    }

    logger.info({ ticketId }, 'Ticket marcado como no-show');
    return ticketAtualizado;
  }

  static async rechamar(ticketId: string, ator: AtorDTO): Promise<Ticket> {
    const ticket = await this.validarTicketRestaurante(ticketId, ator.restauranteId);

    if (ticket.status !== StatusTicket.CHAMADO) {
      throw new ErroDadosInvalidos('Apenas tickets chamados podem ser rechamados');
    }

    const ticketAtualizado = await prisma.$transaction(async (tx) => {
      const atualizado = await tx.ticket.update({
        where: { id: ticketId },
        data: { 
          contagemRechamada: { increment: 1 } 
        },
        include: { fila: true }
      });
      await tx.eventoTicket.create({
        data: {
          ticketId,
          restauranteId: ator.restauranteId,
          tipo: TipoEventoTicket.RECHAMADO,
          tipoAtor: ator.papel === PapelUsuario.ADMIN ? TipoAtor.ADMIN : TipoAtor.OPERADOR,
          atorId: ator.id
        }
      });
      return atualizado;
    });

    logger.info({ ticketId }, 'Ticket rechamado');
    return ticketAtualizado;
  }

  static async finalizar(ticketId: string, ator: AtorDTO, observacoes?: string): Promise<Ticket> {
    const ticket = await this.validarTicketRestaurante(ticketId, ator.restauranteId);

    if (ticket.status !== StatusTicket.CHAMADO && ticket.status !== StatusTicket.ATENDENDO) {
      throw new ErroDadosInvalidos('Apenas tickets chamados/atendendo podem ser finalizados');
    }

    let duracaoAtendimento: number | null = null;
    if (ticket.chamadoEm) {
      const duracao = Math.ceil((Date.now() - ticket.chamadoEm.getTime()) / 60000);
      duracaoAtendimento = Math.max(0, duracao);
    }

    const ticketAtualizado = await prisma.$transaction(async (tx) => {
      const atualizado = await tx.ticket.update({
        where: { id: ticketId },
        data: {
          status: StatusTicket.FINALIZADO,
          finalizadoEm: new Date(),
          duracaoAtendimento,
          observacoes: observacoes || ticket.observacoes
        },
        include: { fila: true }
      });
      await tx.eventoTicket.create({
        data: {
          ticketId,
          restauranteId: ator.restauranteId,
          tipo: TipoEventoTicket.FINALIZADO,
          tipoAtor: ator.papel === PapelUsuario.ADMIN ? TipoAtor.ADMIN : TipoAtor.OPERADOR,
          atorId: ator.id,
          metadados: { duracaoAtendimento }
        }
      });
      return atualizado;
    });

    logger.info({ ticketId }, 'Atendimento finalizado');
    return ticketAtualizado;
  }


  static async cancelarPorOperador(
    ticketId: string, 
    ator: AtorDTO, 
    motivo?: string
  ): Promise<Ticket> {
    const ticket = await this.validarTicketRestaurante(ticketId, ator.restauranteId);

    if (ticket.status === StatusTicket.FINALIZADO) {
      throw new ErroDadosInvalidos('Ticket já foi finalizado');
    }

    const ticketAtualizado = await prisma.$transaction(async (tx) => {
      const atualizado = await tx.ticket.update({
        where: { id: ticketId },
        data: {
          status: StatusTicket.CANCELADO,
          canceladoEm: new Date(),
          observacoes: motivo
        },
        include: { fila: true }
      });
      await tx.eventoTicket.create({
        data: {
          ticketId,
          restauranteId: ator.restauranteId,
          tipo: TipoEventoTicket.CANCELADO,
          tipoAtor: TipoAtor.OPERADOR,
          atorId: ator.id,
          metadados: { motivo, canceladoPor: 'OPERADOR' }
        }
      });
      return atualizado;
    });

    logger.info({ ticketId, atorId: ator.id }, 'Ticket cancelado por operador');
    return ticketAtualizado;
  }
  

  static async marcarCheckIn(ticketId: string, ator: AtorDTO): Promise<Ticket> {
    const ticket = await this.validarTicketRestaurante(ticketId, ator.restauranteId);

    if (ticket.status !== StatusTicket.AGUARDANDO) {
      throw new ErroDadosInvalidos('Apenas tickets aguardando podem fazer check-in.');
    }

    const ticketAtualizado = await prisma.$transaction(async (tx) => {
      const atualizado = await tx.ticket.update({
        where: { id: ticketId },
        data: {
          prioridade: PrioridadeTicket.CHECK_IN_CONFIRMADO,
          checkInEm: new Date()
        },
        include: { fila: true }
      });
      await tx.eventoTicket.create({
        data: {
          ticketId: atualizado.id,
          restauranteId: atualizado.restauranteId,
          tipo: TipoEventoTicket.CHECK_IN_REALIZADO,
          tipoAtor: TipoAtor.OPERADOR,
          atorId: ator.id,
          metadados: { novaPrioridade: PrioridadeTicket.CHECK_IN_CONFIRMADO }
        }
      });
      return atualizado;
    });
    
    logger.info({ ticketId, atorId: ator.id }, 'Check-in realizado por operador');
    return ticketAtualizado;
  }
}

export default TicketService;