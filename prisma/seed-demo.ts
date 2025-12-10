import { PrismaClient, PapelUsuario, StatusTicket, PrioridadeTicket, TipoEventoTicket, TipoAtor, TipoEntrada } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Helper function to generate random timestamps in the last 1-2 hours
function getRandomPastTimestamp(hoursAgo: number = 2): Date {
  const now = new Date();
  const millisAgo = Math.random() * hoursAgo * 60 * 60 * 1000;
  return new Date(now.getTime() - millisAgo);
}

// Helper function to create a ticket with events
async function createTicketWithEvents(ticketData: any, restauranteId: string) {
  const ticket = await prisma.ticket.create({ data: ticketData });
  
  // Always create CRIADO event
  await prisma.eventoTicket.create({
    data: {
      ticketId: ticket.id,
      restauranteId: restauranteId,
      tipo: TipoEventoTicket.CRIADO,
      tipoAtor: TipoAtor.CLIENTE,
      criadoEm: ticket.entradaEm,
    },
  });

  // Create additional events based on status
  if (ticket.status === StatusTicket.CHAMADO && ticket.chamadoEm) {
    await prisma.eventoTicket.create({
      data: {
        ticketId: ticket.id,
        restauranteId: restauranteId,
        tipo: TipoEventoTicket.CHAMADO,
        tipoAtor: TipoAtor.OPERADOR,
        criadoEm: ticket.chamadoEm,
      },
    });
  }

  if (ticket.status === StatusTicket.MESA_PRONTA) {
    const chamadoEm = ticket.chamadoEm || new Date(ticket.entradaEm.getTime() + 10 * 60 * 1000);
    await prisma.eventoTicket.create({
      data: {
        ticketId: ticket.id,
        restauranteId: restauranteId,
        tipo: TipoEventoTicket.CHAMADO,
        tipoAtor: TipoAtor.OPERADOR,
        criadoEm: chamadoEm,
      },
    });
    await prisma.eventoTicket.create({
      data: {
        ticketId: ticket.id,
        restauranteId: restauranteId,
        tipo: TipoEventoTicket.PRESENCA_CONFIRMADA,
        tipoAtor: TipoAtor.CLIENTE,
        criadoEm: new Date(chamadoEm.getTime() + 2 * 60 * 1000),
      },
    });
  }

  if (ticket.status === StatusTicket.ATENDENDO && ticket.atendidoEm) {
    await prisma.eventoTicket.create({
      data: {
        ticketId: ticket.id,
        restauranteId: restauranteId,
        tipo: TipoEventoTicket.ATENDENDO,
        tipoAtor: TipoAtor.OPERADOR,
        criadoEm: ticket.atendidoEm,
      },
    });
  }

  return ticket;
}

