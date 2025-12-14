<div align="center">

# Fila Restaurante API

### Sistema de gerenciamento de filas virtuais para restaurantes

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://github.com/Pedrocavalcantip/fila-restaurante-api)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)

[Documentação](#getting-started) • [Features](#key-features) • [Tech Stack](#tech-stack) • [Roadmap](#roadmap)

</div>

---

## Sobre o Projeto

O **Fila Restaurante API** é uma solução de gerenciamento de filas virtuais para restaurantes, eliminando a necessidade de espera física e melhorando a experiência tanto para clientes quanto para estabelecimentos.

Restaurantes frequentemente perdem clientes devido a longas filas e falta de controle sobre o fluxo de entrada. Este sistema resolve esse problema através de filas digitais com notificações em tempo real, gestão de capacidade, sistema de Fast Lane/VIP e analytics para otimização operacional.

---

## Funcionalidades Principais

### Para Restaurantes
- **Gestão de Múltiplas Filas** - Organize diferentes tipos de atendimento (mesas, delivery, eventos)
- **Dashboard Analítico** - Métricas em tempo real sobre fluxo de clientes, taxa de no-show e eficiência
- **Fast Lane & VIP** - Sistema de filas prioritárias com precificação dinâmica
- **Sistema de Notificações Multi-canal** - Email, SMS, WhatsApp e Push notifications
- **Controle Anti-abuse** - Limite de reentradas, penalidades por no-show e blacklist automático
- **WebSockets em Tempo Real** - Atualizações instantâneas de posição na fila

### Para Clientes
- **Entrada Remota na Fila** - Entre na fila de qualquer lugar via app ou web
- **Tempo de Espera em Tempo Real** - Acompanhamento preciso do tempo de espera
- **Notificações Inteligentes** - Alertas quando sua vez estiver próxima
- **Fast Lane/VIP** - Opção de fila prioritária mediante pagamento
- **Histórico de Visitas** - Acompanhe suas visitas e ganhe benefícios VIP

### Para Desenvolvedores
- **API RESTful Completa** - Documentação Swagger/OpenAPI integrada
- **Autenticação JWT** - Sistema dual (restaurantes + clientes)
- **Cobertura de Testes** - Testes E2E, integração e unitários com Jest
- **Docker Ready** - Containerização completa para deploy
- **CI/CD Ready** - Preparado para Railway, Vercel ou AWS

---

## Tech Stack

### **Backend & Core**
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socketdotio&logoColor=white)

### **Database & ORM**
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white)

