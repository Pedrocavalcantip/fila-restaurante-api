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
  observacoes?: string;
  filaId: string;
}

type CriarTicketRemotoDTO = {
  clienteId: string;
  restauranteSlug: string;
  prioridade: PrioridadeTicket;
  quantidadePessoas: number;
  observacoes?: string;
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
    const { clienteId, restauranteSlug, prioridade, quantidadePessoas, observacoes } = dados;

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
        status: { in: [StatusTicket.AGUARDANDO, StatusTicket.CHAMADO, 'MESA_PRONTA' as StatusTicket] }
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
        status: { in: [StatusTicket.AGUARDANDO, StatusTicket.CHAMADO, 'MESA_PRONTA' as StatusTicket] } 
      }
    });
    
    if (ticketsAtivos >= fila.maxSimultaneos) {
      throw new ErroDadosInvalidos(`Fila cheia. Capacidade máxima: ${fila.maxSimultaneos} pessoas.`);
    }

    // 6. Validar limite de reentradas diárias
    // COMENTADO PARA TESTES - REATIVAR EM PRODUÇÃO
    /*
    const inicioHoje = new Date();
    inicioHoje.setHours(0, 0, 0, 0);
    
    const ticketsHoje = await prisma.ticket.count({
      where: {
        restauranteId: restaurante.id,
        clienteId,
        criadoEm: { gte: inicioHoje },
        status: {
          notIn: [StatusTicket.FINALIZADO, StatusTicket.CANCELADO]
        }
      }
    });
    
    if (ticketsHoje >= restaurante.maxReentradasPorDia) {
      throw new ErroDadosInvalidos('Limite de reentradas diárias atingido para este restaurante.');
    }
    */

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

    // 8. Gerar número do ticket e criar registro (com retry para race condition)
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    let novoTicket;
    let tentativas = 0;
    const maxTentativas = 5;

    while (tentativas < maxTentativas) {
      try {
        novoTicket = await prisma.$transaction(async (tx) => {
          // Contar tickets do dia para gerar próximo número
          const ticketsHoje = await tx.ticket.count({
            where: { filaId: fila.id, criadoEm: { gte: hoje } }
          });

          // Usar timestamp para evitar colisão + sequencial como fallback
          const timestamp = Date.now().toString().slice(-4);
          const sequencial = ticketsHoje + 1 + tentativas;
          const numeroTicket = `A-${sequencial.toString().padStart(3, '0')}-${timestamp}`;

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
          quantidadePessoas,
          observacoes: observacoes || null,
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

        // Sucesso - sair do loop
        break;
      } catch (error: any) {
        // Se for erro de unique constraint, retry
        if (error.code === 'P2002' && tentativas < maxTentativas - 1) {
          tentativas++;
          logger.warn({ tentativa: tentativas, clienteId }, 'Race condition ao criar ticket - tentando novamente');
          await new Promise(resolve => setTimeout(resolve, 100 * tentativas)); // Backoff exponencial
          continue;
        }
        // Outro erro ou esgotou tentativas - propagar
        throw error;
      }
    }

    if (!novoTicket) {
      throw new Error('Falha ao criar ticket após múltiplas tentativas');
    }

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
    const { filaId, nomeCliente, telefoneCliente, emailCliente, observacoes } = dados;

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
        status: { in: [StatusTicket.AGUARDANDO, StatusTicket.CHAMADO, 'MESA_PRONTA' as StatusTicket] } 
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
          observacoes: observacoes?.trim() || null,
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
      status: { in: [StatusTicket.AGUARDANDO, StatusTicket.CHAMADO, 'MESA_PRONTA' as StatusTicket] }
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
      } else if (ticket.status === 'MESA_PRONTA') {
        // Tickets com mesa pronta não têm posição na fila
        posicao = 0;
        tempoEstimado = 0;
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
  static async buscarMeuTicket(clienteId: string): Promise<any[]> {
    const tickets = await prisma.ticket.findMany({
      where: {
        clienteId,
      },
      include: {
        fila: {
          select: { id: true, nome: true, slug: true, status: true }
        },
        restaurante: {
          select: { id: true, nome: true, slug: true, cidade: true, estado: true, imagemUrl: true }
        }
      },
      orderBy: { criadoEm: 'desc' }
    });

    // Calcular tempoEsperaMinutos e posição para cada ticket
    const ticketsComDados = await Promise.all(tickets.map(async (ticket) => {
      let tempoEsperaMinutos = 0;
      let posicao = 0;
      let tempoEstimado = 0;
      
      if (ticket.finalizadoEm && ticket.entradaEm) {
        tempoEsperaMinutos = Math.floor((ticket.finalizadoEm.getTime() - ticket.entradaEm.getTime()) / (1000 * 60));
      } else if (ticket.chamadoEm && ticket.entradaEm) {
        tempoEsperaMinutos = Math.floor((ticket.chamadoEm.getTime() - ticket.entradaEm.getTime()) / (1000 * 60));
      }

      // Calcular posição apenas para tickets AGUARDANDO
      if (ticket.status === StatusTicket.AGUARDANDO) {
        const resultado = await this.calcularPosicao(ticket.id);
        posicao = resultado.posicao;
        tempoEstimado = resultado.tempoEstimado;
      }

      return {
        id: ticket.id,
        numero: parseInt(ticket.numeroTicket) || ticket.numeroTicket,
        numeroTicket: ticket.numeroTicket,
        status: ticket.status,
        prioridade: ticket.prioridade,
        quantidadePessoas: ticket.quantidadePessoas,
        valorPago: parseFloat(ticket.valorPrioridade.toString()),
        tempoEsperaMinutos,
        posicao,
        tempoEstimado,
        createdAt: ticket.criadoEm,
        updatedAt: ticket.atualizadoEm,
        finalizadoEm: ticket.finalizadoEm,
        observacoes: ticket.observacoes,
        filaId: ticket.filaId,
        restauranteId: ticket.restauranteId,
        fila: {
          id: ticket.fila.id,
          nome: ticket.fila.nome,
          slug: ticket.fila.slug,
          status: ticket.fila.status
        },
        restaurante: {
          id: ticket.restaurante.id,
          nome: ticket.restaurante.nome,
          slug: ticket.restaurante.slug,
          cidade: ticket.restaurante.cidade,
          estado: ticket.restaurante.estado,
          imagemUrl: ticket.restaurante.imagemUrl
        }
      };
    }));

    return ticketsComDados;
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

    const statusCancelaveis = [StatusTicket.AGUARDANDO, StatusTicket.CHAMADO, 'MESA_PRONTA' as StatusTicket];
    if (!statusCancelaveis.includes(ticket.status)) {
      throw new ErroDadosInvalidos('Apenas tickets aguardando/chamados/mesa pronta podem ser cancelados.');
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

  static async confirmarPresenca(ticketId: string, ator: AtorDTO): Promise<Ticket> {
    const ticket = await this.validarTicketRestaurante(ticketId, ator.restauranteId);

    if (ticket.status !== StatusTicket.CHAMADO) {
      throw new ErroDadosInvalidos('Apenas tickets chamados podem ter presença confirmada');
    }

    const ticketAtualizado = await prisma.$transaction(async (tx) => {
      const atualizado = await tx.ticket.update({
        where: { id: ticketId },
        data: {
          status: 'MESA_PRONTA' as StatusTicket,
        },
        include: { fila: true }
      });

      await tx.eventoTicket.create({
        data: {
          ticketId,
          restauranteId: ator.restauranteId,
          tipo: 'PRESENCA_CONFIRMADA' as any, // Tipo customizado para o evento
          tipoAtor: ator.papel === PapelUsuario.ADMIN ? TipoAtor.ADMIN : TipoAtor.OPERADOR,
          atorId: ator.id
        }
      });

      return atualizado;
    });

    logger.info({ ticketId }, 'Presença confirmada - Status MESA_PRONTA');

    return ticketAtualizado;
  }

  static async pular(ticketId: string, ator: AtorDTO): Promise<Ticket> {
    const ticket = await this.validarTicketRestaurante(ticketId, ator.restauranteId);

    const statusPulaveis = [StatusTicket.CHAMADO, 'MESA_PRONTA' as StatusTicket];
    if (!statusPulaveis.includes(ticket.status)) {
      throw new ErroDadosInvalidos('Apenas tickets chamados/mesa pronta podem ser pulados');
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

    const statusNoShow = [StatusTicket.CHAMADO, 'MESA_PRONTA' as StatusTicket];
    if (!statusNoShow.includes(ticket.status)) {
      throw new ErroDadosInvalidos('Apenas tickets chamados/mesa pronta podem ser marcados como no-show');
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
        include: { fila: true, cliente: true }
      });
      
      // Incrementar totalNoShows do cliente
      if (atualizado.clienteId) {
        await tx.cliente.update({
          where: { id: atualizado.clienteId },
          data: {
            totalNoShows: { increment: 1 }
          }
        });
      }
      
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

    const statusRechamaveis = [StatusTicket.CHAMADO, 'MESA_PRONTA' as StatusTicket];
    if (!statusRechamaveis.includes(ticket.status)) {
      throw new ErroDadosInvalidos('Apenas tickets chamados/mesa pronta podem ser rechamados');
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

    const statusPermitidos = [StatusTicket.CHAMADO, StatusTicket.ATENDENDO, 'MESA_PRONTA' as StatusTicket];
    if (!statusPermitidos.includes(ticket.status)) {
      throw new ErroDadosInvalidos('Apenas tickets chamados/atendendo/mesa pronta podem ser finalizados');
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

  // ==========================================================================
  // ESTATÍSTICAS DO RESTAURANTE
  // ==========================================================================
  static async obterEstatisticas(restauranteId: string, periodo?: { inicio: Date; fim: Date }) {
    const inicioHoje = new Date();
    inicioHoje.setHours(0, 0, 0, 0);
    
    const inicio7Dias = new Date();
    inicio7Dias.setDate(inicio7Dias.getDate() - 7);
    inicio7Dias.setHours(0, 0, 0, 0);
    
    const inicio30Dias = new Date();
    inicio30Dias.setDate(inicio30Dias.getDate() - 30);
    inicio30Dias.setHours(0, 0, 0, 0);

    // Estatísticas de HOJE
    const ticketsHoje = await prisma.ticket.findMany({
      where: {
        restauranteId,
        criadoEm: { gte: inicioHoje }
      },
      select: {
        status: true,
        prioridade: true,
        valorPrioridade: true,
        quantidadePessoas: true,
        duracaoAtendimento: true,
        entradaEm: true,
        chamadoEm: true,
        finalizadoEm: true
      }
    });

    // Estatísticas dos últimos 7 dias
    const tickets7Dias = await prisma.ticket.findMany({
      where: {
        restauranteId,
        criadoEm: { gte: inicio7Dias }
      },
      select: {
        status: true,
        prioridade: true,
        valorPrioridade: true,
        quantidadePessoas: true,
        duracaoAtendimento: true,
        criadoEm: true
      }
    });

    // Estatísticas dos últimos 30 dias
    const tickets30Dias = await prisma.ticket.findMany({
      where: {
        restauranteId,
        criadoEm: { gte: inicio30Dias }
      },
      select: {
        status: true,
        prioridade: true,
        valorPrioridade: true,
        quantidadePessoas: true,
        duracaoAtendimento: true,
        criadoEm: true
      }
    });

    // Função auxiliar para calcular estatísticas
    const calcularEstatisticas = (tickets: any[]) => {
      const finalizados = tickets.filter(t => t.status === StatusTicket.FINALIZADO);
      const cancelados = tickets.filter(t => t.status === StatusTicket.CANCELADO);
      const noShows = tickets.filter(t => t.status === StatusTicket.NO_SHOW);
      const fastLane = tickets.filter(t => t.prioridade === PrioridadeTicket.FAST_LANE);
      
      // Receita APENAS de FAST_LANE (tickets finalizados)
      const receitaFastLane = fastLane
        .filter(t => t.status === StatusTicket.FINALIZADO)
        .reduce((acc, t) => acc + Number(t.valorPrioridade || 0), 0);
      
      // Total de pessoas atendidas
      const totalPessoasAtendidas = finalizados.reduce((acc, t) => acc + (t.quantidadePessoas || 1), 0);
      
      // Tempo médio de espera (apenas finalizados com chamadoEm e entradaEm)
      const ticketsComTempo = finalizados.filter(t => t.chamadoEm && t.entradaEm);
      const tempoMedioEspera = ticketsComTempo.length > 0
        ? ticketsComTempo.reduce((acc, t) => {
            const espera = (new Date(t.chamadoEm).getTime() - new Date(t.entradaEm).getTime()) / 60000;
            return acc + espera;
          }, 0) / ticketsComTempo.length
        : 0;
      
      // Tempo médio de atendimento
      const ticketsComAtendimento = finalizados.filter(t => t.duracaoAtendimento);
      const tempoMedioAtendimento = ticketsComAtendimento.length > 0
        ? ticketsComAtendimento.reduce((acc, t) => acc + (t.duracaoAtendimento || 0), 0) / ticketsComAtendimento.length
        : 0;

      // Taxa de conversão (finalizados / total)
      const taxaConversao = tickets.length > 0 
        ? (finalizados.length / tickets.length) * 100 
        : 0;

      // Taxa de no-show
      const taxaNoShow = tickets.length > 0 
        ? (noShows.length / tickets.length) * 100 
        : 0;

      return {
        totalTickets: tickets.length,
        finalizados: finalizados.length,
        cancelados: cancelados.length,
        noShows: noShows.length,
        aguardando: tickets.filter(t => t.status === StatusTicket.AGUARDANDO).length,
        emAtendimento: tickets.filter(t => t.status === StatusTicket.ATENDENDO || t.status === StatusTicket.CHAMADO).length,
        
        // Prioridades
        ticketsFastLane: fastLane.length,
        ticketsNormais: tickets.filter(t => t.prioridade === PrioridadeTicket.NORMAL).length,
        
        // Receita (apenas Fast Lane)
        receitaFastLane: Number(receitaFastLane.toFixed(2)),
        
        // Pessoas
        totalPessoasAtendidas,
        mediaPessoasPorTicket: finalizados.length > 0 
          ? Number((totalPessoasAtendidas / finalizados.length).toFixed(1))
          : 0,
        
        // Tempos (em minutos)
        tempoMedioEspera: Number(tempoMedioEspera.toFixed(1)),
        tempoMedioAtendimento: Number(tempoMedioAtendimento.toFixed(1)),
        
        // Taxas
        taxaConversao: Number(taxaConversao.toFixed(1)),
        taxaNoShow: Number(taxaNoShow.toFixed(1))
      };
    };

    // Top clientes (mais visitas)
    const topClientes = await prisma.cliente.findMany({
      where: { restauranteId },
      orderBy: { totalVisitas: 'desc' },
      take: 10,
      select: {
        id: true,
        nomeCompleto: true,
        email: true,
        telefone: true,
        totalVisitas: true,
        totalFastLane: true,
        totalNoShows: true,
        criadoEm: true
      }
    });

    // Resumo geral de clientes
    const totalClientes = await prisma.cliente.count({
      where: { restauranteId }
    });

    // Tickets por dia (últimos 7 dias) para gráfico
    const ticketsPorDia = [];
    for (let i = 6; i >= 0; i--) {
      const dia = new Date();
      dia.setDate(dia.getDate() - i);
      dia.setHours(0, 0, 0, 0);
      
      const proximoDia = new Date(dia);
      proximoDia.setDate(proximoDia.getDate() + 1);
      
      const ticketsDia = tickets7Dias.filter(t => {
        const criado = new Date(t.criadoEm);
        return criado >= dia && criado < proximoDia;
      });
      
      ticketsPorDia.push({
        data: dia.toISOString().split('T')[0],
        total: ticketsDia.length,
        finalizados: ticketsDia.filter(t => t.status === StatusTicket.FINALIZADO).length,
        receita: ticketsDia
          .filter(t => t.status === StatusTicket.FINALIZADO && t.prioridade === PrioridadeTicket.FAST_LANE)
          .reduce((acc, t) => acc + Number(t.valorPrioridade || 0), 0)
      });
    }

    return {
      hoje: calcularEstatisticas(ticketsHoje),
      ultimos7Dias: calcularEstatisticas(tickets7Dias),
      ultimos30Dias: calcularEstatisticas(tickets30Dias),
      
      clientes: {
        total: totalClientes,
        topClientes
      },
      
      graficos: {
        ticketsPorDia
      },
      
      geradoEm: new Date().toISOString()
    };
  }


}

export default TicketService;