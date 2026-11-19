# Sítio em Matozinhos

Site de aluguel do sítio. Hospedado na **Vercel**, com os dados no **Neon** (Postgres).

- `index.html` – site público: comodidades, fotos, calendário com preços e pedido de reserva pelo WhatsApp.
- `admin.html` – painel do proprietário: reservas, preços (dia da semana, semana, feriados, períodos e datas), fotos e textos.
- `reserva.html` – "Minha reserva": o cliente consulta a reserva com código + telefone e conclui o pagamento.
- `api/` – funções da Vercel: `login`, `dados` (conteúdo do site), `foto` (fotos), `reservar` (reserva online + link de pagamento), `infinitepay` (aviso de pagamento), `minha-reserva` (consulta do cliente) e `reservas` (reservas online no painel).
- `lib/reservas.js` – regras da reserva online e integração com o checkout da InfinitePay.

## Reserva online (InfinitePay)

1. No painel, aba **Preços → Reserva online**: ligue a opção, informe a InfiniteTag e escolha a cobrança antecipada (sinal %, caução ou nenhuma) e se o cliente pode pagar o total.
2. O cliente escolhe as datas, preenche os dados e é levado ao checkout (Pix ou cartão em até 12x). As datas ficam seguras pelo tempo configurado.
3. A confirmação vem pelo aviso da InfinitePay (`/api/infinitepay`) ou quando o cliente volta para `reserva.html`; nos dois casos o servidor confere o pagamento em `payment_check` antes de confirmar.
4. Estornos e cancelamentos de pagamento são feitos no app da InfinitePay (a API não oferece).

A InfinitePay não tem ambiente de testes: teste com uma reserva real de R$ 1,00 e estorne pelo app.

## Contrato de locação

1. No painel, aba **Preços → Contrato de locação**: ligue a opção, preencha seu nome e CPF/CNPJ, o prazo (horas antes da entrada) e revise o modelo. Campos como `{locatario_nome}` e `{valor_total}` são preenchidos sozinhos.
2. Com o pagamento confirmado, o contrato da reserva é gerado (modelo congelado naquele momento) com um link único `contrato.html?t=…`.
3. Na aba **Reservas**, cada reserva paga mostra o status do contrato e os botões **Enviar contrato** (WhatsApp), **Copiar link** e **Ver contrato**. O cliente também vê **Assinar contrato** em `reserva.html`.
4. O cliente confere o texto, preenche CPF e endereço e assina com o dedo. O site guarda o texto final, a assinatura, data/hora, IP, navegador e um código SHA-256; a página assinada pode ser salva em PDF.

5. Reservas lançadas no painel: botão **Gerar contrato** no cartão da reserva. Os dados (nome, telefone, valores, hóspedes) são conferidos numa janela e enviados ao servidor só para o contrato; enquanto não for assinado, dá para **Atualizar contrato**. Reservas online pagas também têm **Gerar contrato** quando a geração automática está desligada.

Arquivos: `contrato.html`, `js/contrato.js`, `api/contrato.js` e `lib/contratos.js` (tabela `contratos`).
- `lib/servidor.js` – conexão com o Neon, criação das tabelas e sessão do painel.
- `data/site.json` – dados iniciais, importados uma vez para o banco com `npm run db:migrar`.

## Variáveis de ambiente

| Variável | Para que serve |
|---|---|
| `DATABASE_URL` | String de conexão do Neon (pooled) |
| `ADMIN_PASSWORD` | Senha de acesso ao painel |
| `SESSION_SECRET` | Texto aleatório que assina a sessão do painel |
| `INFINITEPAY_API_KEY` | Obrigatória para a reserva online (ou salve pelo painel): faz o link de pagamento vencer junto com o prazo da reserva |
| `SITE_URL` | Opcional: endereço público fixo usado no retorno do pagamento |

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
