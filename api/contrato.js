// Contrato pelo link enviado ao locatário (o token do link é a chave de acesso).
// GET  /api/contrato?t=TOKEN  -> contrato pendente (modelo + dados para pré-visualizar) ou assinado (texto final + registro)
// POST /api/contrato { t, nome, cpf, rg, endereco, aceite, assinatura }  -> assina
// Painel (exige sessão):
// GET  /api/contrato?painel=1                       -> contratos das reservas lançadas no painel
// PUT  /api/contrato { online: id }                 -> gera o contrato de uma reserva online paga
// PUT  /api/contrato { painel: id, inicio, fim, nome, telefone, email, hospedes, total, pago, forma }
//                                                   -> gera ou atualiza (se pendente) o contrato de uma reserva do painel
import { rota, enviar, lerCorpo, consulta, preparar, sql, autenticado } from '../lib/servidor.js';
import { carregarSite } from '../lib/reservas.js';
import { variaveis, prazoAssinatura, cpfValido, fmtCpf, hashContrato, garantirContrato, salvarContratoPainel, reservaDoContrato, PAINEL, digitos } from '../lib/contratos.js';
import '../js/core.js';

const C = globalThis.Sitio;
const TOKEN = /^[\w-]{20,40}$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

async function buscar(token) {
  if (!TOKEN.test(token || '')) return null;
  const [c] = await sql()`SELECT * FROM contratos WHERE token = ${token}`;
  if (!c) return null;
  const r = await reservaDoContrato(c);
  return r ? { c, r } : null;
}

const resumo = (c, r, D) => ({ token: c.token, status: c.status, assinado_em: c.assinado_em, prazo: prazoAssinatura(r, D).toISOString(), codigo: r.codigo });

async function painel(req, res) {
  if (!autenticado(req)) return enviar(res, 401, { erro: 'Sessão expirada. Entre novamente.' });
  const D = await carregarSite();
  if (req.method === 'GET') {
    const linhas = await sql()`SELECT * FROM contratos WHERE reserva_id LIKE ${PAINEL + '%'}`;
    return enviar(res, 200, linhas.filter((c) => c.reserva).map((c) => ({ id: c.reserva_id.slice(PAINEL.length), ...resumo(c, c.reserva, D) })),
      { 'Cache-Control': 'no-store' });
  }
  const b = await lerCorpo(req);
  if (!String(D.contrato.modelo || '').trim()) return enviar(res, 400, { erro: 'Preencha o modelo do contrato em Preços → Contrato de locação.' });
  if (b.online) {
    const [r] = await sql()`SELECT * FROM reservas_online WHERE id = ${String(b.online)}`;
    if (!r) return enviar(res, 404, { erro: 'Reserva não encontrada.' });
    if (r.status !== 'confirmada') return enviar(res, 400, { erro: 'O contrato é gerado só para reservas confirmadas.' });
    const c = await garantirContrato(r, D, true);
    return enviar(res, 200, resumo(c, r, D));
  }
  if (b.painel) {
    const x = {
      inicio: b.inicio, fim: b.fim, nome: String(b.nome || '').trim().slice(0, 120), telefone: digitos(b.telefone).slice(0, 13),
      email: String(b.email || '').trim().slice(0, 160), hospedes: Number(b.hospedes) > 0 ? Math.min(Number(b.hospedes), 999) : null,
      total: Math.max(Number(b.total) || 0, 0), pago: Math.max(Number(b.pago) || 0, 0), forma: String(b.forma || '').trim().slice(0, 120),
    };
    if (!/^[\w-]{4,40}$/.test(String(b.painel))) return enviar(res, 400, { erro: 'Reserva inválida.' });
    if (!DATA.test(x.inicio || '') || !DATA.test(x.fim || '') || !(x.inicio < x.fim)) return enviar(res, 400, { erro: 'Datas inválidas.' });
    if (x.nome.length < 3) return enviar(res, 400, { erro: 'Informe o nome do hóspede.' });
    if (!(x.total > 0)) return enviar(res, 400, { erro: 'Informe o valor total da locação.' });
    try {
      const c = await salvarContratoPainel(String(b.painel), x, D);
      return enviar(res, 200, { id: String(b.painel), ...resumo(c, c.reserva, D) });
    } catch (e) {
      if (e.status) return enviar(res, e.status, { erro: e.message });
      throw e;
    }
  }
  enviar(res, 400, { erro: 'Pedido inválido.' });
}

