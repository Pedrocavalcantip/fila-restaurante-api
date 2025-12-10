# 🚀 GUIA DE DEPLOY - Fila Restaurante API

## 📋 Pré-requisitos
- Conta no [Railway](https://railway.app) (grátis)
- Conta no [GitHub](https://github.com)
- Repositório com o código no GitHub

---

## 🚂 PARTE 1: DEPLOY DO BACKEND (Railway)

### Passo 1: Preparar o Repositório

1. **Commit e push das mudanças:**
```bash
git add .
git commit -m "Preparar para deploy no Railway"
git push origin main
```

### Passo 2: Criar Projeto no Railway

1. Acesse https://railway.app e faça login com GitHub
2. Clique em **"New Project"**
3. Selecione **"Deploy from GitHub repo"**
4. Escolha o repositório `fila-restaurante-api`
5. Railway vai detectar automaticamente que é um projeto Node.js

### Passo 3: Adicionar Banco de Dados PostgreSQL

1. No dashboard do projeto, clique em **"New"** → **"Database"** → **"Add PostgreSQL"**
2. Railway vai criar automaticamente um banco PostgreSQL
3. A variável `DATABASE_URL` será configurada automaticamente

### Passo 4: Configurar Variáveis de Ambiente

1. Clique no serviço da API (não no banco)
2. Vá em **"Variables"**
3. Adicione as seguintes variáveis:

```env
NODE_ENV=production
PORT=3000
JWT_SECRET=seu-super-secret-aqui-minimo-32-caracteres-bem-forte
JWT_EXPIRES_IN=7d
FRONTEND_URL=https://seu-app.vercel.app
```

> **IMPORTANTE:** A `DATABASE_URL` já vem configurada automaticamente pelo Railway!

### Passo 5: Deploy Automático

Railway vai fazer o deploy automaticamente. Você verá:
- ✅ Build em andamento
- ✅ Migrations executando
- ✅ Deploy completo

### Passo 6: Gerar Domínio Público

1. No serviço da API, vá em **"Settings"**
2. Em **"Networking"**, clique em **"Generate Domain"**
3. Você receberá uma URL tipo: `https://seu-app.up.railway.app`
4. **Copie essa URL** - você vai precisar no frontend!

### Passo 7: Rodar o Seed (IMPORTANTE para apresentação!)

1. No Railway, vá em **"Settings"** → **"Service"**
2. Clique em **"Variables"** e adicione um novo "One-off command":
   - Command: `npx tsx prisma/seed-demo.ts`
3. Ou use o CLI do Railway:

```bash
railway login
railway link
railway run npx tsx prisma/seed-demo.ts
```

---

## ⚡ PARTE 2: DEPLOY DO FRONTEND (Vercel)

### Configuração no Frontend

No projeto do frontend, você precisa atualizar a URL da API:

**Arquivo: `src/config/api.js` (ou similar)**

```javascript
const API_URL = import.meta.env.VITE_API_URL || 'https://seu-app.up.railway.app/api/v1';

export default API_URL;
```

**Arquivo: `.env.production`**

```env
VITE_API_URL=https://seu-app.up.railway.app/api/v1
```

### Deploy na Vercel

1. Acesse https://vercel.com e faça login
2. Clique em **"Add New Project"**
3. Importe o repositório do frontend
4. Configure as variáveis de ambiente:
   - `VITE_API_URL` = `https://seu-app.up.railway.app/api/v1`
5. Clique em **"Deploy"**

---

## 🔧 CONFIGURAÇÕES FINAIS

### Atualizar CORS no Backend

Depois que o frontend estiver no ar, volte no Railway:

1. Vá em **"Variables"**
2. Atualize `FRONTEND_URL` com a URL da Vercel:
   ```
   FRONTEND_URL=https://seu-app.vercel.app
   ```
3. Railway vai fazer redeploy automaticamente

---

## ✅ CHECKLIST PÓS-DEPLOY

- [ ] Backend respondendo em `https://seu-app.up.railway.app`
- [ ] Banco de dados conectado (sem erros de migração)
- [ ] Seed executado com sucesso (3 restaurantes criados)
- [ ] Frontend acessível em `https://seu-app.vercel.app`
- [ ] Login funcionando (teste com `operador@mcdonalds-recife.com` / `operador123`)
- [ ] WebSocket funcionando (atualizações em tempo real)
- [ ] Estatísticas carregando (`GET /api/v1/tickets/estatisticas`)

---

## 🎯 CREDENCIAIS PARA APRESENTAÇÃO

### McDonald's Recife Shopping
- **Admin:** `admin@mcdonalds-recife.com` / `admin123`
- **Operador:** `operador@mcdonalds-recife.com` / `operador123`
- **Clientes:** 
  - João Silva: `joao.silva@email.com` / `cliente123`
  - Maria Santos: `maria.santos@email.com` / `cliente123`
  - Pedro Oliveira: `pedro.oliveira@email.com` / `cliente123`

### Pizza Hut Boa Viagem
- **Admin:** `admin@pizzahut.com` / `admin123`
- **Operador:** `operador@pizzahut.com` / `operador123`
- **Clientes:**
  - Ana Costa (VIP): `ana.costa@email.com` / `cliente123`
  - Carlos Mendes: `carlos.mendes@email.com` / `cliente123`
  - Beatriz Lima: `beatriz.lima@email.com` / `cliente123`
  - Daniel Rocha: `daniel.rocha@email.com` / `cliente123`

### Starbucks RioMar
- **Admin:** `admin@starbucks.com` / `admin123`
- **Operador:** `operador@starbucks.com` / `operador123`
- **Clientes:**
  - Fernanda Alves (VIP): `fernanda.alves@email.com` / `cliente123`
  - Gabriel Souza: `gabriel.souza@email.com` / `cliente123`
  - Helena Martins: `helena.martins@email.com` / `cliente123`
  - Igor Ferreira: `igor.ferreira@email.com` / `cliente123`
  - Julia Cardoso: `julia.cardoso@email.com` / `cliente123`

---

## 🐛 TROUBLESHOOTING

### Erro: "Migration failed"
```bash
# No Railway CLI
railway run npx prisma migrate reset --force
railway run npx tsx prisma/seed-demo.ts
```

### Erro: CORS
Verifique se `FRONTEND_URL` no Railway está igual à URL da Vercel.

### WebSocket não conecta
Certifique-se que o frontend está usando `wss://` (não `ws://`) para produção.

### Seed não rodou
Execute manualmente:
```bash
railway run npx tsx prisma/seed-demo.ts
```

---

## 📊 ENDPOINTS IMPORTANTES PARA APRESENTAÇÃO

```
GET  /health                              # Status da API
GET  /api/v1/tickets/estatisticas        # Dashboard
GET  /api/v1/tickets/filas/:id/ativa     # Fila ativa
POST /api/v1/auth/login                  # Login operador
POST /api/v1/auth-cliente/login          # Login cliente
```

---

## 🎬 ROTEIRO DE DEMONSTRAÇÃO

1. **Login Operador** (McDonald's) → Ver fila com 3 pessoas
2. **Chamar próximo** → Cliente João Silva
3. **Rechamar** (se João não aparecer)
4. **Login Cliente** (João Silva) → Ver posição na fila
5. **Confirmar presença** → Status muda para ATENDENDO
6. **Finalizar atendimento** → Ticket FINALIZADO
7. **Dashboard** → Ver estatísticas atualizadas
8. **Login outro restaurante** → Pizza Hut (4 clientes)
9. **Demonstrar WebSocket** → Atualizações em tempo real

---

## 📞 SUPORTE

Se tiver problemas:
- Railway: https://railway.app/help
- Vercel: https://vercel.com/docs
- Logs no Railway: Dashboard → Deployments → View Logs
