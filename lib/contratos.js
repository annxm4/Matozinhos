// Contrato de locação por temporada das reservas online: criação, variáveis e assinatura.
import { randomBytes, createHash } from 'node:crypto';
import { sql } from './servidor.js';
import { C, carregarSite, novoCodigo } from './reservas.js';

const MODO = { sinal: 'sinal, pago online', caucao: 'caução, paga online', integral: 'valor total, pago online', manual: 'pago diretamente ao locador' };

// Reservas lançadas no painel usam o id "painel-<id>" e guardam os dados no próprio contrato.
export const PAINEL = 'painel-';

export async function salvarContratoPainel(id, x, D) {
  const q = sql();
  const reservaId = PAINEL + id;
  const [atual] = await q`SELECT * FROM contratos WHERE reserva_id = ${reservaId}`;
  if (atual && atual.status === 'assinado') { const e = new Error('Este contrato já foi assinado e não pode ser alterado.'); e.status = 409; throw e; }
  const reserva = {
    id: reservaId, codigo: (atual && atual.reserva && atual.reserva.codigo) || novoCodigo(), status: 'confirmada', modo: 'manual',
    inicio: x.inicio, fim: x.fim, nome: x.nome, telefone: x.telefone, email: x.email || '',
    hospedes: x.hospedes || null, total: x.total, valor_pago: x.pago, forma: x.forma || '',
  };
  if (atual) {
    // Pendente: atualiza os dados da reserva e usa o modelo atual do painel.
    const locador = { nome: D.contrato.locadorNome || '', documento: D.contrato.locadorDocumento || '' };
    const [c] = await q`UPDATE contratos SET reserva = ${JSON.stringify(reserva)}::jsonb, modelo = ${D.contrato.modelo},
      locador = ${JSON.stringify(locador)}::jsonb WHERE id = ${atual.id} AND status = 'pendente' RETURNING *`;
    return c;
  }
  const idC = Date.now().toString(36) + randomBytes(4).toString('hex');
  const token = randomBytes(18).toString('base64url');
  const locador = { nome: D.contrato.locadorNome || '', documento: D.contrato.locadorDocumento || '' };
  const [c] = await q`INSERT INTO contratos (id, reserva_id, token, modelo, locador, reserva)
    VALUES (${idC}, ${reservaId}, ${token}, ${D.contrato.modelo}, ${JSON.stringify(locador)}::jsonb, ${JSON.stringify(reserva)}::jsonb)
    RETURNING *`;
  return c;
}

// Reserva de um contrato: a online (tabela reservas_online) ou os dados guardados no contrato (painel).
export async function reservaDoContrato(c) {
  if (c.reserva_id.startsWith(PAINEL)) return c.reserva || null;
  const [r] = await sql()`SELECT * FROM reservas_online WHERE id = ${c.reserva_id}`;
  return r || null;
}

// Cria o contrato de uma reserva confirmada (uma vez só). O modelo é congelado aqui:
// mudar o modelo no painel depois não altera contratos já gerados.
// forcar: o proprietário pediu pelo painel (gera mesmo com a geração automática desligada).
export async function garantirContrato(r, D, forcar = false) {
  if (!r || r.status !== 'confirmada') return null;
  const q = sql();
  const [atual] = await q`SELECT * FROM contratos WHERE reserva_id = ${r.id}`;
  if (atual) return atual;
  D = D || await carregarSite();
  if (!D.contrato || (!D.contrato.ativo && !forcar) || !String(D.contrato.modelo || '').trim()) return null;
  const id = Date.now().toString(36) + randomBytes(4).toString('hex');
  const token = randomBytes(18).toString('base64url');
  const locador = { nome: D.contrato.locadorNome || '', documento: D.contrato.locadorDocumento || '' };
  await q`INSERT INTO contratos (id, reserva_id, token, modelo, locador)
    VALUES (${id}, ${r.id}, ${token}, ${D.contrato.modelo}, ${JSON.stringify(locador)}::jsonb)
    ON CONFLICT (reserva_id) DO NOTHING`;
  const [c] = await q`SELECT * FROM contratos WHERE reserva_id = ${r.id}`;
  return c;
}

// Prazo para assinar: X horas antes do horário de entrada (padrão 14h, horário de Brasília).
export function prazoAssinatura(r, D) {
  const m = /(\d{1,2})\s*(?:[:h]\s*(\d{2}))?/.exec(String(D.site.checkin || ''));
  const hh = m ? String(Math.min(Number(m[1]), 23)).padStart(2, '0') : '14', mm = m && m[2] ? m[2] : '00';
  const entrada = new Date(`${r.inicio}T${hh}:${mm}:00-03:00`);
  const horas = Number(D.contrato && D.contrato.prazoHoras);
  return new Date(entrada.getTime() - (horas >= 0 ? horas : 48) * 3600e3);
}

// Variáveis do modelo. "dados" são os campos que o locatário preenche na hora de assinar.
export function variaveis(r, D, c, dados = {}, quando = null) {
  const S = D.site, total = Number(r.total), pago = Number(r.valor_pago);
  const restante = r.modo === 'caucao' ? total : Math.max(0, total - pago);
  const regras = (S.regras || []).filter(Boolean);
  const loc = c.locador || {};
  const dataBR = (d) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'long' }).format(d);
  return {
    codigo: r.codigo,
    locatario_nome: dados.nome || r.nome,
    locatario_cpf: dados.cpf || '',
    locatario_rg: dados.rg || '',
    locatario_endereco: dados.endereco || '',
    locatario_telefone: r.telefone || '',
    locatario_email: r.email || '',
    locador_nome: loc.nome || '',
    locador_documento: loc.documento || '',
    imovel: S.nome,
    imovel_endereco: [S.endereco, S.cidade].filter(Boolean).join(' – '),
    cidade: S.cidade,
    capacidade: S.capacidade || '',
    hospedes: r.hospedes ? String(r.hospedes) : '',
    entrada: C.brData(r.inicio),
    saida: C.brData(r.fim),
    checkin: S.checkin || '',
    checkout: S.checkout || '',
    noites: String(C.noites(r.inicio, r.fim)),
    valor_total: C.moeda(total),
    valor_pago: C.moeda(pago),
    valor_restante: C.moeda(restante),
    forma_pagamento: r.forma || MODO[r.modo] || r.modo,
    caucao: D.precos.caucao > 0 ? C.moeda(D.precos.caucao) : '',
    politica: String(D.precos.online.politica || '').trim(),
    regras: regras.map((x, i) => `${i + 1}. ${x}`).join('\n'),
    data: dataBR(quando || new Date()),
  };
}

export const digitos = (s) => String(s || '').replace(/\D/g, '');

export function cpfValido(cpf) {
  const d = digitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const n of [9, 10]) {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    if (((s * 10) % 11) % 10 !== Number(d[n])) return false;
  }
  return true;
}
export const fmtCpf = (cpf) => digitos(cpf).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');

export const hashContrato = (obj) => createHash('sha256').update(JSON.stringify(obj)).digest('hex');
