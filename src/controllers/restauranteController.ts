import { Request, Response, NextFunction } from 'express';
import { cadastroRestauranteSchema, atualizarRestauranteSchema } from '../utils/schemasZod';
import {
  cadastrarRestaurante,
  buscarMeuRestaurante,
  buscarRestaurantePorSlug,
  atualizarRestaurante,
} from '../services/restauranteService';
import { ErroNaoAutenticado } from '../utils/ErrosCustomizados';
import { UploadService } from '../services/uploadService';
import { logger } from '../config/logger';

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

export const buscarPorSlug = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { slug } = req.params;

    const restaurante = await buscarRestaurantePorSlug(slug);

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

    // Preprocessar body para remover strings vazias e converter tipos
    const bodyProcessado: any = {};
    
    // Copiar apenas campos válidos (não vazios)
    Object.keys(req.body).forEach(key => {
      const valor = req.body[key];
      if (valor !== '' && valor !== 'undefined' && valor !== null) {
        bodyProcessado[key] = valor;
      }
    });

    logger.info({ 
      restauranteId: usuario.restauranteId, 
      camposRecebidos: Object.keys(req.body),
      camposProcessados: Object.keys(bodyProcessado),
      temArquivo: !!req.file 
    }, 'Atualizando restaurante');

    const { body } = atualizarRestauranteSchema.parse({ body: bodyProcessado });

    // Se há arquivo de imagem, fazer upload para Cloudinary
    if (req.file) {
      logger.info({ restauranteId: usuario.restauranteId }, 'Upload de imagem detectado');
      
      const resultado = await UploadService.uploadImagemRestaurante(
        req.file.buffer,
        usuario.restauranteId
      );

      // Adicionar URL da imagem aos dados de atualização
      body.imagemUrl = resultado.url;
      body.imagemPublicId = resultado.publicId;
    }

    const restauranteAtualizado = await atualizarRestaurante(usuario.restauranteId, body);

    res.status(200).json({
      mensagem: 'Restaurante atualizado com sucesso',
      restaurante: restauranteAtualizado,
    });
  } catch (error) {
    logger.error({ error }, 'Erro ao atualizar restaurante');
    next(error);
  }
};
