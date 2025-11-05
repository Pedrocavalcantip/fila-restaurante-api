import { Request, Response, NextFunction } from 'express';
import { PapelUsuario } from '@prisma/client';
import { ErroNaoAutenticado } from '../utils/ErrosCustomizados';
import * as authService from '../services/authService';

// Estende o Request do Express 
declare global {
  namespace Express {
    export interface Request {
      usuario: {
        id: string;
        restauranteId: string;
        papel: PapelUsuario;
        status: string;
      };
    }
  }
}


export const autenticar = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Pegar o token do header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ErroNaoAutenticado();
    }
    const token = authHeader.split(' ')[1];

    // Chamar o Service 
    const usuario = await authService.validarTokenEBuscarUsuario(token);

    // Injetar usuário no Request 
    req.usuario = usuario;
    next(); // Sucesso, passa para o próximo middleware

  } catch (error) {
    // Enviar erros para o próximo middleware 
    next(error); 
  }
};