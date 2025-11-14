import { z } from 'zod';
import { PapelUsuario } from '@prisma/client';

// Auth
export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Email inválido').refine(val => !!val, { message: 'Email é obrigatório' }),
    senha: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres').refine(val => !!val, { message: 'Senha é obrigatória' }),
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