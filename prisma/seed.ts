import { PrismaClient, PapelUsuario } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando o seed...');

  // Limpar dados existentes
  await prisma.eventoTicket.deleteMany();
  await prisma.notificacao.deleteMany();
  await prisma.pagamento.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.fila.deleteMany();
  await prisma.usuario.deleteMany();
  await prisma.restaurante.deleteMany();

  // 1. Criar o Restaurante
  const restaurante = await prisma.restaurante.create({
    data: {
      nome: 'Burger Queen - Centro',
      slug: 'burger-queen-centro',
      cidade: 'Recife',
      estado: 'PE',
      whatsappAtivado: true, 
    },
  });
  console.log(`Restaurante criado: ${restaurante.nome} (ID: ${restaurante.id})`);

  // 2. Criar Usuários 
  const senhaAdmin = await bcrypt.hash('admin123', 10);
  const admin = await prisma.usuario.create({
    data: {
      nome: 'Gerente Admin',
      email: 'admin@burgerqueen.com',
      senha: senhaAdmin,
      papel: PapelUsuario.ADMIN,
      restauranteId: restaurante.id,
    },
  });
  console.log(`Usuário Admin criado: ${admin.email}`);

  const senhaOperador = await bcrypt.hash('operador123', 10);
  const operador = await prisma.usuario.create({
    data: {
      nome: 'Recepcionista João',
      email: 'joao@burgerqueen.com',
      senha: senhaOperador,
      papel: PapelUsuario.OPERADOR,
      restauranteId: restaurante.id,
    },
  });
  console.log(`Usuário Operador criado: ${operador.email}`);

  // 3. Criar a Fila
  const filaPrincipal = await prisma.fila.create({
    data: {
      nome: 'Fila Principal',
      slug: 'principal',
      restauranteId: restaurante.id,
      fastLaneAtivado: true, 
      fastLanePreco: 5.0,
    },
  });
  console.log(`Fila criada: ${filaPrincipal.nome}`);

  console.log('Seed concluído com sucesso!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });