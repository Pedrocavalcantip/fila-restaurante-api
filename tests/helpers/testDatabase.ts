import prisma from '../../src/config/database';
import bcrypt from 'bcryptjs';

// IDs dos dados de teste (para facilitar limpeza)
export const testIds = {
  restaurante: 'test-restaurante-id',
  usuario: 'test-usuario-id',
  fila: 'test-fila-id',
};


export async function criarDadosTeste() {
  // Criar restaurante de teste
  const restaurante = await prisma.restaurante.upsert({
    where: { id: testIds.restaurante },
    update: {},
    create: {
      id: testIds.restaurante,
      nome: 'Restaurante Teste',
      slug: 'restaurante-teste',
      status: 'ATIVO',
    },
  });

  // Criar usuário operador de teste
  const senhaHash = await bcrypt.hash('senha123', 10);
  const usuario = await prisma.usuario.upsert({
    where: { id: testIds.usuario },
    update: {},
    create: {
      id: testIds.usuario,
      nome: 'Operador Teste',
      email: 'teste@teste.com',
      senha: senhaHash,
      papel: 'OPERADOR',
      restauranteId: testIds.restaurante,
      status: 'ATIVO',
    },
  });

  // Criar fila de teste
  const fila = await prisma.fila.upsert({
    where: { id: testIds.fila },
    update: {},
    create: {
      id: testIds.fila,
      nome: 'Fila Principal',
      slug: 'principal',
      restauranteId: testIds.restaurante,
      status: 'ATIVA',
      politicaOrdem: 'FIFO',
    },
  });

  return {
    restaurante,
    usuario,
    fila,
  };
}


export async function limparDadosTeste() {
  await prisma.eventoTicket.deleteMany({
    where: { restauranteId: testIds.restaurante },
  });
  
  await prisma.ticket.deleteMany({
    where: { restauranteId: testIds.restaurante },
  });
  
  await prisma.fila.deleteMany({
    where: { restauranteId: testIds.restaurante },
  });
  
  await prisma.usuario.deleteMany({
    where: { restauranteId: testIds.restaurante },
  });
  
  await prisma.restaurante.deleteMany({
    where: { id: testIds.restaurante },
  });
}

export async function limparTicketsTeste() {
  await prisma.eventoTicket.deleteMany({
    where: { restauranteId: testIds.restaurante },
  });
  
  await prisma.ticket.deleteMany({
    where: { restauranteId: testIds.restaurante },
  });
}


export async function resetarBancoTeste() {
  await limparDadosTeste();
  await criarDadosTeste();
}


export async function criarTicketTeste(dados: {
  nomeCliente: string;
  filaId?: string;
  restauranteId?: string;
  prioridade?: 'NORMAL' | 'FAST_LANE' | 'VIP';
  status?: 'AGUARDANDO' | 'CHAMADO' | 'ATENDENDO' | 'FINALIZADO' | 'CANCELADO' | 'NO_SHOW';
}) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const ultimoTicket = await prisma.ticket.findFirst({
    where: { 
      filaId: dados.filaId || testIds.fila,
      criadoEm: { gte: hoje }
    },
    orderBy: { numeroTicket: 'desc' },
    select: { numeroTicket: true },
  });

  let proximoNumero = 1;
  if (ultimoTicket) {
    const numeroAtual = parseInt(ultimoTicket.numeroTicket.split('-')[1]);
    proximoNumero = numeroAtual + 1;
  }

  const numeroTicket = `A-${String(proximoNumero).padStart(3, '0')}`;

  const ticket = await prisma.ticket.create({
    data: {
      restauranteId: dados.restauranteId || testIds.restaurante,
      filaId: dados.filaId || testIds.fila,
      nomeCliente: dados.nomeCliente,
      numeroTicket,
      status: dados.status || 'AGUARDANDO',
      prioridade: dados.prioridade || 'NORMAL',
    },
  });

  // Criar evento CRIADO
  await prisma.eventoTicket.create({
    data: {
      ticketId: ticket.id,
      restauranteId: dados.restauranteId || testIds.restaurante,
      tipo: 'CRIADO',
      tipoAtor: 'OPERADOR',
      atorId: testIds.usuario,
    },
  });

  return ticket;
}