async function main() {
  console.log('🌱 Iniciando seed de demonstração...');

  // ========================================
  // LIMPAR DADOS EXISTENTES
  // ========================================
  console.log('🧹 Limpando dados existentes...');
  await prisma.eventoTicket.deleteMany();
  await prisma.notificacao.deleteMany();
  await prisma.pagamento.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.cliente.deleteMany();
  await prisma.fila.deleteMany();
  await prisma.usuario.deleteMany();
  await prisma.templatesMensagem.deleteMany();
  await prisma.entregaWebhook.deleteMany();
  await prisma.webhook.deleteMany();
  await prisma.restaurante.deleteMany();
  console.log('✅ Dados limpos com sucesso!');

  // ========================================
  // RESTAURANTE 1: McDONALD'S (FAST FOOD)
  // ========================================
  console.log('\n🍔 Criando McDonald\'s...');
  const mcdonalds = await prisma.restaurante.create({
    data: {
      nome: 'McDonald\'s Recife Shopping',
      slug: 'mcdonalds-recife',
      cidade: 'Recife',
      estado: 'PE',
      whatsappAtivado: true,
      smsAtivado: true,
      emailAtivado: true,
    },
  });

  // Usuários McDonald's
  const senhaAdminMc = await bcrypt.hash('admin123', 10);
  const adminMc = await prisma.usuario.create({
    data: {
      nome: 'Admin McDonald\'s',
      email: 'admin@mcdonalds-recife.com',
      senha: senhaAdminMc,
      papel: PapelUsuario.ADMIN,
      restauranteId: mcdonalds.id,
    },
  });

  const senhaOperadorMc = await bcrypt.hash('operador123', 10);
  const operadorMc = await prisma.usuario.create({
    data: {
      nome: 'Operador McDonald\'s',
      email: 'operador@mcdonalds-recife.com',
      senha: senhaOperadorMc,
      papel: PapelUsuario.OPERADOR,
      restauranteId: mcdonalds.id,
    },
  });

  // Fila McDonald's
  const filaMc = await prisma.fila.create({
    data: {
      nome: 'Fila Principal',
      slug: 'principal',
      restauranteId: mcdonalds.id,
      fastLaneAtivado: true,
      fastLanePreco: 5.0,
      maxSimultaneos: 35,
      maxEntradasPorHora: 70,
    },
  });

  // Clientes McDonald's
  const clientesMc = await Promise.all([
    prisma.cliente.create({
      data: {
        restauranteId: mcdonalds.id,
        nomeCompleto: 'João Silva',
        telefone: '+5581987654321',
        email: 'joao.silva@email.com',
        cidade: 'Recife',
        estado: 'PE',
        senhaHash: await bcrypt.hash('cliente123', 10),
        totalVisitas: 5,
      },
    }),
    prisma.cliente.create({
      data: {
        restauranteId: mcdonalds.id,
        nomeCompleto: 'Maria Santos',
        telefone: '+5581987654322',
        email: 'maria.santos@email.com',
        cidade: 'Recife',
        estado: 'PE',
        senhaHash: await bcrypt.hash('cliente123', 10),
        totalVisitas: 3,
      },
    }),
    prisma.cliente.create({
      data: {
        restauranteId: mcdonalds.id,
        nomeCompleto: 'Pedro Oliveira',
        telefone: '+5581987654323',
        email: 'pedro.oliveira@email.com',
        cidade: 'Recife',
        estado: 'PE',
        senhaHash: await bcrypt.hash('cliente123', 10),
        totalVisitas: 8,
        totalFastLane: 2,
      },
    }),
  ]);

  // Tickets McDonald's
  let ticketCounter = 1;
  
  // AGUARDANDO - Todos os 3 clientes cadastrados têm ticket ativo
  for (let i = 0; i < 3; i++) {
    const entradaEm = getRandomPastTimestamp(1.5);
    await createTicketWithEvents({
      restauranteId: mcdonalds.id,
      filaId: filaMc.id,
      status: StatusTicket.AGUARDANDO,
      prioridade: i === 0 ? PrioridadeTicket.FAST_LANE : PrioridadeTicket.NORMAL,
      numeroTicket: String(ticketCounter++).padStart(3, '0'),
      nomeCliente: clientesMc[i].nomeCompleto,
      telefoneCliente: clientesMc[i].telefone,
      emailCliente: clientesMc[i].email,
      clienteId: clientesMc[i].id, // TODOS os clientes têm ticket ativo
      tipoEntrada: TipoEntrada.REMOTO,
      entradaEm: entradaEm,
      valorPrioridade: i === 0 ? 5.0 : 0,
      quantidadePessoas: i === 0 ? 2 : (i === 1 ? 4 : 3), // Variado: 2, 4, 3 pessoas
    }, mcdonalds.id);
  }

  // HISTÓRICO - Tickets finalizados antigos (McDonald's)
  // João Silva (clientesMc[0]) - Histórico robusto (5 tickets finalizados)
  for (let i = 0; i < 5; i++) {
    const entradaEm = new Date(Date.now() - (i + 3) * 24 * 60 * 60 * 1000); // 3-7 dias atrás
    const finalizadoEm = new Date(entradaEm.getTime() + (20 + i * 5) * 60 * 1000);
    await createTicketWithEvents({
      restauranteId: mcdonalds.id,
      filaId: filaMc.id,
      status: StatusTicket.FINALIZADO,
      prioridade: i === 0 ? PrioridadeTicket.FAST_LANE : PrioridadeTicket.NORMAL,
      numeroTicket: String(ticketCounter++).padStart(3, '0'),
      nomeCliente: clientesMc[0].nomeCompleto,
      telefoneCliente: clientesMc[0].telefone,
      emailCliente: clientesMc[0].email,
      clienteId: clientesMc[0].id, // João Silva tem histórico robusto
      tipoEntrada: TipoEntrada.LOCAL,
      entradaEm: entradaEm,
      finalizadoEm: finalizadoEm,
      valorPrioridade: i === 0 ? 5.0 : 0,
      quantidadePessoas: i + 1, // 1, 2, 3, 4, 5 pessoas
    }, mcdonalds.id);
  }

  // Maria Santos (clientesMc[1]) - Histórico moderado (2 tickets finalizados)
  for (let i = 0; i < 2; i++) {
    const entradaEm = new Date(Date.now() - (i + 8) * 24 * 60 * 60 * 1000); // 8-9 dias atrás
    const finalizadoEm = new Date(entradaEm.getTime() + 25 * 60 * 1000);
    await createTicketWithEvents({
      restauranteId: mcdonalds.id,
      filaId: filaMc.id,
      status: StatusTicket.FINALIZADO,
      prioridade: PrioridadeTicket.NORMAL,
      numeroTicket: String(ticketCounter++).padStart(3, '0'),
      nomeCliente: clientesMc[1].nomeCompleto,
      telefoneCliente: clientesMc[1].telefone,
      emailCliente: clientesMc[1].email,
      clienteId: clientesMc[1].id,
      tipoEntrada: TipoEntrada.REMOTO,
      entradaEm: entradaEm,
      finalizadoEm: finalizadoEm,
      valorPrioridade: 0,
      quantidadePessoas: i + 2, // 2, 3 pessoas
    }, mcdonalds.id);
  }

  // Pedro Oliveira (clientesMc[2]) - 1 ticket cancelado no passado
  const entradaEmCancelado = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 dias atrás
  await createTicketWithEvents({
    restauranteId: mcdonalds.id,
    filaId: filaMc.id,
    status: StatusTicket.CANCELADO,
    prioridade: PrioridadeTicket.NORMAL,
    numeroTicket: String(ticketCounter++).padStart(3, '0'),
    nomeCliente: clientesMc[2].nomeCompleto,
    telefoneCliente: clientesMc[2].telefone,
    emailCliente: clientesMc[2].email,
    clienteId: clientesMc[2].id,
    tipoEntrada: TipoEntrada.REMOTO,
    entradaEm: entradaEmCancelado,
    canceladoEm: new Date(entradaEmCancelado.getTime() + 5 * 60 * 1000),
    quantidadePessoas: 5,
  }, mcdonalds.id);

  console.log(`✅ McDonald's criado com ${ticketCounter - 1} tickets (incluindo histórico)`);

  // ========================================
  // RESTAURANTE 2: PIZZA HUT (CASUAL DINING)
  // ========================================
  console.log('\n🍕 Criando Pizza Hut...');
  const pizzahut = await prisma.restaurante.create({
    data: {
      nome: 'Pizza Hut Boa Viagem',
      slug: 'pizzahut-boa-viagem',
      cidade: 'Recife',
      estado: 'PE',
      whatsappAtivado: true,
      smsAtivado: false,
      emailAtivado: true,
    },
  });

  // Usuários Pizza Hut
  const senhaAdminPh = await bcrypt.hash('admin123', 10);
  await prisma.usuario.create({
    data: {
      nome: 'Admin Pizza Hut',
      email: 'admin@pizzahut.com',
      senha: senhaAdminPh,
      papel: PapelUsuario.ADMIN,
      restauranteId: pizzahut.id,
    },
  });

  const senhaOperadorPh = await bcrypt.hash('operador123', 10);
  await prisma.usuario.create({
    data: {
      nome: 'Operador Pizza Hut',
      email: 'operador@pizzahut.com',
      senha: senhaOperadorPh,
      papel: PapelUsuario.OPERADOR,
      restauranteId: pizzahut.id,
    },
  });

  // Fila Pizza Hut
  const filaPh = await prisma.fila.create({
    data: {
      nome: 'Fila Principal',
      slug: 'principal',
      restauranteId: pizzahut.id,
      fastLaneAtivado: true,
      fastLanePreco: 8.0,
      maxSimultaneos: 40,
      maxEntradasPorHora: 35,
    },
  });

  // Clientes Pizza Hut
  const clientesPh = await Promise.all([
    prisma.cliente.create({
      data: {
        restauranteId: pizzahut.id,
        nomeCompleto: 'Ana Costa',
        telefone: '+5581988887777',
        email: 'ana.costa@email.com',
        cidade: 'Recife',
        estado: 'PE',
        senhaHash: await bcrypt.hash('cliente123', 10),
        totalVisitas: 12,
        isVip: true,
      },
    }),
    prisma.cliente.create({
      data: {
        restauranteId: pizzahut.id,
        nomeCompleto: 'Carlos Mendes',
        telefone: '+5581988887778',
        email: 'carlos.mendes@email.com',
        cidade: 'Recife',
        estado: 'PE',
        senhaHash: await bcrypt.hash('cliente123', 10),
        totalVisitas: 7,
      },
    }),
    prisma.cliente.create({
      data: {
        restauranteId: pizzahut.id,
        nomeCompleto: 'Beatriz Lima',
        telefone: '+5581988887779',
        email: 'beatriz.lima@email.com',
        cidade: 'Recife',
        estado: 'PE',
        senhaHash: await bcrypt.hash('cliente123', 10),
        totalVisitas: 4,
      },
    }),
    prisma.cliente.create({
      data: {
        restauranteId: pizzahut.id,
        nomeCompleto: 'Daniel Rocha',
        telefone: '+5581988887780',
        email: 'daniel.rocha@email.com',
        cidade: 'Recife',
        estado: 'PE',
        senhaHash: await bcrypt.hash('cliente123', 10),
        totalVisitas: 2,
      },
    }),
  ]);

  ticketCounter = 1;

  // AGUARDANDO - Todos os 4 clientes cadastrados têm ticket ativo
  for (let i = 0; i < 4; i++) {
    const entradaEm = getRandomPastTimestamp(2);
    await createTicketWithEvents({
      restauranteId: pizzahut.id,
      filaId: filaPh.id,
      status: StatusTicket.AGUARDANDO,
      prioridade: i === 0 ? PrioridadeTicket.VIP : (i === 1 ? PrioridadeTicket.FAST_LANE : PrioridadeTicket.NORMAL),
      numeroTicket: String(ticketCounter++).padStart(3, '0'),
      nomeCliente: clientesPh[i].nomeCompleto,
      telefoneCliente: clientesPh[i].telefone,
      emailCliente: clientesPh[i].email,
      clienteId: clientesPh[i].id, // TODOS os clientes têm ticket ativo
      tipoEntrada: TipoEntrada.LOCAL,
      entradaEm: entradaEm,
      valorPrioridade: i === 0 ? 28.0 : (i === 1 ? 8.0 : 0),
      quantidadePessoas: i === 0 ? 4 : (i === 1 ? 2 : (i === 2 ? 6 : 3)), // 4, 2, 6, 3 pessoas
    }, pizzahut.id);
  }

  // HISTÓRICO - Tickets finalizados antigos (Pizza Hut)
  // Ana Costa VIP (clientesPh[0]) - Histórico robusto (6 tickets finalizados, incluindo VIP)
  for (let i = 0; i < 6; i++) {
    const entradaEm = new Date(Date.now() - (i + 2) * 24 * 60 * 60 * 1000); // 2-7 dias atrás
    const finalizadoEm = new Date(entradaEm.getTime() + (30 + i * 10) * 60 * 1000);
    await createTicketWithEvents({
      restauranteId: pizzahut.id,
      filaId: filaPh.id,
      status: StatusTicket.FINALIZADO,
      prioridade: i < 2 ? PrioridadeTicket.VIP : (i < 4 ? PrioridadeTicket.FAST_LANE : PrioridadeTicket.NORMAL),
      numeroTicket: String(ticketCounter++).padStart(3, '0'),
      nomeCliente: clientesPh[0].nomeCompleto,
      telefoneCliente: clientesPh[0].telefone,
      emailCliente: clientesPh[0].email,
      clienteId: clientesPh[0].id, // Ana Costa (VIP) tem histórico robusto
      tipoEntrada: TipoEntrada.LOCAL,
      entradaEm: entradaEm,
      finalizadoEm: finalizadoEm,
      valorPrioridade: i < 2 ? 28.0 : (i < 4 ? 8.0 : 0),
      quantidadePessoas: (i % 4) + 2, // 2, 3, 4, 5, 2, 3 pessoas
    }, pizzahut.id);
  }

  // Carlos Mendes (clientesPh[1]) - Histórico moderado (3 finalizados)
  for (let i = 0; i < 3; i++) {
    const entradaEm = new Date(Date.now() - (i + 8) * 24 * 60 * 60 * 1000); // 8-10 dias atrás
    const finalizadoEm = new Date(entradaEm.getTime() + 35 * 60 * 1000);
    await createTicketWithEvents({
      restauranteId: pizzahut.id,
      filaId: filaPh.id,
      status: StatusTicket.FINALIZADO,
      prioridade: PrioridadeTicket.NORMAL,
      numeroTicket: String(ticketCounter++).padStart(3, '0'),
      nomeCliente: clientesPh[1].nomeCompleto,
      telefoneCliente: clientesPh[1].telefone,
      emailCliente: clientesPh[1].email,
      clienteId: clientesPh[1].id,
      tipoEntrada: TipoEntrada.LOCAL,
      entradaEm: entradaEm,
      finalizadoEm: finalizadoEm,
      valorPrioridade: 0,
      quantidadePessoas: i + 2, // 2, 3, 4 pessoas
    }, pizzahut.id);
  }

  // Beatriz Lima (clientesPh[2]) - 1 no-show no passado
  const entradaEmNoShow = new Date(Date.now() - 12 * 24 * 60 * 60 * 1000); // 12 dias atrás
  await createTicketWithEvents({
    restauranteId: pizzahut.id,
    filaId: filaPh.id,
    status: StatusTicket.NO_SHOW,
    prioridade: PrioridadeTicket.NORMAL,
    numeroTicket: String(ticketCounter++).padStart(3, '0'),
    nomeCliente: clientesPh[2].nomeCompleto,
    telefoneCliente: clientesPh[2].telefone,
    emailCliente: clientesPh[2].email,
    clienteId: clientesPh[2].id,
    tipoEntrada: TipoEntrada.REMOTO,
    entradaEm: entradaEmNoShow,
    chamadoEm: new Date(entradaEmNoShow.getTime() + 20 * 60 * 1000),
    contagemNoShow: 1,
    quantidadePessoas: 3,
  }, pizzahut.id);

  console.log(`✅ Pizza Hut criado com ${ticketCounter - 1} tickets (incluindo histórico)`);

  // ========================================
  // RESTAURANTE 3: STARBUCKS (PREMIUM/SLOWER)
  // ========================================
  console.log('\n☕ Criando Starbucks...');
  const starbucks = await prisma.restaurante.create({
    data: {
      nome: 'Starbucks RioMar',
      slug: 'starbucks-riomar',
      cidade: 'Recife',
      estado: 'PE',
      whatsappAtivado: true,
      smsAtivado: true,
      emailAtivado: true,
    },
  });

  // Usuários Starbucks
  const senhaAdminSb = await bcrypt.hash('admin123', 10);
  await prisma.usuario.create({
    data: {
      nome: 'Admin Starbucks',
      email: 'admin@starbucks.com',
      senha: senhaAdminSb,
      papel: PapelUsuario.ADMIN,
      restauranteId: starbucks.id,
    },
  });

  const senhaOperadorSb = await bcrypt.hash('operador123', 10);
  await prisma.usuario.create({
    data: {
      nome: 'Operador Starbucks',
      email: 'operador@starbucks.com',
      senha: senhaOperadorSb,
      papel: PapelUsuario.OPERADOR,
      restauranteId: starbucks.id,
    },
  });

  // Fila Starbucks
  const filaSb = await prisma.fila.create({
    data: {
      nome: 'Fila Principal',
      slug: 'principal',
      restauranteId: starbucks.id,
      fastLaneAtivado: true,
      fastLanePreco: 10.0,
      maxSimultaneos: 30,
      maxEntradasPorHora: 20,
    },
  });

  // Clientes Starbucks
  const clientesSb = await Promise.all([
    prisma.cliente.create({
      data: {
        restauranteId: starbucks.id,
        nomeCompleto: 'Fernanda Alves',
        telefone: '+5581999998888',
        email: 'fernanda.alves@email.com',
        cidade: 'Recife',
        estado: 'PE',
        senhaHash: await bcrypt.hash('cliente123', 10),
        totalVisitas: 25,
        totalVip: 5,
        isVip: true,
      },
    }),
    prisma.cliente.create({
      data: {
        restauranteId: starbucks.id,
        nomeCompleto: 'Gabriel Souza',
        telefone: '+5581999998889',
        email: 'gabriel.souza@email.com',
        cidade: 'Recife',
        estado: 'PE',
        senhaHash: await bcrypt.hash('cliente123', 10),
        totalVisitas: 15,
        totalFastLane: 3,
      },
    }),
    prisma.cliente.create({
      data: {
        restauranteId: starbucks.id,
        nomeCompleto: 'Helena Martins',
        telefone: '+5581999998890',
        email: 'helena.martins@email.com',
        cidade: 'Recife',
        estado: 'PE',
        senhaHash: await bcrypt.hash('cliente123', 10),
        totalVisitas: 6,
      },
    }),
    prisma.cliente.create({
      data: {
        restauranteId: starbucks.id,
        nomeCompleto: 'Igor Ferreira',
        telefone: '+5581999998891',
        email: 'igor.ferreira@email.com',
        cidade: 'Recife',
        estado: 'PE',
        senhaHash: await bcrypt.hash('cliente123', 10),
        totalVisitas: 10,
        totalFastLane: 2,
      },
    }),
    prisma.cliente.create({
      data: {
        restauranteId: starbucks.id,
        nomeCompleto: 'Julia Cardoso',
        telefone: '+5581999998892',
        email: 'julia.cardoso@email.com',
        cidade: 'Recife',
        estado: 'PE',
        senhaHash: await bcrypt.hash('cliente123', 10),
        totalVisitas: 3,
      },
    }),
  ]);

  ticketCounter = 1;

  // AGUARDANDO - Todos os 5 clientes cadastrados têm ticket ativo
  for (let i = 0; i < 5; i++) {
    const entradaEm = getRandomPastTimestamp(1.8);
    await createTicketWithEvents({
      restauranteId: starbucks.id,
      filaId: filaSb.id,
      status: StatusTicket.AGUARDANDO,
      prioridade: i === 0 ? PrioridadeTicket.VIP : (i < 3 ? PrioridadeTicket.FAST_LANE : PrioridadeTicket.NORMAL),
      numeroTicket: String(ticketCounter++).padStart(3, '0'),
      nomeCliente: clientesSb[i].nomeCompleto,
      telefoneCliente: clientesSb[i].telefone,
      emailCliente: clientesSb[i].email,
      clienteId: clientesSb[i].id, // TODOS os clientes têm ticket ativo (incluindo Fernanda!)
      tipoEntrada: TipoEntrada.REMOTO,
      entradaEm: entradaEm,
      valorPrioridade: i === 0 ? 28.0 : (i < 3 ? 10.0 : 0),
      quantidadePessoas: i === 0 ? 2 : (i === 1 ? 3 : (i === 2 ? 1 : (i === 3 ? 5 : 4))), // 2, 3, 1, 5, 4 pessoas
    }, starbucks.id);
  }

  // HISTÓRICO - Tickets finalizados antigos (Starbucks)
  // Fernanda Alves VIP (clientesSb[0]) - Histórico MUITO robusto (10 tickets finalizados)
  for (let i = 0; i < 10; i++) {
    const entradaEm = new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000); // 1-10 dias atrás
    const finalizadoEm = new Date(entradaEm.getTime() + (25 + i * 5) * 60 * 1000);
    await createTicketWithEvents({
      restauranteId: starbucks.id,
      filaId: filaSb.id,
      status: StatusTicket.FINALIZADO,
      prioridade: i === 0 ? PrioridadeTicket.VIP : (i < 5 ? PrioridadeTicket.FAST_LANE : PrioridadeTicket.NORMAL),
      numeroTicket: String(ticketCounter++).padStart(3, '0'),
      nomeCliente: clientesSb[0].nomeCompleto,
      telefoneCliente: clientesSb[0].telefone,
      emailCliente: clientesSb[0].email,
      clienteId: clientesSb[0].id, // Fernanda (VIP) tem histórico muito robusto
      tipoEntrada: i % 2 === 0 ? TipoEntrada.REMOTO : TipoEntrada.LOCAL,
      entradaEm: entradaEm,
      finalizadoEm: finalizadoEm,
      valorPrioridade: i === 0 ? 28.0 : (i < 5 ? 10.0 : 0),
      quantidadePessoas: (i % 3) + 1, // 1, 2, 3, 1, 2, 3... pessoas
    }, starbucks.id);
  }

  // Gabriel Souza (clientesSb[1]) - Histórico moderado (4 finalizados)
  for (let i = 0; i < 4; i++) {
    const entradaEm = new Date(Date.now() - (i + 11) * 24 * 60 * 60 * 1000); // 11-14 dias atrás
    const finalizadoEm = new Date(entradaEm.getTime() + 30 * 60 * 1000);
    await createTicketWithEvents({
      restauranteId: starbucks.id,
      filaId: filaSb.id,
      status: StatusTicket.FINALIZADO,
      prioridade: i < 2 ? PrioridadeTicket.FAST_LANE : PrioridadeTicket.NORMAL,
      numeroTicket: String(ticketCounter++).padStart(3, '0'),
      nomeCliente: clientesSb[1].nomeCompleto,
      telefoneCliente: clientesSb[1].telefone,
      emailCliente: clientesSb[1].email,
      clienteId: clientesSb[1].id,
      tipoEntrada: TipoEntrada.LOCAL,
      entradaEm: entradaEm,
      finalizadoEm: finalizadoEm,
      valorPrioridade: i < 2 ? 10.0 : 0,
      quantidadePessoas: i + 1, // 1, 2, 3, 4 pessoas
    }, starbucks.id);
  }

  // Helena Martins (clientesSb[2]) - 2 tickets cancelados no passado
  for (let i = 0; i < 2; i++) {
    const entradaEm = new Date(Date.now() - (i + 15) * 24 * 60 * 60 * 1000); // 15-16 dias atrás
    const canceladoEm = new Date(entradaEm.getTime() + 15 * 60 * 1000);
    await createTicketWithEvents({
      restauranteId: starbucks.id,
      filaId: filaSb.id,
      status: StatusTicket.CANCELADO,
      prioridade: PrioridadeTicket.NORMAL,
      numeroTicket: String(ticketCounter++).padStart(3, '0'),
      nomeCliente: clientesSb[2].nomeCompleto,
      telefoneCliente: clientesSb[2].telefone,
      emailCliente: clientesSb[2].email,
      clienteId: clientesSb[2].id,
      tipoEntrada: TipoEntrada.REMOTO,
      entradaEm: entradaEm,
      canceladoEm: canceladoEm,
      quantidadePessoas: i + 1, // 1, 2 pessoas
    }, starbucks.id);
  }

  console.log(`✅ Starbucks criado com ${ticketCounter - 1} tickets (incluindo histórico)`);

  // ========================================
  // RESUMO FINAL
  // ========================================
  console.log('\n📊 Resumo do Seed:');
  console.log('==========================================');
  console.log(`🏢 Restaurantes criados: 3`);
  console.log(`   1. McDonald's (Fast Food) - 35 max simultâneos, 70/hora`);
  console.log(`   2. Pizza Hut (Casual) - 40 max simultâneos, 35/hora`);
  console.log(`   3. Starbucks (Premium) - 30 max simultâneos, 20/hora`);
  console.log(`\n👥 Total de usuários: 6 (2 por restaurante)`);
  console.log(`👨‍👩‍👧‍👦 Total de clientes: 12`);
  console.log(`🎫 Total de filas: 3`);
  
  const totalTickets = await prisma.ticket.count();
  const totalEventos = await prisma.eventoTicket.count();
  console.log(`🎟️  Total de tickets: ${totalTickets}`);
  console.log(`📝 Total de eventos: ${totalEventos}`);
  
  console.log('\n✅ Seed de demonstração concluído com sucesso!');
  console.log('==========================================\n');
}

main()
  .catch((e) => {
    console.error('❌ Erro ao executar seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
