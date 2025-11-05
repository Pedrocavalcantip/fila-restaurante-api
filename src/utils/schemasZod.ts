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