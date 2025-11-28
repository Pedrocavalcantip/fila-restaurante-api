import { Request, Response, NextFunction } from 'express';
import { criarUsuarioSchema } from '../utils/schemasZod';
import {
  criarOperador,
  listarEquipe,
  deletarOperador,
  buscarOperador,
} from '../services/usuarioService';
import { ErroNaoAutenticado } from '../utils/ErrosCustomizados';

/**
 * Criar novo operador
 */
export const criar = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const usuario = req.usuario;
    if (!usuario) {
      throw new ErroNaoAutenticado();
    }

    const { body } = criarUsuarioSchema.parse(req);

    const operador = await criarOperador(usuario.restauranteId, body);

    res.status(201).json({
      mensagem: 'Operador criado com sucesso',
      operador,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Listar equipe do restaurante
 */
export const listar = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const usuario = req.usuario;
    if (!usuario) {
      throw new ErroNaoAutenticado();
    }

    const equipe = await listarEquipe(usuario.restauranteId);

    res.status(200).json({
      equipe,
      total: equipe.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Deletar operador
 */
export const deletar = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const usuario = req.usuario;
    if (!usuario) {
      throw new ErroNaoAutenticado();
    }

    const { id } = req.params;

    const resultado = await deletarOperador(usuario.restauranteId, id);

    res.status(200).json(resultado);
  } catch (error) {
    next(error);
  }
};

/**
 * Buscar operador específico
 */
export const buscar = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const usuario = req.usuario;
    if (!usuario) {
      throw new ErroNaoAutenticado();
    }

    const { id } = req.params;

    const operador = await buscarOperador(usuario.restauranteId, id);

    res.status(200).json({ operador });
  } catch (error) {
    next(error);
  }
};
