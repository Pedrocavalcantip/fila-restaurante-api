import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Fila Restaurante API - MVP',
      version: '1.0.0',
      description: `
## Sistema de Gerenciamento de Filas para Restaurantes

API completa para gerenciamento de filas virtuais e presenciais, com autenticação JWT, WebSocket em tempo real, e arquitetura multi-tenant.

###  Arquitetura Não-Trivial

- **Multi-Tenant**: Isolamento total por restaurante
- **Dual-Mode**: Tickets presenciais (operador) + remotos (cliente)
- **Real-Time**: WebSocket para atualizações instantâneas
- **Priorização Inteligente**: NORMAL, FAST_LANE, VIP com cálculo dinâmico
- **Estatísticas**: Tracking automático de visitas, no-shows, VIP
- **Segurança**: bcrypt, JWT, rate limiting, validação Zod

###  Cobertura de Testes

- **178 testes** passando em ~18 segundos
- Performance otimizada com Docker PostgreSQL (28x mais rápido)
- Testes E2E, integração, segurança, e WebSocket

###  Links Úteis

- **Repositório**: [GitHub](https://github.com/Pedrocavalcantip/fila-restaurante-api)
- **Documentação Markdown**: [API_DOCUMENTATION.md](../API_DOCUMENTATION.md)
      `,
      contact: {
        name: 'Pedro Cavalcanti',
        url: 'https://github.com/Pedrocavalcantip/fila-restaurante-api',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Servidor de Desenvolvimento',
      },
    ],
    tags: [
      {
        name: 'Autenticação Operador',
        description: 'Login e autenticação de operadores e administradores',
      },
      {
        name: 'Autenticação Cliente',
        description: 'Cadastro, login e perfil de clientes',
      },
      {
        name: 'Onboarding Restaurante',
        description: 'Cadastro público de novos restaurantes (cria Admin, Fila, Templates)',
      },
      {
        name: 'Tickets Locais (Operador)',
        description: 'Gerenciamento de tickets presenciais pelo operador',
      },
      {
        name: 'Tickets Remotos (Cliente)',
        description: 'Cliente entra na fila remotamente e gerencia seus tickets',
      },
      {
        name: 'Busca de Restaurantes',
        description: 'Cliente busca restaurantes próximos',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Token JWT obtido no login (operador ou cliente)',
        },
      },
      schemas: {
        Usuario: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            nome: { type: 'string' },
            email: { type: 'string', format: 'email' },
            role: { type: 'string', enum: ['ADMIN', 'OPERADOR'] },
            restauranteId: { type: 'string', format: 'uuid' },
          },
        },
        Cliente: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            nome: { type: 'string' },
            email: { type: 'string', format: 'email' },
            telefone: { type: 'string' },
            cpf: { type: 'string' },
            cidade: { type: 'string' },
            estado: { type: 'string' },
            isVip: { type: 'boolean' },
            vipDesde: { type: 'string', format: 'date-time', nullable: true },
            totalVisitas: { type: 'integer' },
            totalFastLane: { type: 'integer' },
            totalVip: { type: 'integer' },
            totalNoShows: { type: 'integer' },
            status: { type: 'string', enum: ['ATIVO', 'BLOQUEADO'] },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Restaurante: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            nome: { type: 'string' },
            slug: { type: 'string' },
            telefone: { type: 'string' },
            email: { type: 'string', format: 'email' },
            cidade: { type: 'string' },
            estado: { type: 'string' },
            precoFastLane: { type: 'number', format: 'float' },
            precoVip: { type: 'number', format: 'float' },
            maxReentradasPorDia: { type: 'integer' },
            tempoMedioAtendimento: { type: 'integer' },
            status: { type: 'string', enum: ['ATIVO', 'INATIVO'] },
          },
        },
        Ticket: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            numero: { type: 'string', example: 'A-023' },
            nomeCliente: { type: 'string' },
            telefone: { type: 'string' },
            quantidadePessoas: { type: 'integer' },
            prioridade: { type: 'string', enum: ['NORMAL', 'FAST_LANE', 'VIP'] },
            status: {
              type: 'string',
              enum: ['AGUARDANDO', 'CHAMADO', 'ATENDIDO', 'FINALIZADO', 'CANCELADO_CLIENTE', 'CANCELADO_OPERADOR', 'NO_SHOW'],
            },
            posicao: { type: 'integer' },
            tempoEstimadoMinutos: { type: 'integer' },
            valorPrioridade: { type: 'number', format: 'float' },
            chamadasCount: { type: 'integer' },
            filaId: { type: 'string', format: 'uuid' },
            clienteId: { type: 'string', format: 'uuid', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            erro: { type: 'string' },
            detalhes: { type: 'string' },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
