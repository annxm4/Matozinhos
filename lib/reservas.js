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
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.INFINITEPAY_API_KEY) {
    headers['X-Api-Key'] = process.env.INFINITEPAY_API_KEY;
    corpo.options = { valid_until: new Date(reserva.expira_em).toISOString() };
  }
  const r = await fetch(`${IP}/links`, { method: 'POST', headers, body: JSON.stringify(corpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.url) throw new Error('InfinitePay recusou o pagamento: ' + (j.message || j.error || r.status));
  return j.url;
}

// Confere na InfinitePay se o pagamento existe (o aviso e o retorno do navegador não são confiáveis).
export async function confirmarPagamento({ id, slug, transacao }) {
  const q = sql();
  const [r] = await q`SELECT * FROM reservas_online WHERE id = ${id}`;
  if (!r || !slug || !transacao) return null;
  if (r.pagamento && r.pagamento.transaction_nsu === transacao) return r; // já processado
  if (r.status === 'cancelada') return r;
  const D = await carregarSite();
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.INFINITEPAY_API_KEY) headers['X-Api-Key'] = process.env.INFINITEPAY_API_KEY;
  const resp = await fetch(`${IP}/payment_check`, {
    method: 'POST', headers,
    body: JSON.stringify({ handle: D.precos.online.handle, order_nsu: id, transaction_nsu: transacao, slug }),
  });
  if (!resp.ok) throw new Error('Falha ao consultar a InfinitePay (' + resp.status + ').');
  const c = await resp.json();
  if (!c.success || !c.paid) return r;

  // Pagou depois de vencer o prazo e as datas já foram pegas? Marca para o proprietário resolver.
  const outras = await q.query(`SELECT 1 FROM reservas_online WHERE id <> $1 AND inicio < $2 AND fim > $3 AND ${ATIVA} LIMIT 1`, [id, r.fim, r.inicio]);
  const ocupMan = C.ocupacao(D);
  let manual = false;
  for (let d = r.inicio; d < r.fim; d = C.addDias(d, 1)) if (ocupMan.has(d)) manual = true;
  const status = outras.length || manual ? 'conflito' : 'confirmada';
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
