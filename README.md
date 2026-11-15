# Sítio em Matozinhos

Site de aluguel do sítio, feito para o GitHub Pages (sem servidor).

- `index.html` – site público: comodidades, fotos, calendário com preços e pedido de reserva pelo WhatsApp.
- `admin.html` – painel do proprietário: reservas, preços (dia da semana, semana, feriados, períodos e datas), fotos e textos.
- `data/site.json` – todos os dados do site. O painel grava este arquivo (e as fotos em `fotos/`) pelo GitHub.
- `js/config.js` – repositório e branch onde o painel grava. Deve ser o mesmo branch publicado no GitHub Pages.

## Publicar

Em **Settings → Pages**, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)`.

## Entrar no painel

O painel pede um token do GitHub (fine-grained, só deste repositório, permissão **Contents: Read and write**) e uma senha.
Nome, telefone e valores das reservas são gravados criptografados com essa senha; no site aparecem apenas as datas ocupadas.
