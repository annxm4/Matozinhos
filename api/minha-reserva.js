// POST /api/minha-reserva  { codigo, telefone, slug?, transaction_nsu? }
// O cliente consulta a própria reserva com o código + telefone usado na reserva.
import { rota, enviar, lerCorpo, preparar, sql } from '../lib/servidor.js';
import { C, carregarSite, digitos, statusEfetivo, confirmarPagamento } from '../lib/reservas.js';

export default rota(async (req, res) => {
  if (req.method !== 'POST') return enviar(res, 405, { erro: 'Método não permitido.' });
  await preparar();
  const b = await lerCorpo(req);
  const codigo = String(b.codigo || '').trim().toUpperCase();
  const tel = digitos(b.telefone);
  let [r] = codigo ? await sql()`SELECT * FROM reservas_online WHERE codigo = ${codigo}` : [];
  if (!r || tel.length < 8 || r.telefone.slice(-8) !== tel.slice(-8)) {
    await new Promise((ok) => setTimeout(ok, 900));
    return enviar(res, 404, { erro: 'Reserva não encontrada. Confira o código e o telefone usados na reserva.' });
  }
  // Voltou do pagamento: confere na hora, sem esperar o aviso da InfinitePay.
  if (r.status === 'aguardando' && b.slug && b.transaction_nsu) {
    try { r = (await confirmarPagamento({ id: r.id, slug: b.slug, transacao: b.transaction_nsu })) || r; } catch (e) { console.error(e); }
  }
  const D = await carregarSite();
  const S = D.site, st = statusEfetivo(r);
  const total = Number(r.total), pago = Number(r.valor_pago);
  enviar(res, 200, {
    codigo: r.codigo, status: st, inicio: r.inicio, fim: r.fim, noites: C.noites(r.inicio, r.fim),
    nome: r.nome, hospedes: r.hospedes, modo: r.modo,
    total, valorCobrado: Number(r.valor_cobrado), valorPago: pago,
    restante: r.modo === 'caucao' ? total : Math.max(0, total - pago),
    pagarUrl: st === 'aguardando' ? r.checkout_url : null,
    expira: r.expira_em,
    pagamento: r.pagamento ? { metodo: r.pagamento.capture_method, parcelas: r.pagamento.installments } : null,
    site: {
      nome: S.nome, cidade: S.cidade, whatsapp: S.whatsapp,
      endereco: st === 'confirmada' ? S.endereco : '', checkin: S.checkin, checkout: S.checkout, regras: S.regras,
      caucao: D.precos.caucao, politica: D.precos.online.politica,
    },
  }, { 'Cache-Control': 'no-store' });
});
