// Extensões de tipos globais para Express
import { PapelUsuario } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      usuario?: {
        id: string;
        restauranteId: string;
        papel: PapelUsuario;
      };
      cliente?: {
        id: string;
        email: string;
      };
    }
  }
}
