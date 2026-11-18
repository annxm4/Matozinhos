// Aviso de pagamento da InfinitePay (webhook). Sem assinatura: cada aviso é conferido com /payment_check.
import { rota, enviar, lerCorpo, preparar } from '../lib/servidor.js';
import { confirmarPagamento } from '../lib/reservas.js';

export default rota(async (req, res) => {
  if (req.method !== 'POST') return enviar(res, 405, { erro: 'Método não permitido.' });
  await preparar();
  const b = await lerCorpo(req);
  console.log('webhook infinitepay', { order_nsu: b.order_nsu, invoice_slug: b.invoice_slug, transaction_nsu: b.transaction_nsu, capture_method: b.capture_method, amount: b.amount, items: b.items });
  const orderNsu = b.order_nsu, slug = b.invoice_slug || b.slug, transacao = b.transaction_nsu;
  if (!slug || !transacao) return enviar(res, 400, { erro: 'Aviso incompleto.' });
  // Com a chave de API o order_nsu é da InfinitePay; o código da reserva vem na descrição do item.
  const desc = (Array.isArray(b.items) ? b.items : []).map((i) => (i && i.description) || '').join(' ');
  const codigo = (/Reserva ([A-Z0-9]{6})\b/.exec(desc) || [])[1];
  try {
    const r = await confirmarPagamento({ orderNsu, slug, transacao, codigo });
    enviar(res, 200, { ok: true, status: r ? r.status : null });
  } catch (e) {
    console.error(e);
    enviar(res, 400, { erro: 'Falha ao conferir o pagamento.' }); // a InfinitePay tenta de novo
  }
});
