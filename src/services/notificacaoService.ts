import { logger } from '../config/logger';

export type BoasVindasPayload = {
  clienteId: string;
  restauranteId: string;
  nomeCompleto: string;
  email: string;
  telefone?: string;
};

export const enviarBoasVindas = async (dados: BoasVindasPayload): Promise<void> => {
  try {
    logger.info({
      clienteId: dados.clienteId,
      restauranteId: dados.restauranteId,
      email: dados.email,
    }, 'Fila API - notificacao de boas-vindas solicitada');
    
    // TODO: integrar com provedor (SendGrid) na Sprint 3
  } catch (error) {
    logger.error({
      clienteId: dados.clienteId,
      restauranteId: dados.restauranteId,
      error,
    }, 'Falha ao preparar notificacao de boas-vindas');
  }
};
