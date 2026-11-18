// Chave de API da InfinitePay no painel (exige sessão). A chave nunca é devolvida ao navegador.
// GET    /api/pagamento                       -> { configurada, final, origem }
// PUT    /api/pagamento { chave, handle }     -> testa com a InfiniteTag e salva
// DELETE /api/pagamento                       -> remove a chave salva pelo painel
import { rota, enviar, lerCorpo, autenticado, preparar, sql } from '../lib/servidor.js';
import { testarChave } from '../lib/reservas.js';

const NOME = 'infinitepay_api_key';

async function estado() {
  const [s] = await sql()`SELECT valor FROM segredos WHERE nome = ${NOME}`;
  const chave = (s && s.valor) || process.env.INFINITEPAY_API_KEY || '';
  return { configurada: !!chave, final: chave ? chave.slice(-4) : '', origem: s ? 'painel' : (chave ? 'vercel' : null) };
}

export default rota(async (req, res) => {
  if (!autenticado(req)) return enviar(res, 401, { erro: 'Sessão expirada. Entre novamente.' });
  await preparar();
  const q = sql();

  if (req.method === 'GET') return enviar(res, 200, await estado(), { 'Cache-Control': 'no-store' });

  if (req.method === 'PUT') {
    const { chave, handle } = await lerCorpo(req);
    const k = String(chave || '').trim();
    const h = String(handle || '').trim().replace(/^\$/, '');
    if (!/^inchk_[\w-]{8,}$/.test(k)) return enviar(res, 400, { erro: 'A chave deve começar com inchk_. Copie a chave inteira do app da InfinitePay.' });
    if (!h) return enviar(res, 400, { erro: 'Preencha a InfiniteTag antes de salvar a chave.' });
    try {
      await testarChave(k, h);
    } catch (e) {
      if (e.status === 401 || e.status === 403) return enviar(res, 400, { erro: `A InfinitePay recusou a chave para a tag ${h}. Confira se a chave é da mesma conta da InfiniteTag.` });
      return enviar(res, 502, { erro: 'Não foi possível testar a chave agora: ' + e.message });
    }
    await q`INSERT INTO segredos (nome, valor) VALUES (${NOME}, ${k})
      ON CONFLICT (nome) DO UPDATE SET valor = EXCLUDED.valor, atualizado = now()`;
    return enviar(res, 200, await estado());
  }

  if (req.method === 'DELETE') {
    await q`DELETE FROM segredos WHERE nome = ${NOME}`;
    return enviar(res, 200, await estado());
  }

  enviar(res, 405, { erro: 'Método não permitido.' });
});
