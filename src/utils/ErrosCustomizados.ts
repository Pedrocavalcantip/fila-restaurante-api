// src/utils/ErrosCustomizados.ts

// Erro base
export class ErroAplicacao extends Error {
  public readonly statusCode: number;

  constructor(mensagem: string, statusCode: number) {
    super(mensagem);
    this.statusCode = statusCode;
  }
}

export class ErroCredenciaisInvalidas extends ErroAplicacao {
  constructor(mensagem = 'Credenciais inválidas') {
    super(mensagem, 401);
  }
}

export class ErroTokenInvalido extends ErroAplicacao {
  constructor(mensagem = 'Token inválido ou expirado') {
    super(mensagem, 401);
  }
}

export class ErroNaoAutenticado extends ErroAplicacao {
  constructor(mensagem = 'Token de autenticação não fornecido') {
    super(mensagem, 401);
  }
}

export class ErroProibido extends ErroAplicacao {
  constructor(mensagem = 'Acesso proibido') {
    super(mensagem, 403);
  }
}


export class ErroNaoEncontrado extends ErroAplicacao {
  constructor(mensagem = 'Recurso não encontrado') {
    super(mensagem, 404);
  }
}

export class ErroConflito extends ErroAplicacao {
  constructor(mensagem = 'Os dados fornecidos entram em conflito com os registros existentes') {
    super(mensagem, 409);
  }
}

export class ErroDadosInvalidos extends ErroAplicacao {
  constructor(mensagem = 'Dados inválidos ou requisição mal formatada') {
    super(mensagem, 400);
  }
}

export class ErroServicoExterno extends ErroAplicacao {
  constructor(mensagem = 'Falha na comunicação com um serviço externo') {
    super(mensagem, 502); 
  }
}