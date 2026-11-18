// Importa data/site.json para o Neon (uma vez). Uso: npm run db:migrar  [--forcar]
import { readFile } from 'node:fs/promises';
import { preparar, sql } from '../lib/servidor.js';

await preparar();
const q = sql();
const dados = JSON.parse(await readFile(new URL('../data/site.json', import.meta.url), 'utf8'));
const [atual] = await q`SELECT versao FROM conteudo WHERE id = 'site'`;

if (atual && !process.argv.includes('--forcar')) {
  console.log(`Já existe conteúdo no banco (versão ${atual.versao}). Nada feito. Use --forcar para sobrescrever.`);
} else {
  await q`INSERT INTO conteudo (id, dados) VALUES ('site', ${JSON.stringify(dados)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET dados = EXCLUDED.dados, versao = conteudo.versao + 1, atualizado = now()`;
  console.log(`Importado: ${dados.fotos.length} fotos, ${dados.reservas.length} reservas, criptografia ${dados.cripto ? 'configurada' : 'pendente'}.`);
}
