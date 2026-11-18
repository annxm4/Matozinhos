// Regras de reserva online: datas, bloqueio, InfinitePay e consulta pelo cliente.
import { randomBytes } from 'node:crypto';
import '../js/core.js';
import { sql } from './servidor.js';

export const C = globalThis.Sitio;
const IP = 'https://api.checkout.infinitepay.io';

export async function carregarSite() {
  const [linha] = await sql()`SELECT dados FROM conteudo WHERE id = 'site'`;
  return C.normalizar(linha ? linha.dados : null);
}

// Data de hoje no Brasil (o servidor roda em UTC).
export const hojeBR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

export const digitos = (s) => String(s || '').replace(/\D/g, '');

export function novoCodigo() {
  const alfa = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return [...randomBytes(6)].map((b) => alfa[b % alfa.length]).join('');
}

// Reserva que segura as datas: confirmada, ou aguardando pagamento dentro do prazo.
export const ATIVA = `(status IN ('confirmada', 'conflito') OR (status = 'aguardando' AND expira_em > now()))`;

export function statusEfetivo(r) {
  if (r.status === 'aguardando' && new Date(r.expira_em) <= new Date()) return 'expirada';
  return r.status;
}

export async function reservasAtivas() {
  return sql().query(`SELECT id, inicio, fim, status FROM reservas_online WHERE ${ATIVA}`);
}

export async function criarLink({ handle, reserva, origem }) {
  const corpo = {
    handle,
    order_nsu: reserva.id,
    redirect_url: `${origem}/reserva.html?c=${reserva.codigo}`,
    webhook_url: `${origem}/api/infinitepay`,
    items: [{ quantity: 1, price: Math.round(reserva.valor_cobrado * 100), description: reserva.descricao.slice(0, 120) }],
    customer: {
      name: reserva.nome,
      ...(reserva.email ? { email: reserva.email } : {}),
      phone_number: '+' + (reserva.telefone.length <= 11 ? '55' : '') + reserva.telefone,
    },
  };
  // O link só é criado com a chave: é ela que faz o link vencer junto com o prazo da reserva.
  // Sem chave (ou chave recusada) não há link — nunca um link sem prazo.
  const chave = await chaveInfinitePay();
  if (!chave) throw erroSemChave();
  try {
    return await postLink(corpo, chave, { valid_until: new Date(reserva.expira_em).toISOString(), ...opcoesParcelas(reserva.parcelasSemJuros) });
  } catch (e) {
    if (e.status === 401 || e.status === 403) {
      console.error('Chave da InfinitePay recusada; reserva online bloqueada até trocar a chave no painel.', e.message);
      throw erroSemChave();
    }
    throw e;
  }
}

export function erroSemChave() {
  const e = new Error('O pagamento online está indisponível no momento. Fale com o proprietário pelo WhatsApp.');
  e.status = 503;
  e.publico = true;
  return e;
}

// Tolerância só para o aviso de pagamento chegar (o link já não aceita pagamento depois do prazo).
const TOLERANCIA_AVISO_MS = 2 * 60e3;

const opcoesParcelas = (n) => (n == null || n === '' ? {} : { assured_installments: Math.min(Math.max(Number(n) || 0, 0), 12) });

async function postLink(corpo, chave, opcoes) {
  const headers = { 'Content-Type': 'application/json' };
  if (chave) headers['X-Api-Key'] = chave;
  const r = await fetch(`${IP}/links`, { method: 'POST', headers, body: JSON.stringify(opcoes ? { ...corpo, options: opcoes } : corpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.url) {
    const e = new Error('InfinitePay recusou o pagamento: ' + (j.message || j.error || r.status));
    e.status = r.status;
    throw e;
  }
  return j.url;
}

/* ---------- Chave de API (guardada só no servidor) ---------- */
export async function chaveInfinitePay() {
  const [s] = await sql()`SELECT valor FROM segredos WHERE nome = 'infinitepay_api_key'`;
  return (s && s.valor) || process.env.INFINITEPAY_API_KEY || '';
}

// Cria um link de R$ 1,00 que vence em 2 minutos só para conferir se a chave combina com a InfiniteTag.
export async function testarChave(chave, handle) {
  await postLink({
    handle,
    order_nsu: 'teste-chave-' + Date.now().toString(36),
    items: [{ quantity: 1, price: 100, description: 'Teste de configuração do site (pode ignorar)' }],
  }, chave, { valid_until: new Date(Date.now() + 120e3).toISOString() });
}

// Confere na InfinitePay se o pagamento existe (o aviso e o retorno do navegador não são confiáveis).
export async function confirmarPagamento({ id, slug, transacao }) {
  const q = sql();
  const [r] = await q`SELECT * FROM reservas_online WHERE id = ${id}`;
  if (!r || !slug || !transacao) return null;
  if (r.pagamento && r.pagamento.transaction_nsu === transacao) return r; // já processado
  if (r.status === 'cancelada') return r;
  const D = await carregarSite();
  const handle = String(D.precos.online.handle || '').trim().replace(/^\$/, '');
  const corpo = JSON.stringify({ handle, order_nsu: id, transaction_nsu: transacao, slug });
  const consultar = async (chave) => {
    const headers = { 'Content-Type': 'application/json' };
    if (chave) headers['X-Api-Key'] = chave;
    const resp = await fetch(`${IP}/payment_check`, { method: 'POST', headers, body: corpo });
    const j = await resp.json().catch(() => ({}));
    console.log('payment_check', { id, slug, transacao, comChave: !!chave, http: resp.status, resposta: j });
    return { ok: resp.ok, status: resp.status, c: j };
  };
  // Primeiro só com a InfiniteTag; se não confirmar e houver chave, confere de novo com ela
  // (links criados com a chave de API podem precisar dela na conferência).
  let v = await consultar(null);
  if (!(v.ok && v.c.success && v.c.paid)) {
    const chave = await chaveInfinitePay();
    if (chave) {
      const v2 = await consultar(chave);
      if (v2.ok || !v.ok) v = v2;
    }
  }
  if (!v.ok) throw new Error('Falha ao consultar a InfinitePay (' + v.status + ').');
  const c = v.c;
  if (!c.success || !c.paid) return r;

  // Pagamento fora do prazo nunca confirma sozinho: vai para o proprietário confirmar ou estornar.
  // O mesmo vale se as datas já foram pegas por outra reserva.
  const atrasado = r.expira_em && Date.now() > new Date(r.expira_em).getTime() + TOLERANCIA_AVISO_MS;
  const outras = await q.query(`SELECT 1 FROM reservas_online WHERE id <> $1 AND inicio < $2 AND fim > $3 AND ${ATIVA} LIMIT 1`, [id, r.fim, r.inicio]);
  const ocupMan = C.ocupacao(D);
  let manual = false;
  for (let d = r.inicio; d < r.fim; d = C.addDias(d, 1)) if (ocupMan.has(d)) manual = true;
  const status = atrasado || outras.length || manual ? 'conflito' : 'confirmada';
  if (status === 'conflito') console.warn('Pagamento marcado como conflito', { id, atrasado, outras: outras.length, manual });
  const pagamento = { slug, transaction_nsu: transacao, capture_method: c.capture_method, installments: c.installments, amount: c.amount, paid_amount: c.paid_amount };
  const [nova] = await q`UPDATE reservas_online SET status = ${status}, valor_pago = ${c.amount / 100},
    pagamento = ${JSON.stringify(pagamento)}::jsonb, atualizado = now() WHERE id = ${id} RETURNING *`;
  return nova;
}

export function origemDe(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || (/^localhost|^127\./.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}
