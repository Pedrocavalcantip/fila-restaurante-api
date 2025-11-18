import prisma from '../config/database';
import { 
  PapelUsuario, 
  StatusTicket, 
  PrioridadeTicket, 
  TipoAtor, 
  TipoEventoTicket, 
  Ticket, 
  StatusFila,
  Prisma,
  TipoEntrada
} from '@prisma/client';
import { ErroNaoEncontrado, ErroDadosInvalidos, ErroNaoAutenticado } from '../utils/ErrosCustomizados';
import { logger } from '../config/logger';
import * as notificacaoService from './notificacaoService';

const ordemPrioridade: Record<PrioridadeTicket, number> = {
  [PrioridadeTicket.VIP]: 1,
  [PrioridadeTicket.FAST_LANE]: 2,
  [PrioridadeTicket.NORMAL]: 3,
};

type CriarTicketDTO = {
  nomeCliente: string;
  telefoneCliente?: string;
  emailCliente?: string;
  filaId: string;
}

type CriarTicketRemotoDTO = {
  clienteId: string;
  restauranteSlug: string;
  prioridade: PrioridadeTicket;
  quantidadePessoas: number;
}

type AtorDTO = {
  id: string;
  restauranteId: string;
  papel: PapelUsuario;
};

type TicketComPosicao = Ticket & {
  posicao: number;
  tempoEstimado: number;
};

type ResultadoPaginado<T> = {
  tickets: T[];
  total: number;
  pagina: number;
  limite: number;
  totalPaginas: number;
};

export class TicketService {
  
  // HELPER: Validar acesso ao ticket pelo restaurante (Segurança Multi-Tenant)
  private static async validarTicketRestaurante(ticketId: string, restauranteId: string) {
    const ticket = await prisma.ticket.findFirst({
      where: { id: ticketId, restauranteId }
    });
    if (!ticket) {
      throw new ErroNaoEncontrado('Ticket não encontrado neste restaurante.');
    }
    return ticket;
  }

  // HELPER: Ordenar tickets 
  private static ordenarTicketsPorPrioridade<T extends { prioridade: PrioridadeTicket; entradaEm: Date }>(
    tickets: T[]
  ): T[] {
    return tickets.sort((a, b) => {
      const prioridadeA = ordemPrioridade[a.prioridade] || 99;
      const prioridadeB = ordemPrioridade[b.prioridade] || 99;
      
      if (prioridadeA !== prioridadeB) {
        return prioridadeA - prioridadeB;
      }
      
      return a.entradaEm.getTime() - b.entradaEm.getTime();
    });
  }

  // HELPERS DE CÁLCULO DE TEMPO
  static async calcularTempoMedio(filaId: string): Promise<number> {
    const atendimentosRecentes = await prisma.ticket.findMany({
      where: {
        filaId,
        status: StatusTicket.FINALIZADO,
        duracaoAtendimento: { not: null, gt: 0 }
      },
      select: { duracaoAtendimento: true },
      orderBy: { finalizadoEm: 'desc' },
      take: 10
    });

    let tempoMedioPorAtendimento = 15; // base 

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

  // FUNÇÃO: Calcular Posição e ETA de um Ticket
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

    // Buscar TODOS os tickets aguardando
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

    // Ordenar usando o helper 
    const ticketsOrdenados = this.ordenarTicketsPorPrioridade(todosTicketsAguardando);
    
    // Encontrar posição no array ordenado
    const posicao = ticketsOrdenados.findIndex(t => t.id === ticketId) + 1;
    
    if (posicao === 0) {
      logger.error({ ticketId }, "Ticket AGUARDANDO não encontrado na fila ordenada.");
      return { posicao: 0, tempoEstimado: 0 };
    }

    const tempoEstimado = await this.calcularTempoEstimado(ticket.filaId, posicao);
    return { posicao, tempoEstimado };
  }


