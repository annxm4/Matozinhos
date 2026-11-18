// GET    /api/foto?id=...   -> imagem (pública, cache longo)
// POST   /api/foto          -> { imagem: 'data:image/jpeg;base64,...' } -> { arquivo } (exige sessão)
// DELETE /api/foto?id=...   -> remove (exige sessão)
import { randomBytes } from 'node:crypto';
import { rota, enviar, lerCorpo, consulta, autenticado, preparar, sql } from '../lib/servidor.js';

const LIMITE = 3 * 1024 * 1024;

export default rota(async (req, res) => {
  await preparar();
  const q = sql();
  const id = consulta(req).get('id');

  if (req.method === 'GET') {
    if (!id) return enviar(res, 400, { erro: 'Informe o id.' });
    const [f] = await q`SELECT tipo, encode(dados, 'base64') AS b64 FROM fotos WHERE id = ${id}`;
    if (!f) return enviar(res, 404, { erro: 'Foto não encontrada.' });
    return enviar(res, 200, Buffer.from(f.b64, 'base64'), {
      'Content-Type': f.tipo,
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
  }

  if (!autenticado(req)) return enviar(res, 401, { erro: 'Sessão expirada. Entre novamente.' });

  if (req.method === 'POST') {
    const { imagem } = await lerCorpo(req);
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(imagem || '');
    if (!m) return enviar(res, 400, { erro: 'Imagem inválida.' });
    const bytes = Buffer.from(m[2], 'base64');
    if (bytes.length > LIMITE) return enviar(res, 413, { erro: 'Foto grande demais.' });
    const novo = Date.now().toString(36) + randomBytes(4).toString('hex');
    await q`INSERT INTO fotos (id, tipo, dados) VALUES (${novo}, ${m[1]}, decode(${m[2]}, 'base64'))`;
    return enviar(res, 201, { arquivo: `api/foto?id=${novo}` });
  }

  if (req.method === 'DELETE') {
    if (!id) return enviar(res, 400, { erro: 'Informe o id.' });
    await q`DELETE FROM fotos WHERE id = ${id}`;
    return enviar(res, 200, { ok: true });
  }

  enviar(res, 405, { erro: 'Método não permitido.' });
});
