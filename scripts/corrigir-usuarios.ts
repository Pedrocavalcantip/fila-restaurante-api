import prisma from '../src/config/database';

/**
 * Script para corrigir usuários sem restauranteId
 * Vincula ADMIN ao restaurante correto
 */
async function corrigirUsuariosSemRestaurante() {
  console.log('🔧 Iniciando correção de usuários sem restaurante...\n');

  // Buscar primeiro restaurante
  const primeiroRestaurante = await prisma.restaurante.findFirst({
    select: {
      id: true,
      nome: true,
      slug: true,
    },
  });

  if (!primeiroRestaurante) {
    console.error('❌ Nenhum restaurante encontrado no banco!');
    return;
  }

  console.log(`🏪 Restaurante encontrado: ${primeiroRestaurante.nome} (${primeiroRestaurante.slug})\n`);

  // Atualizar usando SQL raw (PascalCase do Prisma)
  const resultado = await prisma.$executeRaw`
    UPDATE usuarios 
    SET "restauranteId" = ${primeiroRestaurante.id}
    WHERE "restauranteId" IS NULL
  `;

  console.log(`✅ ${resultado} usuário(s) vinculado(s) ao restaurante ${primeiroRestaurante.nome}!\n`);
  console.log('🎯 Faça login novamente para obter um novo token JWT.\n');
}

corrigirUsuariosSemRestaurante()
  .then(() => {
    console.log('✅ Script finalizado com sucesso!');
    process.exit(0);
  })
  .catch((erro) => {
    console.error('❌ Erro ao executar script:', erro);
    process.exit(1);
  });
