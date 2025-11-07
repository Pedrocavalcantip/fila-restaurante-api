import { Request, Response, NextFunction } from 'express';
import { ErroAplicacao } from '../utils/ErrosCustomizados';
import { ZodError } from 'zod';
import { logger } from '../config/logger';

export const tratarErros = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction 
) => {
  logger.error(err.stack); 

  // Erro de validação do Zod
  if (err instanceof ZodError) {
    return res.status(400).json({
      erro: 'Dados de entrada inválidos',
      detalhes: err.flatten().fieldErrors,
    });
  }

  // Nossos erros customizados (ErroAplicacao)
  if (err instanceof ErroAplicacao) {
    return res.status(err.statusCode).json({
      erro: err.message,
    });
  }
  
  // Erros do Prisma
  if (err.name === 'PrismaClientKnownRequestError') {
     return res.status(404).json({ erro: 'Recurso não encontrado.' });
  }

  // Erro genérico (500)
  return res.status(500).json({
    erro: 'Ocorreu um erro interno no servidor.',
  });
};