### **Authentication & Security**
![JWT](https://img.shields.io/badge/JWT-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white)
![bcrypt](https://img.shields.io/badge/bcrypt-338033?style=for-the-badge)
![Helmet](https://img.shields.io/badge/Helmet-663399?style=for-the-badge)

### **Cloud & Infrastructure**
![Cloudinary](https://img.shields.io/badge/Cloudinary-3448C5?style=for-the-badge&logo=cloudinary&logoColor=white)
![SendGrid](https://img.shields.io/badge/SendGrid-3395FF?style=for-the-badge)
![Railway](https://img.shields.io/badge/Railway-0B0D0E?style=for-the-badge&logo=railway&logoColor=white)

### **DevOps & Testing**
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![Jest](https://img.shields.io/badge/Jest-C21325?style=for-the-badge&logo=jest&logoColor=white)
![ESLint](https://img.shields.io/badge/ESLint-4B32C3?style=for-the-badge&logo=eslint&logoColor=white)

| Categoria | Tecnologias |
|-----------|-------------|
| **Runtime** | Node.js 20+, TypeScript 5.9 |
| **Framework** | Express 5.1, Socket.io 4.8 |
| **Database** | PostgreSQL (Prisma ORM) |
| **Validation** | Zod 4.1, Custom Middlewares |
| **Logging** | Pino (Pretty mode em dev) |
| **File Upload** | Multer + Cloudinary |
| **Email/SMS** | SendGrid API |
| **Testing** | Jest + Supertest + Socket.io Client |
| **API Docs** | Swagger UI + JSDoc |

---

## Getting Started

### Prerequisites

Certifique-se de ter instalado:

- **Node.js** 20.x ou superior ([Download](https://nodejs.org/))
- **PostgreSQL** 14+ ([Download](https://www.postgresql.org/download/))
- **Git** ([Download](https://git-scm.com/))
- **npm** ou **yarn** (vem com o Node.js)

### Installation

**1. Clone o repositório**

```bash
git clone https://github.com/Pedrocavalcantip/fila-restaurante-api.git
cd fila-restaurante-api
```

**2. Instale as dependências**

```bash
npm install
```

**3. Configure as variáveis de ambiente**

Crie um arquivo `.env` na raiz do projeto:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/fila_restaurante?schema=public"
DIRECT_URL="postgresql://user:password@localhost:5432/fila_restaurante"

# JWT
JWT_SECRET="seu-secret-super-seguro-aqui"
JWT_EXPIRES_IN="7d"

# Cloudinary (Upload de Imagens)
CLOUDINARY_CLOUD_NAME="seu-cloud-name"
CLOUDINARY_API_KEY="sua-api-key"
CLOUDINARY_API_SECRET="seu-api-secret"

# SendGrid (Email)
SENDGRID_API_KEY="sua-sendgrid-key"
SENDGRID_FROM_EMAIL="noreply@seudominio.com"

# Server
PORT=3000
NODE_ENV=development
```

**4. Configure o banco de dados**

```bash
# Gerar cliente Prisma
npm run prisma:generate

# Executar migrations
npm run prisma:migrate

# (Opcional) Popular com dados de demonstração
npx prisma db seed
```

**5. Inicie o servidor de desenvolvimento**

```bash
npm run dev
```

O servidor estará rodando em `http://localhost:3000`

### Rodando com Docker (Alternativa)

```bash
# Build e start dos containers
docker-compose up -d

# Verificar logs
docker-compose logs -f

# Parar containers
docker-compose down
```

### Acessando a Documentação da API

Após iniciar o servidor, acesse:

**Swagger UI:** `http://localhost:3000/api-docs`

---

## Estrutura do Projeto

```
fila-restaurante-api/
│
├── src/
│   ├── app.ts                    # Configuração do Express
│   ├── server.ts                 # Entry point da aplicação
│   │
│   ├── config/                   # Configurações globais
│   │   ├── database.ts          # Conexão Prisma
│   │   ├── cloudinary.ts        # Upload de imagens
│   │   ├── logger.ts            # Pino logger
│   │   └── swagger.ts           # Documentação API
│   │
│   ├── controllers/              # Controladores (lógica de rotas)
│   │   ├── authControllers.ts
│   │   ├── authClienteController.ts
│   │   ├── ticketControllers.ts
│   │   ├── restauranteController.ts
│   │   └── clienteController.ts
│   │
│   ├── services/                 # Lógica de negócio
│   │   ├── authService.ts
│   │   ├── ticketservice.ts
│   │   ├── notificacaoService.ts
│   │   ├── socketService.ts     # WebSocket handlers
│   │   └── uploadService.ts
│   │
│   ├── middlewares/              # Middlewares customizados
│   │   ├── authMiddleware.ts    # JWT validation
│   │   ├── autenticarCliente.ts
│   │   ├── rateLimiter.ts       # Rate limiting
│   │   ├── erroMiddleware.ts    # Error handling
│   │   └── uploadMiddleware.ts
│   │
│   ├── routes/                   # Definição de rotas
│   │   ├── authRoutes.ts
│   │   ├── ticketRoutes.ts
│   │   ├── restauranteRoutes.ts
│   │   └── clienteRoutes.ts
│   │
│   └── utils/                    # Utilitários
│       ├── ErrosCustomizados.ts
│       ├── schemasZod.ts        # Validações Zod
│       └── validations.ts
│
├── prisma/
│   ├── schema.prisma            # Schema do banco de dados
│   ├── migrations/              # Histórico de migrations
│   ├── seed.ts                  # Seed de dados
│   └── seed-demo.ts             # Dados de demonstração
│
├── tests/                        # Testes automatizados
│   ├── sprint1.test.ts
│   ├── sprint2-*.test.ts
│   ├── e2e-fluxos-completos.test.ts
│   └── helpers/                 # Helpers de teste
│
├── coverage/                     # Relatórios de cobertura
├── scripts/                      # Scripts utilitários
│
├── docker-compose.test.yml
├── jest.config.js
├── tsconfig.json
├── package.json
└── README.md
```

---

## API Endpoints

### Authentication
```http
POST   /api/auth/registro               # Registrar restaurante
POST   /api/auth/login                  # Login restaurante
POST   /api/auth/cliente/registro       # Registrar cliente
POST   /api/auth/cliente/login          # Login cliente
```

### Tickets (Fila)
```http
POST   /api/tickets                     # Entrar na fila
GET    /api/tickets/:id                 # Detalhes do ticket
PATCH  /api/tickets/:id/status          # Atualizar status
DELETE /api/tickets/:id                 # Cancelar ticket
GET    /api/tickets/restaurante/:id     # Tickets do restaurante
```

### Restaurantes
```http
GET    /api/restaurantes                # Listar restaurantes
GET    /api/restaurantes/:slug          # Detalhes do restaurante
PATCH  /api/restaurantes/:id            # Atualizar restaurante
POST   /api/restaurantes/:id/imagem     # Upload de imagem
GET    /api/restaurantes/:id/estatisticas # Analytics
```

### Clientes
```http
GET    /api/clientes/perfil             # Perfil do cliente
PATCH  /api/clientes/perfil             # Atualizar perfil
GET    /api/clientes/historico          # Histórico de tickets
```

> Para documentação completa com exemplos de requests/responses, acesse `/api-docs`

---

## Testes

### Rodar todos os testes
```bash
npm test
```

### Rodar em modo watch (desenvolvimento)
```bash
npm run test:watch
```

### Gerar relatório de cobertura
```bash
npm run test:coverage
```

Os testes cobrem:
- Autenticação (Restaurante + Cliente)
- CRUD de Tickets
- Fluxos completos E2E
- WebSocket real-time updates
- Sistema de notificações
- Cálculo de taxas Fast Lane/VIP
- Validações de segurança

**Cobertura atual:** ~85% (statements)

---


