import prisma from '../config/database';
import * as bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { logger } from '../config/logger';
import {
  ErroConflito,
  ErroCredenciaisInvalidas,
  ErroNaoEncontrado,
  ErroProibido,
  ErroTokenInvalido,
} from '../utils/ErrosCustomizados';
import { enviarBoasVindas } from './notificacaoService';

const TOKEN_TIPO = 'CLIENTE';
const JWT_EXPIRES_IN = process.env.JWT_CLIENTE_EXPIRES_IN || process.env.JWT_EXPIRES_IN || '30d';
const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 10);

const normalizarEmail = (email: string) => email.trim().toLowerCase();

export type ClienteAutenticado = {
  id: string;
  restauranteId: string;
  nomeCompleto: string;
  email: string;
  telefone: string;
  cidade: string;
  estado: string;
  isVip: boolean;
  vipDesde: Date | null;
  bloqueado: boolean;
  motivoBloqueio: string | null;
  totalVisitas: number;
  totalNoShows: number;
  totalFastLane: number;
  totalVip: number;
  criadoEm: Date;
  atualizadoEm: Date;
  ultimoLoginEm: Date | null;
};

const construirRespostaCliente = (cliente: ClienteAutenticado): ClienteAutenticado => ({
  ...cliente,
});

const gerarTokenCliente = (clienteId: string) => {
  if (!process.env.JWT_SECRET) {
    logger.error('JWT_SECRET não definido para geração de token do cliente');
    throw new Error('Configuração JWT ausente');
  }

  return jwt.sign({ clienteId, tipo: TOKEN_TIPO }, process.env.JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
};

type DadosCadastroCliente = {
  nomeCompleto: string;
  email: string;
  telefone: string;
  senha: string;
  cidade: string;
  estado: string;
  restauranteSlug: string;
};

type DadosLoginCliente = {
  email: string;
  senha: string;
  restauranteSlug: string;
};

const buscarRestaurantePorSlug = async (slug: string) => {
  const restaurante = await prisma.restaurante.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (!restaurante) {
    throw new ErroNaoEncontrado('Restaurante não encontrado.');
  }

  return restaurante;
};

export const cadastrarCliente = async (dados: DadosCadastroCliente) => {
  const email = normalizarEmail(dados.email);
  const telefone = dados.telefone;

  const restaurante = await buscarRestaurantePorSlug(dados.restauranteSlug);

  const emailExistente = await prisma.cliente.findUnique({
    where: {
      restauranteId_email: {
        restauranteId: restaurante.id,
        email,
      },
    },
  });

  if (emailExistente) {
    throw new ErroConflito('Email já cadastrado para este restaurante.');
  }

  const telefoneExistente = await prisma.cliente.findUnique({
    where: {
      restauranteId_telefone: {
        restauranteId: restaurante.id,
        telefone,
      },
    },
  });

  if (telefoneExistente) {
    throw new ErroConflito('Telefone já cadastrado para este restaurante.');
  }

  const senhaHash = await bcrypt.hash(dados.senha, BCRYPT_SALT_ROUNDS);

  const clienteCriado = await prisma.cliente.create({
    data: {
      restauranteId: restaurante.id,
      nomeCompleto: dados.nomeCompleto.trim(),
      telefone,
      email,
      senhaHash,
      cidade: dados.cidade.trim(),
      estado: dados.estado,
    },
    select: {
      id: true,
      restauranteId: true,
      nomeCompleto: true,
      email: true,
      telefone: true,
      cidade: true,
      estado: true,
      isVip: true,
      vipDesde: true,
      bloqueado: true,
      motivoBloqueio: true,
      totalVisitas: true,
      totalNoShows: true,
      totalFastLane: true,
      totalVip: true,
      criadoEm: true,
      atualizadoEm: true,
      ultimoLoginEm: true,
    },
  });

  const token = gerarTokenCliente(clienteCriado.id);

  enviarBoasVindas({
    clienteId: clienteCriado.id,
    restauranteId: restaurante.id,
    nomeCompleto: clienteCriado.nomeCompleto,
    email: clienteCriado.email,
    telefone: clienteCriado.telefone,
  }).catch((error) => {
    logger.error({ error, clienteId: clienteCriado.id }, 'Falha ao acionar notificacao de boas-vindas para cliente');
  });

  logger.info({ clienteId: clienteCriado.id, restauranteId: restaurante.id }, 'Cliente cadastrado com sucesso');

  return {
    token,
    cliente: construirRespostaCliente(clienteCriado),
  };
};

export const loginCliente = async (dados: DadosLoginCliente) => {
  const email = normalizarEmail(dados.email);
  const restaurante = await buscarRestaurantePorSlug(dados.restauranteSlug);

  const cliente = await prisma.cliente.findUnique({
    where: {
      restauranteId_email: {
        restauranteId: restaurante.id,
        email,
      },
    },
    select: {
      id: true,
      restauranteId: true,
      nomeCompleto: true,
      email: true,
      telefone: true,
      cidade: true,
      estado: true,
      isVip: true,
      vipDesde: true,
      bloqueado: true,
      motivoBloqueio: true,
      totalVisitas: true,
      totalNoShows: true,
      totalFastLane: true,
      totalVip: true,
      criadoEm: true,
      atualizadoEm: true,
      ultimoLoginEm: true,
      senhaHash: true,
    },
  });

  if (!cliente) {
    throw new ErroCredenciaisInvalidas();
  }

  const senhaCorreta = await bcrypt.compare(dados.senha, cliente.senhaHash);

  if (!senhaCorreta) {
    throw new ErroCredenciaisInvalidas();
  }

  if (cliente.bloqueado) {
    throw new ErroProibido('Conta bloqueada. Entre em contato com o restaurante.');
  }

  await prisma.cliente.update({
    where: { id: cliente.id },
    data: { ultimoLoginEm: new Date() },
  }).catch((erro) => {
    logger.error({ erro, clienteId: cliente.id }, 'Falha ao atualizar ultimoLoginEm do cliente');
  });

  const token = gerarTokenCliente(cliente.id);

  const { senhaHash, ...clientePublico } = cliente;

  return {
    token,
    cliente: construirRespostaCliente(clientePublico),
  };
};

export const validarTokenEObterCliente = async (token: string) => {
  try {
    if (!process.env.JWT_SECRET) {
      throw new Error('Configuração JWT ausente');
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET) as {
      clienteId: string;
      tipo?: string;
    };

    if (!payload || payload.tipo !== TOKEN_TIPO) {
      throw new ErroTokenInvalido('Token de cliente inválido.');
    }

    const cliente = await prisma.cliente.findUnique({
      where: { id: payload.clienteId },
      select: {
        id: true,
        restauranteId: true,
        nomeCompleto: true,
        email: true,
        telefone: true,
        cidade: true,
        estado: true,
        isVip: true,
        vipDesde: true,
        bloqueado: true,
        motivoBloqueio: true,
        totalVisitas: true,
        totalNoShows: true,
        totalFastLane: true,
        totalVip: true,
        criadoEm: true,
        atualizadoEm: true,
        ultimoLoginEm: true,
      },
    });

    if (!cliente) {
      throw new ErroTokenInvalido('Cliente não encontrado.');
    }

    if (cliente.bloqueado) {
      throw new ErroProibido('Conta bloqueada.');
    }

    return construirRespostaCliente(cliente);
  } catch (error) {
    if (error instanceof ErroTokenInvalido || error instanceof ErroProibido) {
      throw error;
    }

    throw new ErroTokenInvalido();
  }
};
