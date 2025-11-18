import prisma from '../config/database';
import { logger } from '../config/logger';
import {
  ErroNaoEncontrado,
  ErroDadosInvalidos,
} from '../utils/ErrosCustomizados';

type DadosAtualizacaoPerfil = {
  nomeCompleto?: string;
  cidade?: string;
  estado?: string;
};

export const buscarRestaurantesProximos = async (clienteId: string) => {
  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: { cidade: true, estado: true },
  });

  if (!cliente) {
    throw new ErroNaoEncontrado('Cliente não encontrado.');
  }

  const restaurantes = await prisma.restaurante.findMany({
    where: {
      cidade: cliente.cidade,
      estado: cliente.estado,
      status: 'ATIVO',
    },
    select: {
      id: true,
      nome: true,
      slug: true,
      cidade: true,
      estado: true,
      status: true,
      precoFastLane: true,
      precoVip: true,
      filas: {
        where: {
          status: 'ATIVA',
        },
        select: {
          id: true,
          nome: true,
          slug: true,
          status: true,
          _count: {
            select: {
              tickets: {
                where: {
                  status: {
                    in: ['AGUARDANDO', 'CHAMADO'],
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: {
      nome: 'asc',
    },
  });

  return restaurantes;
};

export const buscarPerfil = async (clienteId: string) => {
  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: {
      id: true,
      restauranteId: true,
      nomeCompleto: true,
      telefone: true,
      email: true,
      cidade: true,
      estado: true,
      totalVisitas: true,
      totalNoShows: true,
      totalFastLane: true,
      totalVip: true,
      isVip: true,
      vipDesde: true,
      bloqueado: true,
      motivoBloqueio: true,
      criadoEm: true,
      atualizadoEm: true,
      ultimoLoginEm: true,
    },
  });

  if (!cliente) {
    throw new ErroNaoEncontrado('Cliente não encontrado.');
  }

  return cliente;
};

export const atualizarPerfil = async (
  clienteId: string,
  dados: DadosAtualizacaoPerfil
) => {
  const clienteExistente = await prisma.cliente.findUnique({
    where: { id: clienteId },
  });

  if (!clienteExistente) {
    throw new ErroNaoEncontrado('Cliente não encontrado.');
  }

  if (Object.keys(dados).length === 0) {
    throw new ErroDadosInvalidos('Nenhum campo para atualizar foi fornecido.');
  }

  const clienteAtualizado = await prisma.cliente.update({
    where: { id: clienteId },
    data: {
      ...(dados.nomeCompleto && { nomeCompleto: dados.nomeCompleto.trim() }),
      ...(dados.cidade !== undefined && { cidade: dados.cidade?.trim() }),
      ...(dados.estado !== undefined && { estado: dados.estado }),
    },
    select: {
      id: true,
      nomeCompleto: true,
      telefone: true,
      email: true,
      cidade: true,
      estado: true,
      totalVisitas: true,
      totalNoShows: true,
      totalFastLane: true,
      totalVip: true,
      isVip: true,
      vipDesde: true,
      atualizadoEm: true,
    },
  });

  logger.info({ clienteId }, 'Perfil do cliente atualizado com sucesso');

  return clienteAtualizado;
};
