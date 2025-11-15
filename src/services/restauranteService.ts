import prisma from '../config/database';
import * as bcrypt from 'bcryptjs';
import { logger } from '../config/logger';
import {
  ErroConflito,
  ErroNaoEncontrado,
  ErroDadosInvalidos,
} from '../utils/ErrosCustomizados';
import { PapelUsuario } from '@prisma/client';

const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 10);

type DadosCadastroRestaurante = {
  nome: string;
  slug: string;
  cidade?: string;
  estado?: string;
  emailAdmin: string;
  senhaAdmin: string;
  precoFastLane?: number;
  precoVip?: number;
};

type DadosAtualizacaoRestaurante = {
  nome?: string;
  cidade?: string;
  estado?: string;
  precoFastLane?: number;
  precoVip?: number;
  permiteFastLane?: boolean;
  toleranciaNoShow?: number;
  avisosNoShow?: number;
  maxReentradasPorDia?: number;
};

export const cadastrarRestaurante = async (dados: DadosCadastroRestaurante) => {
  const emailNormalizado = dados.emailAdmin.trim().toLowerCase();
  const slugNormalizado = dados.slug.trim().toLowerCase();

  // Verificar slug único
  const slugExistente = await prisma.restaurante.findUnique({
    where: { slug: slugNormalizado },
  });

  if (slugExistente) {
    throw new ErroConflito('Slug já está em uso por outro restaurante.');
  }

  // Verificar email admin único
  const emailExistente = await prisma.usuario.findUnique({
    where: { email: emailNormalizado },
  });

  if (emailExistente) {
    throw new ErroConflito('Email já está cadastrado.');
  }

  const senhaHash = await bcrypt.hash(dados.senhaAdmin, BCRYPT_SALT_ROUNDS);

  // Transação: restaurante + admin + fila padrão + templates
  const resultado = await prisma.$transaction(async (tx) => {
    // 1. Criar restaurante
    const restaurante = await tx.restaurante.create({
      data: {
        nome: dados.nome.trim(),
        slug: slugNormalizado,
        cidade: dados.cidade?.trim(),
        estado: dados.estado,
        precoFastLane: dados.precoFastLane ?? 17.00,
        precoVip: dados.precoVip ?? 28.00,
      },
    });

    // 2. Criar usuário ADMIN
    const admin = await tx.usuario.create({
      data: {
        restauranteId: restaurante.id,
        nome: 'Administrador',
        email: emailNormalizado,
        senha: senhaHash,
        papel: PapelUsuario.ADMIN,
      },
    });

    // 3. Criar fila padrão
    const filaPadrao = await tx.fila.create({
      data: {
        restauranteId: restaurante.id,
        nome: 'Principal',
        slug: 'principal',
        descricao: 'Fila padrão do restaurante',
      },
    });

    // 4. Criar templates padrão
    await tx.templatesMensagem.createMany({
      data: [
        {
          restauranteId: restaurante.id,
          chave: 'cliente.boas_vindas',
          idioma: 'pt-BR',
          assunto: 'Bem-vindo(a) ao {{restauranteNome}}!',
          conteudo: 'Olá {{nomeCliente}}! Seja bem-vindo(a) ao sistema de filas do {{restauranteNome}}.',
          variaveis: ['nomeCliente', 'restauranteNome'],
        },
        {
          restauranteId: restaurante.id,
          chave: 'ticket.chamado',
          idioma: 'pt-BR',
          assunto: 'Sua vez chegou - {{restauranteNome}}',
          conteudo: 'Olá {{nomeCliente}}! Seu ticket {{numeroTicket}} foi chamado. Por favor, dirija-se ao atendimento.',
          variaveis: ['nomeCliente', 'numeroTicket', 'restauranteNome'],
        },
      ],
    });

    return { restaurante, admin, filaPadrao };
  });

  logger.info(
    { 
      restauranteId: resultado.restaurante.id, 
      slug: slugNormalizado, 
      adminId: resultado.admin.id 
    },
    'Restaurante cadastrado com sucesso'
  );

  return {
    restaurante: {
      id: resultado.restaurante.id,
      nome: resultado.restaurante.nome,
      slug: resultado.restaurante.slug,
      cidade: resultado.restaurante.cidade,
      estado: resultado.restaurante.estado,
      precoFastLane: resultado.restaurante.precoFastLane,
      precoVip: resultado.restaurante.precoVip,
      criadoEm: resultado.restaurante.criadoEm,
    },
    admin: {
      id: resultado.admin.id,
      nome: resultado.admin.nome,
      email: resultado.admin.email,
    },
    linkAcesso: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/${slugNormalizado}`,
  };
};

export const buscarMeuRestaurante = async (restauranteId: string) => {
  const restaurante = await prisma.restaurante.findUnique({
    where: { id: restauranteId },
    select: {
      id: true,
      nome: true,
      slug: true,
      cidade: true,
      estado: true,
      fusoHorario: true,
      idioma: true,
      status: true,
      horariosFuncionamento: true,
      toleranciaNoShow: true,
      avisosNoShow: true,
      penalidadeNoShow: true,
      maxReentradasPorDia: true,
      permiteFastLane: true,
      precoFastLane: true,
      precoVip: true,
      smsAtivado: true,
      whatsappAtivado: true,
      emailAtivado: true,
      pushAtivado: true,
      maxTicketsPorHora: true,
      maxConexoesSimultaneas: true,
      criadoEm: true,
      atualizadoEm: true,
      _count: {
        select: {
          filas: true,
          tickets: true,
          clientes: true,
          usuarios: true,
        },
      },
    },
  });

  if (!restaurante) {
    throw new ErroNaoEncontrado('Restaurante não encontrado.');
  }

  return restaurante;
};

export const atualizarRestaurante = async (
  restauranteId: string,
  dados: DadosAtualizacaoRestaurante
) => {
  const restauranteExistente = await prisma.restaurante.findUnique({
    where: { id: restauranteId },
  });

  if (!restauranteExistente) {
    throw new ErroNaoEncontrado('Restaurante não encontrado.');
  }

  if (Object.keys(dados).length === 0) {
    throw new ErroDadosInvalidos('Nenhum campo para atualizar foi fornecido.');
  }

  const restauranteAtualizado = await prisma.restaurante.update({
    where: { id: restauranteId },
    data: {
      ...(dados.nome && { nome: dados.nome.trim() }),
      ...(dados.cidade !== undefined && { cidade: dados.cidade?.trim() }),
      ...(dados.estado !== undefined && { estado: dados.estado }),
      ...(dados.precoFastLane !== undefined && { precoFastLane: dados.precoFastLane }),
      ...(dados.precoVip !== undefined && { precoVip: dados.precoVip }),
      ...(dados.permiteFastLane !== undefined && { permiteFastLane: dados.permiteFastLane }),
      ...(dados.toleranciaNoShow !== undefined && { toleranciaNoShow: dados.toleranciaNoShow }),
      ...(dados.avisosNoShow !== undefined && { avisosNoShow: dados.avisosNoShow }),
      ...(dados.maxReentradasPorDia !== undefined && { maxReentradasPorDia: dados.maxReentradasPorDia }),
    },
    select: {
      id: true,
      nome: true,
      slug: true,
      cidade: true,
      estado: true,
      precoFastLane: true,
      precoVip: true,
      permiteFastLane: true,
      toleranciaNoShow: true,
      avisosNoShow: true,
      maxReentradasPorDia: true,
      atualizadoEm: true,
    },
  });

  logger.info({ restauranteId }, 'Restaurante atualizado com sucesso');

  return restauranteAtualizado;
};
