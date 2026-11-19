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

// Condição SQL de choque de datas com outra reserva online (ini/fim são os parâmetros da nova estadia).
// Com o dia da saída bloqueado para limpeza, encostar (sair no dia em que o outro entra) também é choque.
export const sobrepoe = (saida, ini, fim) => (saida ? `inicio <= ${fim} AND fim >= ${ini}` : `inicio < ${fim} AND fim > ${ini}`);

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
    // Devolve a resposta inteira: url + identificadores que a InfinitePay usa no aviso de pagamento.
    const j = await postLink(corpo, chave, { valid_until: new Date(reserva.expira_em).toISOString(), ...opcoesParcelas(reserva.parcelasSemJuros) });
    console.log('link criado', { id: reserva.id, campos: Object.keys(j), order_nsu: j.order_nsu, slug: j.slug || j.invoice_slug, url: j.url });
    return j;
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
  return j;
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

// Acha a reserva de um aviso/retorno da InfinitePay. Com a chave de API, a InfinitePay gera o próprio
// order_nsu (UUID) em vez do nosso id, então a busca também usa o que ela devolveu ao criar o link e o slug.
export async function acharReserva({ id, orderNsu, slug, codigo }) {
  const q = sql();
  if (codigo) {
    const [r] = await q`SELECT * FROM reservas_online WHERE codigo = ${codigo}`;
    if (r) return r;
  }
  const chaves = [...new Set([id, orderNsu].filter(Boolean).map(String))];
  for (const k of chaves) {
    const [r] = await q`SELECT * FROM reservas_online WHERE id = ${k} OR ip_link->>'order_nsu' = ${k} OR pagamento->>'order_nsu' = ${k} LIMIT 1`;
    if (r) return r;
  }
  if (slug && /^[\w-]{4,64}$/.test(slug)) {
    const [r] = await q`SELECT * FROM reservas_online WHERE ip_link->>'slug' = ${slug} OR ip_link->>'invoice_slug' = ${slug}
      OR pagamento->>'slug' = ${slug} OR checkout_url LIKE ${'%/' + slug + '%'} ORDER BY criado DESC LIMIT 1`;
    if (r) return r;
  }
  return null;
}

// Confere na InfinitePay se o pagamento existe (o aviso e o retorno do navegador não são confiáveis).
// id: nosso id da reserva (se já conhecido); orderNsu: o order_nsu que a InfinitePay mandou no aviso/retorno.
export async function confirmarPagamento({ id, orderNsu, slug, transacao, codigo }) {
  const q = sql();
  if (!slug || !transacao) return null;
  const r = await acharReserva({ id, orderNsu, slug, codigo });
  if (!r) { console.warn('Aviso da InfinitePay sem reserva correspondente', { id, orderNsu, slug, transacao }); return null; }
  if (r.pagamento && r.pagamento.transaction_nsu === transacao) return r; // já processado
  if (r.status === 'cancelada') return r;
  const D = await carregarSite();
  const handle = String(D.precos.online.handle || '').trim().replace(/^\$/, '');
  const chave = await chaveInfinitePay();
  const nsus = [...new Set([orderNsu, r.ip_link && r.ip_link.order_nsu, r.id].filter(Boolean).map(String))];

  const consultar = async (order_nsu, comChave) => {
    const headers = { 'Content-Type': 'application/json' };
    if (comChave) headers['X-Api-Key'] = chave;
    const resp = await fetch(`${IP}/payment_check`, { method: 'POST', headers, body: JSON.stringify({ handle, order_nsu, transaction_nsu: transacao, slug }) });
    const j = await resp.json().catch(() => ({}));
    console.log('payment_check', { id: r.id, order_nsu, slug, transacao, comChave, http: resp.status, resposta: j });
    return { ok: resp.ok, status: resp.status, c: j, order_nsu };
  };
  // Tenta cada order_nsu possível, sem e com a chave. A InfinitePay responde 404 quando algo não bate.
  let v = null, algumaResposta = false;
  for (const n of nsus) {
    for (const comChave of chave ? [false, true] : [false]) {
      const t = await consultar(n, comChave);
      if (t.ok || t.status === 404) algumaResposta = true;
      if (t.ok && t.c.success && t.c.paid) { v = t; break; }
    }
    if (v) break;
  }
  if (!v) {
    if (!algumaResposta) throw new Error('Falha ao consultar a InfinitePay.');
    return r;
  }
  const c = v.c;
  // O aviso não tem assinatura: o pagamento conferido precisa ser do valor desta reserva e não pode já ter
  // confirmado outra reserva.
  if (Number(c.amount) !== Math.round(Number(r.valor_cobrado) * 100)) {
    console.warn('Pagamento com valor diferente da reserva; ignorado', { id: r.id, amount: c.amount, esperado: r.valor_cobrado });
    return r;
  }
  const [usado] = await q`SELECT id FROM reservas_online WHERE id <> ${r.id} AND pagamento->>'transaction_nsu' = ${transacao} LIMIT 1`;
  if (usado) { console.warn('Pagamento já usado em outra reserva; ignorado', { id: r.id, outra: usado.id }); return r; }

  // Pagamento fora do prazo nunca confirma sozinho: vai para o proprietário confirmar ou estornar.
  // O mesmo vale se as datas já foram pegas por outra reserva.
  const atrasado = r.expira_em && Date.now() > new Date(r.expira_em).getTime() + TOLERANCIA_AVISO_MS;
  const saida = !!D.precos.bloquearSaida;
  const outras = await q.query(`SELECT 1 FROM reservas_online WHERE id <> $1 AND ${sobrepoe(saida, '$3', '$2')} AND ${ATIVA} LIMIT 1`, [r.id, r.fim, r.inicio]);
  const manual = !!C.conflito(C.ocupacao(D), r.inicio, r.fim, saida);
  const status = atrasado || outras.length || manual ? 'conflito' : 'confirmada';
  if (status === 'conflito') console.warn('Pagamento marcado como conflito', { id: r.id, atrasado, outras: outras.length, manual });
  const pagamento = { slug, transaction_nsu: transacao, order_nsu: v.order_nsu, capture_method: c.capture_method, installments: c.installments, amount: c.amount, paid_amount: c.paid_amount };
  const [nova] = await q`UPDATE reservas_online SET status = ${status}, valor_pago = ${c.amount / 100},
    pagamento = ${JSON.stringify(pagamento)}::jsonb, atualizado = now() WHERE id = ${r.id} RETURNING *`;
  return nova;
}

export function origemDe(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || (/^localhost|^127\./.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}
