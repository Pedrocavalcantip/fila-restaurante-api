import request from 'supertest';
import app from '../src/app';
import prisma from '../src/config/database';

describe('Sprint 2 - Onboarding de Restaurantes (Tópico 3)', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    // Limpar dados de teste após cada teste
    // Ordem correta: templates → filas → usuarios → restaurantes
    const restauranteIds = (await prisma.restaurante.findMany({
      where: { slug: { startsWith: 'test-onboarding-' } },
      select: { id: true }
    })).map(r => r.id);

    if (restauranteIds.length > 0) {
      await prisma.templatesMensagem.deleteMany({
        where: { restauranteId: { in: restauranteIds } }
      });

      await prisma.fila.deleteMany({
        where: { restauranteId: { in: restauranteIds } }
      });

      await prisma.usuario.deleteMany({
        where: { restauranteId: { in: restauranteIds } }
      });

      await prisma.restaurante.deleteMany({
        where: { id: { in: restauranteIds } }
      });
    }
  });

  describe('1. Cadastro Público de Restaurante', () => {
    it('deve cadastrar novo restaurante com sucesso', async () => {
      const timestamp = Date.now();
      const response = await request(app)
        .post('/api/v1/restaurantes/cadastro')
        .send({
          nome: 'Restaurante Test Onboarding 1',
          slug: `test-onboarding-rest-1-${timestamp}`,
          cidade: 'São Paulo',
          estado: 'SP',
          emailAdmin: `admin-test-1-${timestamp}@teste.com`,
          senhaAdmin: 'senhaSegura123',
          precoFastLane: 15.00,
          precoVip: 25.00,
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('mensagem', 'Restaurante cadastrado com sucesso');
      expect(response.body).toHaveProperty('restaurante');
      expect(response.body).toHaveProperty('admin');
      expect(response.body).toHaveProperty('linkAcesso');
      
      expect(response.body.restaurante.nome).toBe('Restaurante Test Onboarding 1');
      expect(response.body.restaurante.slug).toBe(`test-onboarding-rest-1-${timestamp}`);
      expect(response.body.admin.email).toBe(`admin-test-1-${timestamp}@teste.com`);
    });

    it('deve criar restaurante com valores padrão para preços', async () => {
      const response = await request(app)
        .post('/api/v1/restaurantes/cadastro')
        .send({
          nome: 'Restaurante Test Onboarding 2',
          slug: 'test-onboarding-rest-2',
          emailAdmin: 'admin-test-2@teste.com',
          senhaAdmin: 'senhaSegura123',
        });

      expect(response.status).toBe(201);
      expect(Number(response.body.restaurante.precoFastLane)).toBeCloseTo(17.00);
      expect(Number(response.body.restaurante.precoVip)).toBeCloseTo(28.00);
    });

    it('deve normalizar slug para lowercase', async () => {
      const response = await request(app)
        .post('/api/v1/restaurantes/cadastro')
        .send({
          nome: 'Restaurante Test Onboarding 3',
          slug: 'Test-Onboarding-REST-3',
          emailAdmin: 'admin-test-3@teste.com',
          senhaAdmin: 'senhaSegura123',
        });

      expect(response.status).toBe(201);
      expect(response.body.restaurante.slug).toBe('test-onboarding-rest-3');
    });

    it('deve normalizar email admin para lowercase', async () => {
      const response = await request(app)
        .post('/api/v1/restaurantes/cadastro')
        .send({
          nome: 'Restaurante Test Onboarding 4',
          slug: 'test-onboarding-rest-4',
          emailAdmin: 'Admin-Test-4@TESTE.COM',
          senhaAdmin: 'senhaSegura123',
        });

      expect(response.status).toBe(201);
      expect(response.body.admin.email).toBe('admin-test-4@teste.com');
    });

    it('deve retornar link de acesso ao sistema', async () => {
      const response = await request(app)
        .post('/api/v1/restaurantes/cadastro')
        .send({
          nome: 'Restaurante Test Onboarding 5',
          slug: 'test-onboarding-rest-5',
          emailAdmin: 'admin-test-5@teste.com',
          senhaAdmin: 'senhaSegura123',
        });

      expect(response.status).toBe(201);
      expect(response.body.linkAcesso).toContain('test-onboarding-rest-5');
    });
  });

  describe('2. Criação Automática de Entidades', () => {
    it('deve criar usuário ADMIN automaticamente', async () => {
      const response = await request(app)
        .post('/api/v1/restaurantes/cadastro')
        .send({
          nome: 'Restaurante Test Onboarding 6',
          slug: 'test-onboarding-rest-6',
          emailAdmin: 'admin-test-6@teste.com',
          senhaAdmin: 'senhaSegura123',
        });

      expect(response.status).toBe(201);

      // Verificar usuário no banco
      const usuario = await prisma.usuario.findUnique({
        where: { email: 'admin-test-6@teste.com' },
      });

      expect(usuario).not.toBeNull();
      expect(usuario?.papel).toBe('ADMIN');
      expect(usuario?.nome).toBe('Administrador');
      expect(usuario?.restauranteId).toBe(response.body.restaurante.id);
    });

    it('deve criar fila padrão automaticamente', async () => {
      const response = await request(app)
        .post('/api/v1/restaurantes/cadastro')
        .send({
          nome: 'Restaurante Test Onboarding 7',
          slug: 'test-onboarding-rest-7',
          emailAdmin: 'admin-test-7@teste.com',
          senhaAdmin: 'senhaSegura123',
        });

      expect(response.status).toBe(201);

      // Verificar fila no banco
      const fila = await prisma.fila.findFirst({
        where: {
          restauranteId: response.body.restaurante.id,
          slug: 'principal',
        },
      });

      expect(fila).not.toBeNull();
      expect(fila?.nome).toBe('Principal');
      expect(fila?.descricao).toBe('Fila padrão do restaurante');
      expect(fila?.status).toBe('ATIVA');
    });

    it('deve criar templates de mensagem padrão', async () => {
      const response = await request(app)
        .post('/api/v1/restaurantes/cadastro')
        .send({
          nome: 'Restaurante Test Onboarding 8',
          slug: 'test-onboarding-rest-8',
          emailAdmin: 'admin-test-8@teste.com',
          senhaAdmin: 'senhaSegura123',
        });

      expect(response.status).toBe(201);

      // Verificar templates no banco
      const templates = await prisma.templatesMensagem.findMany({
        where: { restauranteId: response.body.restaurante.id },
      });

      expect(templates.length).toBeGreaterThanOrEqual(2);
      
      const boasVindas = templates.find(t => t.chave === 'cliente.boas_vindas');
      expect(boasVindas).not.toBeNull();
      expect(boasVindas?.assunto).toContain('Bem-vindo');

      const chamado = templates.find(t => t.chave === 'ticket.chamado');
      expect(chamado).not.toBeNull();
      expect(chamado?.assunto).toContain('Sua vez chegou');
    });

    it('deve criar senha com hash bcrypt', async () => {
      const response = await request(app)
        .post('/api/v1/restaurantes/cadastro')
        .send({
          nome: 'Restaurante Test Onboarding 9',
          slug: 'test-onboarding-rest-9',
          emailAdmin: 'admin-test-9@teste.com',
          senhaAdmin: 'senhaSegura123',
        });

      expect(response.status).toBe(201);

      // Verificar hash da senha
      const usuario = await prisma.usuario.findUnique({
        where: { email: 'admin-test-9@teste.com' },
      });

      expect(usuario?.senha).not.toBe('senhaSegura123'); // Não deve ser texto plano
      expect(usuario?.senha).toMatch(/^\$2[aby]\$.{56}$/); // Formato bcrypt
    });
  });

  describe('3. Validações de Entrada', () => {
    it('deve rejeitar slug duplicado', async () => {
      // Primeiro cadastro
      await request(app)
        .post('/api/v1/restaurantes/cadastro')
        .send({
          nome: 'Restaurante Test Onboarding 10',
          slug: 'test-onboarding-duplicado',
          emailAdmin: 'admin-test-10@teste.com',
          senhaAdmin: 'senhaSegura123',
        });

      // Segundo cadastro com mesmo slug
      const response = await request(app)
        .post('/api/v1/restaurantes/cadastro')
        .send({
          nome: 'Restaurante Test Onboarding 11',
          slug: 'test-onboarding-duplicado',
          emailAdmin: 'admin-test-11@teste.com',
          senhaAdmin: 'senhaSegura123',
        });

      expect(response.status).toBe(409);
      expect(response.body.erro).toContain('Slug já está em uso');
    });

    it('deve rejeitar email admin duplicado', async () => {
      // Primeiro cadastro
      await request(app)
        .post('/api/v1/restaurantes/cadastro')
        .send({
          nome: 'Restaurante Test Onboarding 12',
          slug: 'test-onboarding-rest-12',
          emailAdmin: 'admin-duplicado@teste.com',
          senhaAdmin: 'senhaSegura123',
        });

      // Segundo cadastro com mesmo email
      const response = await request(app)
        .post('/api/v1/restaurantes/cadastro')
        .send({
          nome: 'Restaurante Test Onboarding 13',
          slug: 'test-onboarding-rest-13',
          emailAdmin: 'admin-duplicado@teste.com',
          senhaAdmin: 'senhaSegura123',
        });

      expect(response.status).toBe(409);
      expect(response.body.erro).toContain('Email já está cadastrado');
    });

    it('deve validar campos obrigatórios (Zod)', async () => {
      const response = await request(app)
        .post('/api/v1/restaurantes/cadastro')
        .send({
          nome: 'Restaurante Teste',
          // Faltando: slug, emailAdmin, senhaAdmin
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('erro');
    });

    it('deve validar formato de email', async () => {
      const response = await request(app)
        .post('/api/v1/restaurantes/cadastro')
        .send({
          nome: 'Restaurante Test Onboarding 14',
          slug: 'test-onboarding-rest-14',
          emailAdmin: 'email-invalido',
          senhaAdmin: 'senhaSegura123',
        });

      expect(response.status).toBe(400);
    });

    it('deve validar tamanho mínimo de senha', async () => {
      const response = await request(app)
        .post('/api/v1/restaurantes/cadastro')
        .send({
          nome: 'Restaurante Test Onboarding 15',
          slug: 'test-onboarding-rest-15',
          emailAdmin: 'admin-test-15@teste.com',
          senhaAdmin: '123', // Muito curta
        });

      expect(response.status).toBe(400);
    });

    it('deve validar formato de slug (sem espaços/caracteres especiais)', async () => {
      const response = await request(app)
        .post('/api/v1/restaurantes/cadastro')
        .send({
          nome: 'Restaurante Test Onboarding 16',
          slug: 'slug com espaços',
          emailAdmin: 'admin-test-16@teste.com',
          senhaAdmin: 'senhaSegura123',
        });

      expect(response.status).toBe(400);
    });
  });

  describe('4. Transação Atômica', () => {
    it('deve fazer rollback se criação de admin falhar', async () => {
      // Este teste valida que a transação funciona corretamente
      // Se houver erro em qualquer etapa, nada é salvo
      
      // Criar restaurante temporário para simular usuário existente
      const tempRestaurante = await prisma.restaurante.create({
        data: {
          nome: 'Restaurante Temp',
          slug: 'test-temp-resto',
          precoFastLane: 17.00,
          precoVip: 28.00,
        },
      });

      // Criar usuário com email que será duplicado
      await prisma.usuario.create({
        data: {
          nome: 'Usuário Existente',
          email: 'admin-existente@teste.com',
          senha: 'hash123',
          papel: 'OPERADOR',
          restauranteId: tempRestaurante.id,
        },
      });

      const response = await request(app)
        .post('/api/v1/restaurantes/cadastro')
        .send({
          nome: 'Restaurante Test Onboarding 17',
          slug: 'test-onboarding-rest-17',
          emailAdmin: 'admin-existente@teste.com',
          senhaAdmin: 'senhaSegura123',
        });

      expect(response.status).toBe(409);

      // Verificar que restaurante NÃO foi criado (rollback)
      const restaurante = await prisma.restaurante.findUnique({
        where: { slug: 'test-onboarding-rest-17' },
      });

      expect(restaurante).toBeNull();

      // Limpar
      await prisma.usuario.deleteMany({
        where: { restauranteId: tempRestaurante.id },
      });
      await prisma.restaurante.delete({
        where: { id: tempRestaurante.id },
      });
    });

    it('deve criar todas as entidades ou nenhuma (atomicidade)', async () => {
      const response = await request(app)
        .post('/api/v1/restaurantes/cadastro')
        .send({
          nome: 'Restaurante Test Onboarding 18',
          slug: 'test-onboarding-rest-18',
          emailAdmin: 'admin-test-18@teste.com',
          senhaAdmin: 'senhaSegura123',
        });

      expect(response.status).toBe(201);

      const restauranteId = response.body.restaurante.id;

      // Verificar todas as entidades criadas
      const [restaurante, admin, fila, templates] = await Promise.all([
        prisma.restaurante.findUnique({ where: { id: restauranteId } }),
        prisma.usuario.findFirst({ where: { restauranteId } }),
        prisma.fila.findFirst({ where: { restauranteId } }),
        prisma.templatesMensagem.findMany({ where: { restauranteId } }),
      ]);

      expect(restaurante).not.toBeNull();
      expect(admin).not.toBeNull();
      expect(fila).not.toBeNull();
      expect(templates.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('5. Resposta Completa', () => {
    it('deve retornar dados do restaurante criado', async () => {
      const response = await request(app)
        .post('/api/v1/restaurantes/cadastro')
        .send({
          nome: 'Restaurante Test Onboarding 19',
          slug: 'test-onboarding-rest-19',
          cidade: 'Rio de Janeiro',
          estado: 'RJ',
          emailAdmin: 'admin-test-19@teste.com',
          senhaAdmin: 'senhaSegura123',
        });

      expect(response.status).toBe(201);
      expect(response.body.restaurante).toMatchObject({
        nome: 'Restaurante Test Onboarding 19',
        slug: 'test-onboarding-rest-19',
        cidade: 'Rio de Janeiro',
        estado: 'RJ',
      });
      expect(response.body.restaurante).toHaveProperty('id');
      expect(response.body.restaurante).toHaveProperty('criadoEm');
    });

    it('deve retornar dados do admin criado (sem senha)', async () => {
      const response = await request(app)
        .post('/api/v1/restaurantes/cadastro')
        .send({
          nome: 'Restaurante Test Onboarding 20',
          slug: 'test-onboarding-rest-20',
          emailAdmin: 'admin-test-20@teste.com',
          senhaAdmin: 'senhaSegura123',
        });

      expect(response.status).toBe(201);
      expect(response.body.admin).toHaveProperty('id');
      expect(response.body.admin).toHaveProperty('nome', 'Administrador');
      expect(response.body.admin).toHaveProperty('email', 'admin-test-20@teste.com');
      expect(response.body.admin).not.toHaveProperty('senha'); // Senha não deve ser retornada
    });
  });
});
