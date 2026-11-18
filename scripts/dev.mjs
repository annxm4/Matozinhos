// Servidor local simples: arquivos estáticos + funções de api/. Uso: npm run dev
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
const PORTA = process.env.PORT || 3000;

createServer(async (req, res) => {
  const caminho = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  try {
    const api = /^\/api\/([\w-]+)$/.exec(caminho);
    if (api) {
      const mod = await import(pathToFileURL(join(RAIZ, 'api', api[1] + '.js')).href);
      return await mod.default(req, res);
    }
    const arq = normalize(join(RAIZ, caminho.endsWith('/') ? caminho + 'index.html' : caminho));
    if (!arq.startsWith(RAIZ)) throw new Error('fora');
    const conteudo = await readFile(arq);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(arq)] || 'application/octet-stream' });
    res.end(conteudo);
  } catch (e) {
    if (!res.headersSent) res.writeHead(404);
    res.end();
  }
}).listen(PORTA, () => console.log(`http://localhost:${PORTA}  (painel: /admin.html)`));
