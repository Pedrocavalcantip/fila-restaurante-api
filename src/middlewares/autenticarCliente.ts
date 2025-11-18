import { Request, Response, NextFunction } from 'express';
import { ErroNaoAutenticado } from '../utils/ErrosCustomizados';
import { validarTokenEObterCliente, ClienteAutenticado } from '../services/authClienteService';

declare global {
  namespace Express {
    interface Request {
      cliente?: ClienteAutenticado;
    }
  }
}

export const autenticarCliente = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ErroNaoAutenticado();
    }

    const token = authHeader.split(' ')[1];

    const cliente = await validarTokenEObterCliente(token);

    req.cliente = cliente;

    next();
  } catch (error) {
    next(error);
  }
};
