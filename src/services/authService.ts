import  prisma  from '../config/database'; 
import * as bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PapelUsuario } from '@prisma/client';
import {
  ErroCredenciaisInvalidas,
  ErroProibido,
  ErroTokenInvalido,
} from '../utils/ErrosCustomizados';

interface PayloadToken {
  id: string;
  restauranteId: string;
  papel: PapelUsuario;
}

export const autenticarUsuario = async (emailLimpo: string, senha: string) => {
  // 1. Buscar o usuário no banco
  const usuario = await prisma.usuario.findUnique({
    where: { email: emailLimpo },
  });

  if (!usuario) {
    throw new ErroCredenciaisInvalidas(); 
  }

  // 2. Comparar a senha
  const senhaCorreta = await bcrypt.compare(senha, usuario.senha);

  if (!senhaCorreta) {
    throw new ErroCredenciaisInvalidas(); 
  }

  // 3. Checar se o usuário está ativo
  if (usuario.status !== 'ATIVO') {
    throw new ErroProibido('Usuário inativo ou suspenso.');
  }

  // 4. Gerar o Token JWT
  const payload: PayloadToken = {
    id: usuario.id,
    restauranteId: usuario.restauranteId,
    papel: usuario.papel,
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET as string, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

  // 5. Retornar os dados (sem a senha)
  return {
    token,
    usuario: {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      papel: usuario.papel,
    },
  };
};


export const validarTokenEBuscarUsuario = async (token: string) => {
  try {
    // 1. Validar o token
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    ) as PayloadToken;

    // 2. Checar se o usuário do token ainda existe e está ativo
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.id },
      select: { id: true, restauranteId: true, papel: true, status: true },
    });

    if (!usuario || usuario.status !== 'ATIVO') {
      throw new ErroTokenInvalido('Token inválido ou usuário desativado.');
    }

    // 3. Retornar os dados seguros do usuário
    return usuario;
    
  } catch (error) {
    // Pega erros do jwt.verify (ex: expirado, assinatura inválida)
    throw new ErroTokenInvalido(); 
  }
};

export function login(arg0: { email: string; senha: string; }) {
    throw new Error('Function not implemented.');
}
