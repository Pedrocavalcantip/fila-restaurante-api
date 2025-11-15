import { Request, Response, NextFunction } from 'express';
import { cadastroRestauranteSchema, atualizarRestauranteSchema } from '../utils/schemasZod';
import {
  cadastrarRestaurante,
  buscarMeuRestaurante,
  atualizarRestaurante,
} from '../services/restauranteService';
import { ErroNaoAutenticado } from '../utils/ErrosCustomizados';

export const cadastrar = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { body } = cadastroRestauranteSchema.parse(req);

    const resultado = await cadastrarRestaurante(body);

    res.status(201).json({
      mensagem: 'Restaurante cadastrado com sucesso',
      ...resultado,
    });
  } catch (error) {
    next(error);
  }
};

export const buscar = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const usuario = req.usuario;
    if (!usuario) {
      throw new ErroNaoAutenticado();
    }

    const restaurante = await buscarMeuRestaurante(usuario.restauranteId);

    res.status(200).json({
      restaurante,
    });
  } catch (error) {
    next(error);
  }
};

export const atualizar = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const usuario = req.usuario;
    if (!usuario) {
      throw new ErroNaoAutenticado();
    }

    const { body } = atualizarRestauranteSchema.parse(req);

    const restauranteAtualizado = await atualizarRestaurante(usuario.restauranteId, body);

    res.status(200).json({
      mensagem: 'Restaurante atualizado com sucesso',
      restaurante: restauranteAtualizado,
    });
  } catch (error) {
    next(error);
  }
};
