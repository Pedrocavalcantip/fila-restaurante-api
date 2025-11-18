import prisma from '../../src/config/database';
import bcrypt from 'bcryptjs';

// IDs dos dados de teste para clientes
export const clienteTestIds = {
  restaurante1: 'test-cliente-restaurante-1',
  restaurante2: 'test-cliente-restaurante-2',
  fila1: 'test-cliente-fila-1',
  fila2: 'test-cliente-fila-2',
  cliente1: 'test-cliente-1',
  cliente2: 'test-cliente-2-vip',
  clienteBloqueado: 'test-cliente-bloqueado',
  operador1: 'test-cliente-operador-1',
};

export async function criarDadosTesteCliente() {
  // Criar restaurantes de teste
  const restaurante1 = await prisma.restaurante.upsert({
    where: { id: clienteTestIds.restaurante1 },
    update: {},
    create: {
      id: clienteTestIds.restaurante1,
      nome: 'Restaurante SP Centro',
      slug: 'restaurante-sp-centro',
      status: 'ATIVO',
      cidade: 'São Paulo',
      estado: 'SP',
    },
  });

  const restaurante2 = await prisma.restaurante.upsert({
    where: { id: clienteTestIds.restaurante2 },
    update: {},
    create: {
      id: clienteTestIds.restaurante2,
      nome: 'Restaurante SP Zona Sul',
      slug: 'restaurante-sp-zona-sul',
      status: 'ATIVO',
      cidade: 'São Paulo',
      estado: 'SP',
    },
  });

  // Criar filas de teste
  const fila1 = await prisma.fila.upsert({
    where: { id: clienteTestIds.fila1 },
    update: {},
    create: {
      id: clienteTestIds.fila1,
      nome: 'Fila Principal',
      slug: 'principal',
      restauranteId: clienteTestIds.restaurante1,
      status: 'ATIVA',
      politicaOrdem: 'FIFO',
    },
  });

  const fila2 = await prisma.fila.upsert({
    where: { id: clienteTestIds.fila2 },
    update: {},
    create: {
      id: clienteTestIds.fila2,
      nome: 'Fila Principal',
      slug: 'principal',
      restauranteId: clienteTestIds.restaurante2,
      status: 'ATIVA',
      politicaOrdem: 'FIFO',
    },
  });

  // Criar clientes de teste
  const senhaHash = await bcrypt.hash('senha123', 10);

  // Criar operador de teste
  const operador1 = await prisma.usuario.upsert({
    where: { id: clienteTestIds.operador1 },
    update: {},
    create: {
      id: clienteTestIds.operador1,
      nome: 'Operador Cliente Teste',
      email: 'operador-cliente@teste.com',
      senha: senhaHash,
      papel: 'OPERADOR',
      restauranteId: clienteTestIds.restaurante1,
      status: 'ATIVO',
    },
  });

  const cliente1 = await prisma.cliente.upsert({
    where: { id: clienteTestIds.cliente1 },
    update: {},
    create: {
      id: clienteTestIds.cliente1,
      restauranteId: clienteTestIds.restaurante1,
      nomeCompleto: 'Cliente Teste Normal',
      email: 'cliente1@teste.com',
      senhaHash: senhaHash,
      telefone: '(11) 91111-1111',
      cidade: 'São Paulo',
      estado: 'SP',
      isVip: false,
      bloqueado: false,
      totalVisitas: 2,
      totalFastLane: 1,
      totalVip: 0,
    },
  });

  const cliente2 = await prisma.cliente.upsert({
    where: { id: clienteTestIds.cliente2 },
    update: {},
    create: {
      id: clienteTestIds.cliente2,
      restauranteId: clienteTestIds.restaurante1,
      nomeCompleto: 'Cliente Teste VIP',
      email: 'clientevip@teste.com',
      senhaHash: senhaHash,
      telefone: '(11) 92222-2222',
      cidade: 'São Paulo',
      estado: 'SP',
      isVip: true,
      vipDesde: new Date(),
      bloqueado: false,
      totalVisitas: 10,
      totalFastLane: 5,
      totalVip: 3,
    },
  });

  const clienteBloqueado = await prisma.cliente.upsert({
    where: { id: clienteTestIds.clienteBloqueado },
    update: {},
    create: {
      id: clienteTestIds.clienteBloqueado,
      restauranteId: clienteTestIds.restaurante2,
      nomeCompleto: 'Cliente Bloqueado',
      email: 'clientebloqueado@teste.com',
      senhaHash: senhaHash,
      telefone: '(11) 93333-3333',
      cidade: 'Rio de Janeiro',
      estado: 'RJ',
      isVip: false,
      bloqueado: true,
      totalNoShows: 5,
    },
  });

  // Criar templates de mensagem
  await prisma.templatesMensagem.createMany({
    data: [
      {
        restauranteId: clienteTestIds.restaurante1,
        chave: 'cliente.boas_vindas',
        idioma: 'pt-BR',
        assunto: 'Bem-vindo ao {{restaurante}}!',
        conteudo: 'Olá {{nome}}, seja bem-vindo!',
        variaveis: ['restaurante', 'nome'],
      },
      {
        restauranteId: clienteTestIds.restaurante1,
        chave: 'ticket.chamado',
        idioma: 'pt-BR',
        assunto: 'Seu ticket {{numero}} foi chamado!',
        conteudo: 'Olá {{nome}}, seu ticket {{numero}} foi chamado no {{restaurante}}.',
        variaveis: ['numero', 'nome', 'restaurante'],
      },
    ],
    skipDuplicates: true,
  });

  return {
    restaurante1,
    restaurante2,
    fila1,
    fila2,
    cliente1,
    cliente2,
    clienteBloqueado,
  };
}

