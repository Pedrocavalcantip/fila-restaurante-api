import { z } from 'zod';
import { PapelUsuario, PrioridadeTicket } from '@prisma/client';

const telefoneLimpo = (valor: string) => valor.replace(/\D/g, '');

const validarTelefoneCliente = (valor: string) => {
  const apenasNumeros = telefoneLimpo(valor);
  return /^\d{10,11}$/.test(apenasNumeros);
};

// Auth
export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Email inválido').refine(val => !!val, { message: 'Email é obrigatório' }),
    senha: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres').refine(val => !!val, { message: 'Senha é obrigatória' }),
  }),
});

export const cadastroClienteSchema = z.object({
  body: z.object({
    nomeCompleto: z.string()
      .trim()
      .min(3, 'Nome completo deve ter pelo menos 3 caracteres')
      .max(120, 'Nome completo muito longo'),
    email: z.string()
      .email('Email inválido')
      .trim()
      .max(150, 'Email muito longo'),
    telefone: z.string()
      .trim()
      .min(10, 'Telefone deve ter entre 10 e 11 dígitos')
      .max(20, 'Telefone muito longo')
      .refine(validarTelefoneCliente, { message: 'Telefone deve conter 10 ou 11 dígitos numéricos' })
      .transform(valor => telefoneLimpo(valor)),
    senha: z.string()
      .min(8, 'Senha deve ter no mínimo 8 caracteres'),
    cidade: z.string()
      .trim()
      .min(2, 'Cidade é obrigatória'),
    estado: z.string()
      .trim()
      .length(2, 'Estado deve ter exatamente 2 caracteres')
      .transform(valor => valor.toUpperCase()),
  }),
});

export const loginClienteSchema = z.object({
  body: z.object({
    email: z.string()
      .email('Email inválido')
      .trim(),
    senha: z.string()
      .min(1, 'Senha é obrigatória'),
  }),
});

export const atualizarPerfilClienteSchema = z.object({
  body: z.object({
    nomeCompleto: z.string()
      .trim()
      .min(3, 'Nome completo deve ter pelo menos 3 caracteres')
      .max(120, 'Nome completo muito longo')
      .optional(),
    cidade: z.string()
      .trim()
      .min(2, 'Cidade deve ter pelo menos 2 caracteres')
      .max(100, 'Cidade muito longa')
      .optional(),
    estado: z.string()
      .trim()
      .length(2, 'Estado deve ter exatamente 2 caracteres')
      .transform(valor => valor.toUpperCase())
      .optional(),
  }),
});

const validarSlugRestaurante = (slug: string) => {
  return /^[a-z0-9-]+$/.test(slug);
};

export const cadastroRestauranteSchema = z.object({
  body: z.object({
    nome: z.string()
      .trim()
      .min(3, 'Nome deve ter pelo menos 3 caracteres')
      .max(100, 'Nome muito longo'),
    slug: z.string()
      .trim()
      .min(3, 'Slug deve ter pelo menos 3 caracteres')
      .max(50, 'Slug muito longo')
      .toLowerCase()
      .refine(validarSlugRestaurante, { 
        message: 'Slug deve conter apenas letras minúsculas, números e hífens' 
      }),
    cidade: z.string()
      .trim()
      .min(2, 'Cidade deve ter pelo menos 2 caracteres')
      .max(100, 'Cidade muito longa')
      .optional(),
    estado: z.string()
      .trim()
      .length(2, 'Estado deve ter exatamente 2 caracteres')
      .transform(valor => valor.toUpperCase())
      .optional(),
    emailAdmin: z.string()
      .email('Email inválido')
      .trim()
      .max(150, 'Email muito longo'),
    senhaAdmin: z.string()
      .min(8, 'Senha deve ter no mínimo 8 caracteres'),
    precoFastLane: z.number()
      .positive('Preço Fast Lane deve ser positivo')
      .optional()
      .default(17.00),
    precoVip: z.number()
      .positive('Preço VIP deve ser positivo')
      .optional()
      .default(28.00),
  }),
});

export const atualizarRestauranteSchema = z.object({
  body: z.object({
    nome: z.string()
      .trim()
      .min(3, 'Nome deve ter pelo menos 3 caracteres')
      .max(100, 'Nome muito longo')
      .optional(),
    cidade: z.string()
      .trim()
      .min(2, 'Cidade deve ter pelo menos 2 caracteres')
      .max(100, 'Cidade muito longa')
      .optional(),
    estado: z.string()
      .trim()
      .length(2, 'Estado deve ter exatamente 2 caracteres')
      .transform(valor => valor.toUpperCase())
      .optional(),
    precoFastLane: z.number()
      .positive('Preço Fast Lane deve ser positivo')
      .optional(),
    precoVip: z.number()
      .positive('Preço VIP deve ser positivo')
      .optional(),
    permiteFastLane: z.boolean().optional(),
    toleranciaNoShow: z.number().int().positive().optional(),
    avisosNoShow: z.number().int().positive().optional(),
    maxReentradasPorDia: z.number().int().positive().optional(),
  }),
});

// Criar Usuário
export const criarUsuarioSchema = z.object({
  body: z.object({
    nome: z.string().min(3, 'Nome muito curto').refine(val => !!val, { message: 'Nome é obrigatório' }),
    email: z.string().email('Email inválido').refine(val => !!val, { message: 'Email é obrigatório' }),
    senha: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres').refine(val => !!val, { message: 'Senha é obrigatória' }),
    papel: z.nativeEnum(PapelUsuario).refine(val => !!val, { message: 'Papel é obrigatório' }),
  }),
});

export const criarTicketLocalSchema = z.object({
  nomeCliente: z.string({
    message: 'Nome do cliente é obrigatório'
  })
  .min(3, 'Nome do cliente deve ter pelo menos 3 caracteres')
  .max(100, 'Nome do cliente muito longo (máximo 100 caracteres)')
  .trim(), 

  telefoneCliente: z.string()
    .min(10, 'Telefone deve ter 10 ou 11 dígitos')
    .max(11, 'Telefone deve ter 10 ou 11 dígitos')
    .regex(/^\d+$/, "Telefone deve conter apenas números")
    .optional()
    .or(z.literal(''))
    .transform(val => val === '' ? undefined : val), 

  emailCliente: z.string()
    .email('Email inválido')
    .max(100, 'Email muito longo (máximo 100 caracteres)')
    .optional()
    .or(z.literal(''))
    .transform(val => val === '' ? undefined : val), 
});

export const entrarNaFilaRemotoSchema = z.object({
  body: z.object({
    prioridade: z.nativeEnum(PrioridadeTicket, {
      message: 'Prioridade inválida. Valores aceitos: NORMAL, FAST_LANE, VIP',
    }),
    quantidadePessoas: z.number()
      .int('Quantidade de pessoas deve ser um número inteiro')
      .min(1, 'Quantidade mínima é 1 pessoa')
      .max(20, 'Quantidade máxima é 20 pessoas')
      .optional()
      .default(1),
  }),
});