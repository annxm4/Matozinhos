// Reservas online no painel (exige sessão).
// GET   /api/reservas                         -> lista
// PATCH /api/reservas { id, acao: 'confirmar' | 'cancelar' }
import { rota, enviar, lerCorpo, autenticado, preparar, sql } from '../lib/servidor.js';
import { statusEfetivo } from '../lib/reservas.js';

export default rota(async (req, res) => {
  if (!autenticado(req)) return enviar(res, 401, { erro: 'Sessão expirada. Entre novamente.' });
  await preparar();
  const q = sql();

  if (req.method === 'GET') {
    const linhas = await q`SELECT id, codigo, inicio, fim, status, nome, telefone, email, hospedes, obs, modo,
      total, valor_cobrado, valor_pago, pagamento, expira_em, criado FROM reservas_online
      WHERE fim >= to_char(now() - interval '180 days', 'YYYY-MM-DD') ORDER BY inicio`;
    return enviar(res, 200, linhas.map((r) => ({
      ...r, status: statusEfetivo(r), total: Number(r.total), valor_cobrado: Number(r.valor_cobrado), valor_pago: Number(r.valor_pago),
    })), { 'Cache-Control': 'no-store' });
  }

  if (req.method === 'PATCH') {
    const { id, acao } = await lerCorpo(req);
    let linhas;
    if (acao === 'confirmar') {
      // Pagamento recebido por fora (Pix direto, dinheiro) ou conflito resolvido pelo proprietário.
      linhas = await q`UPDATE reservas_online SET status = 'confirmada',
        valor_pago = GREATEST(valor_pago, valor_cobrado), atualizado = now() WHERE id = ${id} RETURNING id`;
    } else if (acao === 'cancelar') {
      linhas = await q`UPDATE reservas_online SET status = 'cancelada', atualizado = now() WHERE id = ${id} RETURNING id`;
    } else return enviar(res, 400, { erro: 'Ação inválida.' });
    if (!linhas.length) return enviar(res, 404, { erro: 'Reserva não encontrada.' });
    return enviar(res, 200, { ok: true });
  }

  enviar(res, 405, { erro: 'Método não permitido.' });
});
