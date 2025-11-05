import { Request, Response, NextFunction } from 'express';
import { PapelUsuario } from '@prisma/client';
import { ErroNaoAutenticado, ErroProibido } from '../utils/ErrosCustomizados';
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
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ErroNaoAutenticado();
    }
    const token = authHeader.split(' ')[1];
    const usuario = await authService.validarTokenEBuscarUsuario(token);
    req.usuario = usuario;
    next();
  } catch (error) {
    next(error); 
  }
};

export const autorizarPapeis = (papeisPermitdos: PapelUsuario[]) => {
    return ( req: Request, res: Response, next: NextFunction) => {
        try {
            const { papel } = req.usuario;

            if (!papeisPermitdos.includes(papel)) {
                throw new ErroProibido('Você não tem permissão para acessar este recurso.');
            }
            next();
        } catch (error) {
            next(error);
        }
    }
}