function resposta(c, r, D) {
  const base = {
    status: c.status, codigo: r.codigo, inicio: r.inicio, fim: r.fim,
    site: { nome: D.site.nome, whatsapp: D.site.whatsapp },
  };
  if (c.status === 'assinado') {
    return { ...base, texto: c.texto, dados: c.dados, assinatura: c.assinatura,
      registro: { assinado_em: c.assinado_em, ip: c.ip, navegador: c.navegador, hash: c.hash } };
  }
  return { ...base, modelo: c.modelo, variaveis: variaveis(r, D, c), prazo: prazoAssinatura(r, D).toISOString(),
    cancelada: r.status === 'cancelada' };
}

export default rota(async (req, res) => {
  await preparar();
  const semCache = { 'Cache-Control': 'no-store' };

  if (req.method === 'PUT' || (req.method === 'GET' && consulta(req).get('painel') === '1')) return painel(req, res);

  if (req.method === 'GET') {
    const x = await buscar(consulta(req).get('t'));
    if (!x) return enviar(res, 404, { erro: 'Contrato não encontrado. Confira o link recebido.' }, semCache);
    return enviar(res, 200, resposta(x.c, x.r, await carregarSite()), semCache);
  }

  if (req.method === 'POST') {
    const b = await lerCorpo(req);
    const x = await buscar(b.t);
    if (!x) return enviar(res, 404, { erro: 'Contrato não encontrado. Confira o link recebido.' });
    const { c, r } = x;
    if (c.status === 'assinado') return enviar(res, 409, { erro: 'Este contrato já foi assinado.' });
    if (r.status === 'cancelada') return enviar(res, 409, { erro: 'Esta reserva foi cancelada.' });

    const dados = {
      nome: String(b.nome || '').trim().slice(0, 120),
      cpf: fmtCpf(b.cpf),
      rg: String(b.rg || '').trim().slice(0, 30),
      endereco: String(b.endereco || '').trim().slice(0, 250),
    };
    if (dados.nome.length < 5 || !/\s/.test(dados.nome)) return enviar(res, 400, { erro: 'Informe seu nome completo.' });
    if (!cpfValido(b.cpf)) return enviar(res, 400, { erro: 'CPF inválido. Confira os números.' });
    if (dados.endereco.length < 10) return enviar(res, 400, { erro: 'Informe seu endereço completo (rua, número, bairro e cidade).' });
    if (b.aceite !== true) return enviar(res, 400, { erro: 'Marque que leu e concorda com o contrato.' });
    const assinatura = String(b.assinatura || '');
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(assinatura) || assinatura.length < 1500) return enviar(res, 400, { erro: 'Faça sua assinatura no quadro.' });
    if (assinatura.length > 400000) return enviar(res, 400, { erro: 'Assinatura muito grande. Limpe o quadro e assine de novo.' });

    const D = await carregarSite();
    const quando = new Date();
    const texto = C.contratoTexto(c.modelo, variaveis(r, D, c, dados, quando));
    const ip = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || '').split(',')[0].trim();
    const navegador = String(req.headers['user-agent'] || '').slice(0, 300);
    const hash = hashContrato({ texto, dados, assinatura, assinado_em: quando.toISOString(), ip, codigo: r.codigo });

    const [nova] = await sql()`UPDATE contratos SET status = 'assinado', texto = ${texto}, dados = ${JSON.stringify(dados)}::jsonb,
      assinatura = ${assinatura}, hash = ${hash}, ip = ${ip}, navegador = ${navegador}, assinado_em = ${quando.toISOString()}
      WHERE id = ${c.id} AND status = 'pendente' RETURNING *`;
    if (!nova) return enviar(res, 409, { erro: 'Este contrato já foi assinado.' });
    return enviar(res, 200, resposta(nova, r, D), semCache);
  }

  enviar(res, 405, { erro: 'Método não permitido.' });
});
