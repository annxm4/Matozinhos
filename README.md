# Sítio em Matozinhos

Site de aluguel do sítio. Hospedado na **Vercel**, com os dados no **Neon** (Postgres).

- `index.html` – site público: comodidades, fotos, calendário com preços e pedido de reserva pelo WhatsApp.
- `admin.html` – painel do proprietário: reservas, preços (dia da semana, semana, feriados, períodos e datas), fotos e textos.
- `api/` – funções da Vercel: `login`, `dados` (conteúdo do site) e `foto` (envio e exibição de fotos).
- `lib/servidor.js` – conexão com o Neon, criação das tabelas e sessão do painel.
- `data/site.json` – dados iniciais, importados uma vez para o banco com `npm run db:migrar`.

## Variáveis de ambiente

| Variável | Para que serve |
|---|---|
| `DATABASE_URL` | String de conexão do Neon (pooled) |
| `ADMIN_PASSWORD` | Senha de acesso ao painel |
| `SESSION_SECRET` | Texto aleatório que assina a sessão do painel |

Localmente, copie `.env.example` para `.env.local`. Na Vercel, cadastre em **Settings → Environment Variables**.

## Rodar localmente

```bash
npm install
npm run db:migrar   # só na primeira vez: leva data/site.json para o Neon
npm run dev         # http://localhost:3000
```

## Entrar no painel

São duas senhas:
1. **Senha de acesso** (`ADMIN_PASSWORD`), conferida no servidor.
2. **Senha do painel**, que criptografa no navegador nome, telefone e valores das reservas. No site aparecem só as datas ocupadas. Sem ela esses dados não podem ser recuperados.

## Publicar

A Vercel publica a cada push: o branch `main` vai para produção e cada pull request ganha um link de prévia.
