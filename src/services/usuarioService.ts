import prisma from '../config/database';
import * as bcrypt from 'bcryptjs';
import { logger } from '../config/logger';
import {
  ErroConflito,
  ErroNaoEncontrado,
  ErroProibido,
} from '../utils/ErrosCustomizados';
import { PapelUsuario } from '@prisma/client';

const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 10);

type DadosCriarOperador = {
  nome: string;
  email: string;
  senha: string;
  papel: PapelUsuario;
};

/**
 * Criar novo operador para o restaurante
 * Apenas ADMIN pode criar operadores
 */
export const criarOperador = async (
  restauranteId: string,
  dados: DadosCriarOperador
) => {
  const emailNormalizado = dados.email.trim().toLowerCase();

  // Validar papel (apenas OPERADOR pode ser criado)
  if (dados.papel !== PapelUsuario.OPERADOR) {
    throw new ErroProibido('Apenas operadores podem ser criados por esta rota');
  }

  // Verificar se email já existe
  const emailExistente = await prisma.usuario.findUnique({
    where: { email: emailNormalizado },
  });

  if (emailExistente) {
    throw new ErroConflito('Email já está cadastrado no sistema');
  }

  // Hash da senha
  const senhaHash = await bcrypt.hash(dados.senha, BCRYPT_SALT_ROUNDS);

  // Criar operador
  const operador = await prisma.usuario.create({
    data: {
      restauranteId,
      nome: dados.nome.trim(),
      email: emailNormalizado,
      senha: senhaHash,
      papel: PapelUsuario.OPERADOR,
    },
    select: {
      id: true,
      nome: true,
      email: true,
      papel: true,
      status: true,
      criadoEm: true,
    },
  });

  logger.info(
    { restauranteId, operadorId: operador.id },
    'Operador criado com sucesso'
  );

  return operador;
};

/**
 * Listar todos os usuários (operadores) do restaurante
 */
export const listarEquipe = async (restauranteId: string) => {
  const usuarios = await prisma.usuario.findMany({
    where: { restauranteId },
    select: {
      id: true,
      nome: true,
      email: true,
      papel: true,
      status: true,
      criadoEm: true,
      ultimoLoginEm: true,
    },
    orderBy: [
      { papel: 'asc' }, // ADMIN primeiro
      { criadoEm: 'desc' },
    ],
  });

  return usuarios;
};

/**
 * Deletar operador
 * ADMIN não pode ser deletado por esta rota
 */
export const deletarOperador = async (
  restauranteId: string,
  operadorId: string
) => {
  const operador = await prisma.usuario.findUnique({
    where: { id: operadorId },
    select: {
      id: true,
      restauranteId: true,
      papel: true,
    },
  });

  if (!operador) {
    throw new ErroNaoEncontrado('Operador não encontrado');
  }

  // Verificar se pertence ao mesmo restaurante
  if (operador.restauranteId !== restauranteId) {
    throw new ErroProibido('Este operador não pertence ao seu restaurante');
  }

  // Não permitir deletar ADMIN
  if (operador.papel === PapelUsuario.ADMIN) {
    throw new ErroProibido('Não é possível deletar o administrador do sistema');
  }

  await prisma.usuario.delete({
    where: { id: operadorId },
  });

  logger.info(
    { restauranteId, operadorId },
    'Operador deletado com sucesso'
  );

  return { mensagem: 'Operador deletado com sucesso' };
};

/**
 * Buscar informações de um operador específico
 */
export const buscarOperador = async (
  restauranteId: string,
  operadorId: string
) => {
  const operador = await prisma.usuario.findFirst({
    where: {
      id: operadorId,
      restauranteId,
    },
    select: {
      id: true,
      nome: true,
      email: true,
      papel: true,
      status: true,
      criadoEm: true,
      atualizadoEm: true,
      ultimoLoginEm: true,
    },
  });

  if (!operador) {
    throw new ErroNaoEncontrado('Operador não encontrado');
  }

  return operador;
};
