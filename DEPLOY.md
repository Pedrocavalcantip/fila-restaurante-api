# Deploy

## Requisitos

- Node.js 20 ou superior
- PostgreSQL acessível pela aplicação

## Variáveis de ambiente

Configure as variáveis já utilizadas pelo projeto:

```env
DATABASE_URL="postgresql://user:password@host:5432/fila_restaurante?schema=public"
DIRECT_URL="postgresql://user:password@host:5432/fila_restaurante"
JWT_SECRET="seu-secret-super-seguro-aqui"
JWT_EXPIRES_IN="7d"
CLOUDINARY_CLOUD_NAME="seu-cloud-name"
CLOUDINARY_API_KEY="sua-api-key"
CLOUDINARY_API_SECRET="seu-api-secret"
SENDGRID_API_KEY="sua-sendgrid-key"
SENDGRID_FROM_EMAIL="noreply@seudominio.com"
PORT=3000
NODE_ENV=production
```

## Passos manuais

```bash
npm install
npx prisma generate
npm run build
npx prisma migrate deploy
npm run start
```

O arquivo `nixpacks.toml` já configura esses passos no deploy: instala as
dependências, gera o cliente Prisma, executa o build e as migrations e inicia a
aplicação com `npm run start`.
