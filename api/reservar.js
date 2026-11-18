// POST /api/reservar  { inicio, fim, nome, telefone, email, hospedes, obs, modo }
// Recalcula o preço no servidor, segura as datas e devolve o link de pagamento da InfinitePay.
import { randomBytes } from 'node:crypto';
import { rota, enviar, lerCorpo, preparar, sql } from '../lib/servidor.js';
import { C, ATIVA, carregarSite, hojeBR, digitos, novoCodigo, criarLink, origemDe } from '../lib/reservas.js';

const DATA = /^\d{4}-\d{2}-\d{2}$/;

export default rota(async (req, res) => {
  if (req.method !== 'POST') return enviar(res, 405, { erro: 'Método não permitido.' });
  await preparar();
  const b = await lerCorpo(req);
  const D = await carregarSite();
  const ON = D.precos.online;
  if (!ON.ativo || !ON.handle) return enviar(res, 400, { erro: 'A reserva online não está disponível. Fale com o proprietário pelo WhatsApp.' });

  const nome = String(b.nome || '').trim().slice(0, 120);
  const telefone = digitos(b.telefone);
  const email = String(b.email || '').trim().slice(0, 160);
  if (nome.length < 3) return enviar(res, 400, { erro: 'Informe seu nome completo.' });
  if (telefone.length < 10 || telefone.length > 13) return enviar(res, 400, { erro: 'Informe um telefone com DDD.' });
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return enviar(res, 400, { erro: 'E-mail inválido.' });

  const { inicio, fim } = b;
  if (!DATA.test(inicio || '') || !DATA.test(fim || '') || !(inicio < fim)) return enviar(res, 400, { erro: 'Datas inválidas.' });
  if (inicio < hojeBR()) return enviar(res, 400, { erro: 'A data de entrada já passou.' });
  const o = C.orcamento(D, inicio, fim);
  if (o.n > 60) return enviar(res, 400, { erro: 'Para estadias longas, fale com o proprietário.' });
  if (o.consulta) return enviar(res, 400, { erro: 'Estas datas têm valor sob consulta. Fale com o proprietário.' });
  if (o.n < o.minNoites) return enviar(res, 400, { erro: `A estadia mínima para estas datas é de ${o.minNoites} noites.` });

  const ocup = C.ocupacao(D);
  for (let d = inicio; d < fim; d = C.addDias(d, 1)) if (ocup.has(d)) return enviar(res, 409, { erro: 'Estas datas acabaram de ser reservadas. Escolha outras.' });

  const cob = C.cobrancaOnline(D, o, b.modo);
  if (!cob) return enviar(res, 400, { erro: 'Forma de pagamento indisponível.' });
  if (cob.valor < 1) return enviar(res, 400, { erro: 'Valor do pagamento inválido.' });

  const id = Date.now().toString(36) + randomBytes(5).toString('hex');
  const codigo = novoCodigo();
  const minutos = Math.min(Math.max(Number(ON.minutos) || 30, 10), 1440);
  const expira = new Date(Date.now() + minutos * 60e3).toISOString();
  const hospedes = Number(b.hospedes) > 0 ? Math.min(Number(b.hospedes), 999) : null;
  const obs = String(b.obs || '').trim().slice(0, 500);

  // Trava global + inserção condicional: duas pessoas não conseguem segurar as mesmas datas.
  const q = sql();
  const [, inseridas] = await q.transaction([
    q`SELECT pg_advisory_xact_lock(7342001)`,
    q.query(`INSERT INTO reservas_online (id, codigo, inicio, fim, status, nome, telefone, email, hospedes, obs, modo, total, valor_cobrado, expira_em)
      SELECT $1, $2, $3, $4, 'aguardando', $5, $6, $7, $8, $9, $10, $11, $12, $13
      WHERE NOT EXISTS (SELECT 1 FROM reservas_online WHERE inicio < $4 AND fim > $3 AND ${ATIVA})
      RETURNING id`, [id, codigo, inicio, fim, nome, telefone, email || null, hospedes, obs || null, cob.modo, o.total, cob.valor, expira]),
  ]);
  if (!inseridas.length) return enviar(res, 409, { erro: 'Estas datas acabaram de ser reservadas. Escolha outras.' });

  let url;
  try {
    url = await criarLink({
      handle: ON.handle, origem: origemDe(req),
      reserva: { id, codigo, nome, telefone, email, valor_cobrado: cob.valor, expira_em: expira,
        descricao: `${D.site.nome} – ${C.brData(inicio)} a ${C.brData(fim)} – ${cob.rotulo}` },
    });
  } catch (e) {
    await q`DELETE FROM reservas_online WHERE id = ${id}`;
    throw e;
  }
  await q`UPDATE reservas_online SET checkout_url = ${url} WHERE id = ${id}`;
  enviar(res, 201, { codigo, url, expira });
});