export async function limparDadosTesteCliente() {
  // Limpar templates
  await prisma.templatesMensagem.deleteMany({
    where: {
      restauranteId: {
        in: [clienteTestIds.restaurante1, clienteTestIds.restaurante2],
      },
    },
  });

  // Limpar notificações
  await prisma.notificacao.deleteMany({
    where: {
      restauranteId: {
        in: [clienteTestIds.restaurante1, clienteTestIds.restaurante2],
      },
    },
  });

  // Limpar eventos de ticket
  await prisma.eventoTicket.deleteMany({
    where: {
      restauranteId: {
        in: [clienteTestIds.restaurante1, clienteTestIds.restaurante2],
      },
    },
  });

  // Limpar tickets
  await prisma.ticket.deleteMany({
    where: {
      restauranteId: {
        in: [clienteTestIds.restaurante1, clienteTestIds.restaurante2],
      },
    },
  });

  // Limpar clientes ANTES das filas (clientes não dependem de filas)
  await prisma.cliente.deleteMany({
    where: {
      restauranteId: {
        in: [clienteTestIds.restaurante1, clienteTestIds.restaurante2],
      },
    },
  });

  // Limpar filas
  await prisma.fila.deleteMany({
    where: {
      id: {
        in: [clienteTestIds.fila1, clienteTestIds.fila2],
      },
    },
  });

  // Limpar usuários (operadores) antes de restaurantes
  await prisma.usuario.deleteMany({
    where: {
      restauranteId: {
        in: [clienteTestIds.restaurante1, clienteTestIds.restaurante2],
      },
    },
  });

  // Limpar restaurantes por último
  await prisma.restaurante.deleteMany({
    where: {
      id: {
        in: [clienteTestIds.restaurante1, clienteTestIds.restaurante2],
      },
    },
  });
}

export async function limparTicketsTesteCliente() {
  await prisma.eventoTicket.deleteMany({
    where: {
      restauranteId: {
        in: [clienteTestIds.restaurante1, clienteTestIds.restaurante2],
      },
    },
  });

  await prisma.ticket.deleteMany({
    where: {
      restauranteId: {
        in: [clienteTestIds.restaurante1, clienteTestIds.restaurante2],
      },
    },
  });
}

export async function atualizarEstatisticasCliente(clienteId: string, stats: {
  totalVisitas?: number;
  totalFastLane?: number;
  totalVip?: number;
}) {
  await prisma.cliente.update({
    where: { id: clienteId },
    data: stats,
  });
}
