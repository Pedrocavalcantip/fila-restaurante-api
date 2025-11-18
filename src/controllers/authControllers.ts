import { Request, Response, NextFunction } from 'express';
import { loginSchema } from '../utils/schemasZod';
import * as authService from '../services/authService'; 

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. Validar a entrada 
    const { email, senha } = loginSchema.parse(req).body;

    // 2. Chamar o Service
    const { token, usuario } = await authService.autenticarUsuario(
      email.toLowerCase(),
      senha
    );

    // 3. Responder ao Cliente
    res.status(200).json({
      mensagem: 'Login bem-sucedido!',
      token,
      usuario,
    });
  } catch (error) {
    // 4. Enviar erros para o próximo middleware 
    next(error); 
  }
};


export const quemSouEu = (req: Request, res: Response, next: NextFunction) => {
  res.status(200).json(req.usuario);
};