  // FUNÇÃO: Criar Ticket Remoto (Cliente APP)
  static async criarTicketRemoto(dados: CriarTicketRemotoDTO): Promise<TicketComPosicao> {
    const { clienteId, restauranteSlug, prioridade, quantidadePessoas } = dados;

    // 1. Validar cliente (não bloqueado, buscar dados de contato e status VIP)
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: {
        id: true,
        nomeCompleto: true,
        telefone: true,
        email: true,
        bloqueado: true,
        isVip: true
      }
    });

    if (!cliente) {
      throw new ErroNaoEncontrado('Cliente não encontrado.');
    }

    if (cliente.bloqueado) {
      throw new ErroNaoAutenticado('Sua conta está bloqueada. Entre em contato com o suporte.');
    }

    // 2. Buscar restaurante pelo slug
    const restaurante = await prisma.restaurante.findFirst({
      where: { 
        slug: restauranteSlug,
        status: 'ATIVO' 
      },
      select: {
        id: true,
        nome: true,
        precoFastLane: true,
        precoVip: true,
        maxReentradasPorDia: true
      }
    });

    if (!restaurante) {
      throw new ErroNaoEncontrado('Restaurante não encontrado ou inativo.');
    }

    // 3. Verificar se cliente já tem ticket ativo neste restaurante
    const ticketAtivo = await prisma.ticket.findFirst({
      where: {
        clienteId,
        restauranteId: restaurante.id,
        status: { in: [StatusTicket.AGUARDANDO, StatusTicket.CHAMADO] }
      }
    });

    if (ticketAtivo) {
      throw new ErroDadosInvalidos('Você já possui um ticket ativo neste restaurante.');
    }

    // 4. Buscar fila padrão ("Principal") do restaurante
    const fila = await prisma.fila.findFirst({
      where: {
        restauranteId: restaurante.id,
        slug: 'principal',
        status: StatusFila.ATIVA
      }
    });

    if (!fila) {
      throw new ErroNaoEncontrado('Este restaurante não está aceitando novos tickets no momento.');
    }

    // 5. Validar capacidade da fila
    const ticketsAtivos = await prisma.ticket.count({
      where: { 
        filaId: fila.id, 
        status: { in: [StatusTicket.AGUARDANDO, StatusTicket.CHAMADO] } 
      }
    });
    
    if (ticketsAtivos >= fila.maxSimultaneos) {
      throw new ErroDadosInvalidos(`Fila cheia. Capacidade máxima: ${fila.maxSimultaneos} pessoas.`);
    }

    // 6. Validar limite de reentradas diárias
    const inicioHoje = new Date();
    inicioHoje.setHours(0, 0, 0, 0);
    
    const ticketsHoje = await prisma.ticket.count({
      where: {
        restauranteId: restaurante.id,
        clienteId,
        criadoEm: { gte: inicioHoje }
      }
    });
    
    if (ticketsHoje >= restaurante.maxReentradasPorDia) {
      throw new ErroDadosInvalidos('Limite de reentradas diárias atingido para este restaurante.');
    }

    // 7. Calcular valorPrioridade com base na prioridade selecionada e status VIP
    let valorPrioridade = 0;
    
    if (prioridade === PrioridadeTicket.FAST_LANE) {
      const precoFastLane = Number(restaurante.precoFastLane);
      valorPrioridade = cliente.isVip 
        ? precoFastLane * 0.5 
        : precoFastLane;
    } else if (prioridade === PrioridadeTicket.VIP) {
      valorPrioridade = cliente.isVip ? 0 : Number(restaurante.precoVip);
    }

    // 8. Gerar número do ticket e criar registro
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const novoTicket = await prisma.$transaction(async (tx) => {
      const ultimoTicket = await tx.ticket.findFirst({
        where: { filaId: fila.id, criadoEm: { gte: hoje } },
        orderBy: { numeroTicket: 'desc' },
        select: { numeroTicket: true }
      });

      let proximoNumero = 1;
      if (ultimoTicket) {
        const match = ultimoTicket.numeroTicket.match(/A-(\d+)/);
        if (match) {
          proximoNumero = parseInt(match[1]) + 1;
        }
      }

      const numeroTicket = `A-${proximoNumero.toString().padStart(3, '0')}`;

      // CREATE do ticket
      const ticket = await tx.ticket.create({
        data: {
          nomeCliente: cliente.nomeCompleto,
          telefoneCliente: cliente.telefone,
          emailCliente: cliente.email,
          clienteId: cliente.id,
          filaId: fila.id,
          restauranteId: restaurante.id,
          status: StatusTicket.AGUARDANDO,
          prioridade,
          tipoEntrada: TipoEntrada.REMOTO,
          valorPrioridade,
          numeroTicket,
          aceitaWhatsapp: true,
          aceitaSms: true,
          aceitaEmail: true,
        },
        include: {
          fila: {
            select: { id: true, nome: true, slug: true, status: true }
          }
        }
      });

      // CREATE do evento
      await tx.eventoTicket.create({
        data: {
          ticketId: ticket.id,
          restauranteId: restaurante.id,
          tipo: TipoEventoTicket.CRIADO,
          tipoAtor: TipoAtor.CLIENTE,
          atorId: cliente.id,
          metadados: { 
            numeroTicket, 
            prioridade,
            tipoEntrada: TipoEntrada.REMOTO,
            valorPrioridade,
            isVip: cliente.isVip
          }
        }
      });

      return ticket;
    });

    // 9. Calcular posição e tempo estimado
    const { posicao, tempoEstimado } = await this.calcularPosicao(novoTicket.id);

    logger.info({ 
      ticketId: novoTicket.id, 
      clienteId, 
      restauranteId: restaurante.id,
      prioridade,
      valorPrioridade
    }, 'Ticket remoto criado');

    return { ...novoTicket, posicao, tempoEstimado };
  }

  // FUNÇÃO: Criar Ticket 
  static async criarTicketLocal(dados: CriarTicketDTO, ator: AtorDTO): Promise<Ticket & { fila: any }> {
    const { filaId, nomeCliente, telefoneCliente, emailCliente } = dados;

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

    // Validar limites de reentrada 
    if (telefoneCliente && telefoneCliente.trim().length > 0) {
      const restaurante = await prisma.restaurante.findUnique({
        where: { id: ator.restauranteId },
        select: { maxReentradasPorDia: true }
      });

      const inicioHoje = new Date();
      inicioHoje.setHours(0, 0, 0, 0);
      
      const ticketsHoje = await prisma.ticket.count({
        where: {
          restauranteId: ator.restauranteId,
          telefoneCliente: telefoneCliente.trim(),
          criadoEm: { gte: inicioHoje }
        }
      });
      
      if (restaurante && ticketsHoje >= restaurante.maxReentradasPorDia) {
        throw new ErroDadosInvalidos('Limite de reentradas diárias atingido para este cliente.');
      }
    }

    // Validar capacidade da fila
    const ticketsAtivos = await prisma.ticket.count({
      where: { 
        filaId, 
        status: { in: [StatusTicket.AGUARDANDO, StatusTicket.CHAMADO] } 
      }
    });
    
    if (ticketsAtivos >= fila.maxSimultaneos) {
      throw new ErroDadosInvalidos(`Fila cheia. Capacidade máxima: ${fila.maxSimultaneos} pessoas.`);
    }


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
        const match = ultimoTicket.numeroTicket.match(/A-(\d+)/);
        if (match) {
          proximoNumero = parseInt(match[1]) + 1;
        }
      }

      const numeroTicket = `A-${proximoNumero.toString().padStart(3, '0')}`;

      // CREATE do ticket
      const novoTicket = await tx.ticket.create({
        data: {
          nomeCliente,
          telefoneCliente: telefoneCliente?.trim() || null,
          emailCliente: emailCliente?.trim() || null,
          filaId,
          restauranteId: ator.restauranteId,
          status: StatusTicket.AGUARDANDO,
          prioridade: PrioridadeTicket.NORMAL,
          numeroTicket,
          aceitaWhatsapp: !!telefoneCliente,
          aceitaSms: !!telefoneCliente,
          aceitaEmail: !!emailCliente,
        },
        include: {
          fila: {
            select: { id: true, nome: true, slug: true, status: true }
          }
        }
      });

      // CREATE do evento
      await tx.eventoTicket.create({
        data: {
          ticketId: novoTicket.id,
          restauranteId: ator.restauranteId,
          tipo: TipoEventoTicket.CRIADO,
          tipoAtor: ator.papel === PapelUsuario.ADMIN ? TipoAtor.ADMIN : TipoAtor.OPERADOR,
          atorId: ator.id,
          metadados: { 
            numeroTicket, 
            prioridadeInicial: PrioridadeTicket.NORMAL 
          }
        }
      });

      return novoTicket;
    });

    logger.info({ ticketId: resultado.id, restauranteId: ator.restauranteId }, 'Ticket local criado');
    return resultado;
  }

  // FUNÇÃO: Listar Fila Ativa
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

    // 2. Ordenar TODOS em memória
    const ticketsOrdenados = this.ordenarTicketsPorPrioridade(todosTickets);

    // 3. Aplicar paginação em memória
    const ticketsPaginados = ticketsOrdenados.slice(skip, skip + limit);

    // 4. Calcular posição e tempo estimado DINAMICAMENTE
    const tempoMedio = await this.calcularTempoMedio(filaId);
    const ticketsComPosicao: TicketComPosicao[] = [];

    ticketsPaginados.forEach((ticket) => {
      let posicao = 0;
      let tempoEstimado = 0;

      if (ticket.status === StatusTicket.AGUARDANDO) {
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

  // FUNÇÃO: Listar Histórico 
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
      status: { in: [StatusTicket.FINALIZADO, StatusTicket.CANCELADO, StatusTicket.NO_SHOW] }
    };
    
    // Validar status históricos
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
      orderBy: { entradaEm: 'desc' },
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

  // FUNÇÃO: Buscar Ticket por ID com Posição
  static async buscarPorIdComPosicao(
    ticketId: string, 
    restauranteId?: string
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

    const { posicao, tempoEstimado } = await this.calcularPosicao(ticketId);

    return { ...ticket, posicao, tempoEstimado };
  }

  // FUNÇÃO: Buscar Ticket Ativo do Cliente (APP)
  static async buscarMeuTicket(clienteId: string): Promise<TicketComPosicao | null> {
    const ticket = await prisma.ticket.findFirst({
      where: {
        clienteId,
        status: { in: [StatusTicket.AGUARDANDO, StatusTicket.CHAMADO] }
      },
      include: {
        fila: {
          select: { id: true, nome: true, slug: true, status: true }
        },
        restaurante: {
          select: { id: true, nome: true, slug: true }
        }
      },
      orderBy: { criadoEm: 'desc' }
    });

    if (!ticket) {
      return null;
    }

    const { posicao, tempoEstimado } = await this.calcularPosicao(ticket.id);

    return { ...ticket, posicao, tempoEstimado };
  }

  // FUNÇÃO: Cliente Cancelar Seu Próprio Ticket (APP)
  static async cancelarMeuTicket(ticketId: string, clienteId: string): Promise<Ticket> {
    // 1. Buscar ticket e validar ownership
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { fila: true }
    });

    if (!ticket) {
      throw new ErroNaoEncontrado('Ticket não encontrado.');
    }

    if (ticket.clienteId !== clienteId) {
      throw new ErroDadosInvalidos('Você não tem permissão para cancelar este ticket.');
    }

    if (ticket.status !== StatusTicket.AGUARDANDO && ticket.status !== StatusTicket.CHAMADO) {
      throw new ErroDadosInvalidos('Apenas tickets aguardando ou chamados podem ser cancelados.');
    }

    // 2. Cancelar ticket
    const ticketAtualizado = await prisma.$transaction(async (tx) => {
      const atualizado = await tx.ticket.update({
        where: { id: ticketId },
        data: {
          status: StatusTicket.CANCELADO,
          canceladoEm: new Date()
        },
        include: { fila: true }
      });

      await tx.eventoTicket.create({
        data: {
          ticketId,
          restauranteId: ticket.restauranteId,
          tipo: TipoEventoTicket.CANCELADO,
          tipoAtor: TipoAtor.CLIENTE,
          atorId: clienteId,
          metadados: { canceladoPor: 'CLIENTE' }
        }
      });

      return atualizado;
    });

    logger.info({ ticketId, clienteId }, 'Ticket cancelado pelo cliente');
    return ticketAtualizado;
  }

  // AÇÕES DO OPERADOR
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

    // Enviar notificação por email (assíncrono)
    if (ticketAtualizado.emailCliente && ticketAtualizado.aceitaEmail) {
      // Buscar dados do restaurante
      const restaurante = await prisma.restaurante.findUnique({
        where: { id: ticketAtualizado.restauranteId },
        select: {
          id: true,
          nome: true,
          cidade: true,
          estado: true
        }
      });

      if (restaurante) {
        const enderecoCompleto = `${restaurante.cidade} - ${restaurante.estado}`;

        notificacaoService.enviarChamado({
          ticketId: ticketAtualizado.id,
          clienteId: ticketAtualizado.clienteId || undefined,
          nomeCliente: ticketAtualizado.nomeCliente,
          emailCliente: ticketAtualizado.emailCliente,
          numeroTicket: ticketAtualizado.numeroTicket,
          nomeRestaurante: restaurante.nome,
          restauranteId: ticketAtualizado.restauranteId,
          prioridade: ticketAtualizado.prioridade,
          valorPrioridade: Number(ticketAtualizado.valorPrioridade),
          enderecoRestaurante: enderecoCompleto
        }).catch((error) => {
          logger.error({ error, ticketId }, 'Falha ao enviar notificação de chamado');
        });
      }
    }

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
          status: StatusTicket.AGUARDANDO,
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

  /**
   * Finalizar Ticket
   * 
   * Status FINALIZADO significa:
   * - Cliente foi atendido com sucesso
   * - Cliente pagou a conta COMPLETA presencialmente (incluindo taxa de prioridade se houver)
   * - Não há necessidade de pagamento online via gateway
   * - Pagamento é confirmado no momento da finalização
   */
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

      // Se ticket tem clienteId, atualizar estatísticas do cliente
      if (ticket.clienteId) {
        logger.info({ 
          clienteId: ticket.clienteId, 
          ticketId,
          prioridade: ticket.prioridade 
        }, 'Cliente identificado - atualizando estatísticas');
        
        const incrementos: any = {
          totalVisitas: { increment: 1 }
        };

        // Incrementar contadores específicos de prioridade
        if (ticket.prioridade === PrioridadeTicket.FAST_LANE) {
          incrementos.totalFastLane = { increment: 1 };
          logger.info({ clienteId: ticket.clienteId }, 'Incrementando totalFastLane');
        } else if (ticket.prioridade === PrioridadeTicket.VIP) {
          incrementos.totalVip = { increment: 1 };
          logger.info({ clienteId: ticket.clienteId }, 'Incrementando totalVip');
        }

        await tx.cliente.update({
          where: { id: ticket.clienteId },
          data: incrementos
        });

        logger.info({ 
          clienteId: ticket.clienteId, 
          ticketId,
          prioridade: ticket.prioridade,
          incrementos
        }, 'Estatísticas do cliente atualizadas após finalização');
      } else {
        logger.info({ ticketId }, 'Ticket sem clienteId - estatísticas não atualizadas');
      }

      await tx.eventoTicket.create({
        data: {
          ticketId,
          restauranteId: ator.restauranteId,
          tipo: TipoEventoTicket.FINALIZADO,
          tipoAtor: ator.papel === PapelUsuario.ADMIN ? TipoAtor.ADMIN : TipoAtor.OPERADOR,
          atorId: ator.id,
          metadados: { 
            duracaoAtendimento,
            valorPrioridade: Number(ticket.valorPrioridade),
            pagamentoConfirmado: true // Pagamento realizado presencialmente
          }
        }
      });
      return atualizado;
    });

    logger.info({ ticketId, clienteId: ticket.clienteId }, 'Atendimento finalizado - pagamento confirmado presencialmente');
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


}

export default TicketService;