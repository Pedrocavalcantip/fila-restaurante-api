import { Request, Response, NextFunction } from 'express';
import { atualizarPerfilClienteSchema } from '../utils/schemasZod';
import {
  buscarRestaurantesProximos,
  buscarPerfil,
  atualizarPerfil,
} from '../services/clienteService';
import { ErroNaoAutenticado } from '../utils/ErrosCustomizados';

export const listarRestaurantesProximos = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const cliente = req.cliente;
    if (!cliente) {
      throw new ErroNaoAutenticado();
    }

    const restaurantes = await buscarRestaurantesProximos(cliente.id);

    res.status(200).json({
      restaurantes,
      total: restaurantes.length,
    });
  } catch (error) {
    next(error);
  }
};

export const obterPerfil = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cliente = req.cliente;
    if (!cliente) {
      throw new ErroNaoAutenticado();
    }

    const perfil = await buscarPerfil(cliente.id);

    res.status(200).json(perfil);
  } catch (error) {
    next(error);
  }
};

export const atualizarMeuPerfil = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const cliente = req.cliente;
    if (!cliente) {
      throw new ErroNaoAutenticado();
    }

    const { body } = atualizarPerfilClienteSchema.parse(req);

    const perfilAtualizado = await atualizarPerfil(cliente.id, body);

    res.status(200).json({
      mensagem: 'Perfil atualizado com sucesso',
      cliente: perfilAtualizado,
    });
  } catch (error) {
    next(error);
  }
};
