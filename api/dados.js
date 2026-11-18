// GET  /api/dados          -> dados públicos do site (sem dados privados das reservas)
// GET  /api/dados?admin=1  -> dados completos + versão (exige sessão)
// PUT  /api/dados          -> grava { dados, versao } com controle de concorrência (exige sessão)
import { rota, enviar, lerCorpo, consulta, autenticado, preparar, sql } from '../lib/servidor.js';
import { reservasAtivas } from '../lib/reservas.js';

const ID = 'site';

export default rota(async (req, res) => {
  await preparar();
  const q = sql();

  if (req.method === 'GET') {
    const admin = consulta(req).get('admin') === '1';
    if (admin && !autenticado(req)) return enviar(res, 401, { erro: 'Sessão expirada. Entre novamente.' });
    const [linha] = await q`SELECT dados, versao FROM conteudo WHERE id = ${ID}`;
    if (admin) return enviar(res, 200, { dados: linha ? linha.dados : null, versao: linha ? Number(linha.versao) : 0 }, { 'Cache-Control': 'no-store' });
    const d = linha ? linha.dados : {};
    delete d.cripto;
    d.reservas = (d.reservas || []).map(({ id, inicio, fim, status }) => ({ id, inicio, fim, status }));
    (await reservasAtivas()).forEach((r) => d.reservas.push({ id: r.id, inicio: r.inicio, fim: r.fim, status: 'confirmada' }));
    if (d.precos && d.precos.online) delete d.precos.online.handle;
    return enviar(res, 200, d, { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=60' });
  }

  if (req.method === 'PUT') {
    if (!autenticado(req)) return enviar(res, 401, { erro: 'Sessão expirada. Entre novamente.' });
    const { dados, versao } = await lerCorpo(req);
    if (!dados || typeof dados !== 'object') return enviar(res, 400, { erro: 'Dados inválidos.' });
    const json = JSON.stringify(dados);
    let linhas;
    if (!versao) {
      linhas = await q`INSERT INTO conteudo (id, dados) VALUES (${ID}, ${json}::jsonb)
        ON CONFLICT (id) DO NOTHING RETURNING versao`;
    } else {
      linhas = await q`UPDATE conteudo SET dados = ${json}::jsonb, versao = versao + 1, atualizado = now()
        WHERE id = ${ID} AND versao = ${versao} RETURNING versao`;
    }
    if (!linhas.length) return enviar(res, 409, { erro: 'Os dados foram alterados em outro aparelho. Recarregue a página e refaça a alteração.' });
    return enviar(res, 200, { versao: Number(linhas[0].versao) });
  }

  enviar(res, 405, { erro: 'Método não permitido.' });
});
