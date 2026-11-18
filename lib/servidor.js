// Utilidades compartilhadas pelas funções da pasta api/ (Vercel Functions + Neon).
import { neon } from '@neondatabase/serverless';
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

let _sql = null;
let _pronto = null;

export function sql() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

// Cria as tabelas na primeira chamada (idempotente).
export function preparar() {
  if (!_pronto) {
    const q = sql();
    _pronto = (async () => {
      await q`CREATE TABLE IF NOT EXISTS conteudo (
        id text PRIMARY KEY,
        dados jsonb NOT NULL,
        versao bigint NOT NULL DEFAULT 1,
        atualizado timestamptz NOT NULL DEFAULT now())`;
      await q`CREATE TABLE IF NOT EXISTS fotos (
        id text PRIMARY KEY,
        tipo text NOT NULL,
        dados bytea NOT NULL,
        criado timestamptz NOT NULL DEFAULT now())`;
    })().catch((e) => { _pronto = null; throw e; });
  }
  return _pronto;
}

export function enviar(res, status, corpo, headers = {}) {
  res.statusCode = status;
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  if (Buffer.isBuffer(corpo)) return res.end(corpo);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(corpo));
}

export function consulta(req) {
  return new URL(req.url, 'http://local').searchParams;
}

export async function lerCorpo(req) {
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  const partes = [];
  for await (const p of req) partes.push(p);
  const txt = Buffer.concat(partes).toString('utf8');
  return txt ? JSON.parse(txt) : {};
}

/* ---------- Sessão do painel ---------- */
const segredo = () => process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || '';
const assinar = (txt) => createHmac('sha256', segredo()).update(txt).digest('base64url');
const hash = (s) => createHash('sha256').update(String(s)).digest();

export function senhaConfere(senha) {
  const certa = process.env.ADMIN_PASSWORD;
  if (!certa) throw new Error('ADMIN_PASSWORD não configurada.');
  return timingSafeEqual(hash(senha), hash(certa));
}

export function criarSessao(dias = 90) {
  const exp = String(Date.now() + dias * 864e5);
  return `${exp}.${assinar(exp)}`;
}

export function autenticado(req) {
  const m = /^Bearer (\d+)\.([\w-]+)$/.exec(req.headers.authorization || '');
  if (!m || !segredo() || Number(m[1]) < Date.now()) return false;
  const a = Buffer.from(m[2]), b = Buffer.from(assinar(m[1]));
  return a.length === b.length && timingSafeEqual(a, b);
}

// Envolve a função com tratamento de erro padrão.
export const rota = (fn) => async (req, res) => {
  try { await fn(req, res); } catch (e) {
    console.error(e);
    enviar(res, 500, { erro: e.message || 'Erro interno.' });
  }
};
