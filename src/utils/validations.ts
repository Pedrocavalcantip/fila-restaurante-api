import { z } from 'zod';

// Validação de login
export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
});

// Validação de telefone
export const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{10,14}$/, 'Telefone inválido (formato internacional)');
