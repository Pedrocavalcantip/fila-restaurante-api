import { Request, Response, NextFunction } from 'express';
import { cadastroClienteSchema, loginClienteSchema } from '../utils/schemasZod';
import { cadastrarCliente, loginCliente } from '../services/authClienteService';

export const cadastrar = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { body } = cadastroClienteSchema.parse(req);

    const resultado = await cadastrarCliente(body);

    res.status(201).json({
      mensagem: 'Cadastro realizado com sucesso',
      ...resultado,
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { body } = loginClienteSchema.parse(req);

    const resultado = await loginCliente(body);

    res.status(200).json({
      mensagem: 'Login bem-sucedido',
      ...resultado,
    });
  } catch (error) {
    next(error);
  }
};
