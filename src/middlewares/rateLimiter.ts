import rateLimit from 'express-rate-limit';

// Rate limiter geral (100 req/15min)
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Muitas requisições, tente novamente mais tarde',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter para autenticação (5 tentativas/15min)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Muitas tentativas de login, tente novamente mais tarde',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter para criar tickets (50 tickets/15min por IP)
// Previne spam de criação de tickets
export const criarTicketLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 50, // 50 tickets por janela
  message: 'Limite de criação de tickets atingido. Tente novamente em alguns minutos.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter para ações de operador (100 ações/15min)
// Chamar, rechamar, pular, finalizar, cancelar
export const operadorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // 100 ações por janela
  message: 'Limite de ações atingido. Aguarde alguns minutos.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter para consultas públicas (30 req/min por IP)
// Evita polling agressivo de clientes consultando posição
export const consultaPublicaLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 30, // 30 requisições por minuto
  message: 'Muitas consultas. Aguarde um momento antes de consultar novamente.',
  standardHeaders: true,
  legacyHeaders: false,
});
