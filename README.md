# Gestão de Despesas por Projeto

Projeto de exemplo para gestão de despesas por projeto com:

- Banco SQL estruturado e pronto para execução
- API REST em Node.js
- Frontend em React com Vite

## Estrutura

- `apps/api` – backend
- `apps/web` – frontend
- `apps/api/database` – schema e seed SQL

## Como executar

```bash
npm install
npm run dev
```

A API fica em `http://localhost:3001` e o frontend em `http://localhost:5173`.

Para ambientes reais, defina `JWT_SECRET` com um segredo forte antes de iniciar a API. O login usa um access JWT de curta duração e um refresh JWT em cookie HTTP-only; o frontend renova o access token automaticamente quando necessário.

## Publicação rápida

O projeto inclui `render.yaml` para publicar a API no Render e `vercel.json` para publicar o frontend na Vercel.

1. Suba o repositório para GitHub.
2. No Render, crie um Blueprint a partir do repositório e configure `FRONTEND_ORIGIN` depois de obter a URL da Vercel.
3. Na Vercel, importe o mesmo repositório e configure `VITE_API_URL` com a URL do Render terminada em `/api`.
4. Volte ao Render e defina `FRONTEND_ORIGIN` com a URL pública da Vercel.
5. Faça um novo deploy nos dois serviços e teste o login.

O plano gratuito do Render não usa disco persistente neste projeto. A demonstração funciona, mas a base SQLite e as fotos podem ser perdidas quando o serviço reiniciar ou for publicado novamente. Para produção com vários clientes, substitua SQLite por PostgreSQL e mova as fotos para armazenamento de objetos.

## API principal

- `GET /api/health`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/auth/session`
- `POST /api/auth/logout`
- `GET /api/dashboard`
- `GET /api/projetos`
- `POST /api/projetos`
- `PATCH /api/projetos/:id`
- `GET /api/lancamentos`
- `POST /api/lancamentos`
- `PATCH /api/lancamentos/:id/status`
- `POST /api/importar-planilha`
- `GET /api/relatorios/resumo-mensal`
- `GET /api/relatorios/executivo`
