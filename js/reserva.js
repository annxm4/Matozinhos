// Página "Minha reserva": consulta por código + telefone e retorno do pagamento da InfinitePay.
(function () {
  const C = window.Sitio, esc = C.esc;
  const $ = (s) => document.querySelector(s);
  // A InfinitePay pode anexar os parâmetros com um segundo "?" (reserva.html?c=X?slug=...): trata "?" como "&".
  const qs = new URLSearchParams(location.search.replace(/\?/g, '&'));
  const retorno = { slug: qs.get('slug'), transaction_nsu: qs.get('transaction_nsu') };

  let salvo = {};
  try { salvo = JSON.parse(localStorage.getItem('sitio_reserva')) || {}; } catch (e) { /* sem dados */ }
  const codigo = ((qs.get('c') || salvo.codigo || '').toUpperCase().match(/^[A-Z0-9]+/) || [''])[0];
  $('#mrCodigo').value = codigo;
  if (salvo.codigo === codigo && salvo.telefone) $('#mrTel').value = salvo.telefone;

  const ST = {
    confirmada: ['Reserva confirmada', 'ok', 'Pagamento recebido. Suas datas estão garantidas!'],
    aguardando: ['Aguardando pagamento', 'espera', 'Suas datas estão reservadas por alguns minutos. Conclua o pagamento para garantir.'],
    expirada: ['Prazo de pagamento encerrado', 'ruim', 'O pagamento não foi concluído a tempo e as datas foram liberadas. Faça uma nova reserva no site.'],
    cancelada: ['Reserva cancelada', 'ruim', 'Esta reserva foi cancelada. Em caso de dúvida, fale com o proprietário.'],
    conflito: ['Pagamento recebido – aguardando proprietário', 'espera', 'Recebemos seu pagamento, mas as datas precisam ser confirmadas pelo proprietário. Ele vai falar com você.'],
  };
  const MODO = { sinal: 'Sinal', caucao: 'Caução', integral: 'Valor total' };

  async function buscar(tentativa = 0) {
    const bt = $('#mrBuscar');
    bt.disabled = true; bt.textContent = 'Buscando…'; $('#mrErro').textContent = '';
    try {
      const r = await fetch('api/minha-reserva', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: $('#mrCodigo').value, telefone: $('#mrTel').value, ...retorno }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erro || 'Não foi possível consultar agora.');
      try { localStorage.setItem('sitio_reserva', JSON.stringify({ codigo: j.codigo, telefone: $('#mrTel').value })); } catch (e) { /* ok */ }
      mostrar(j);
      // Voltou do pagamento mas a confirmação ainda não chegou: tenta mais algumas vezes.
      if (j.status === 'aguardando' && retorno.slug && tentativa < 4) setTimeout(() => buscar(tentativa + 1), 4000);
    } catch (e) {
      $('#mrErro').textContent = e.message;
    } finally { bt.disabled = false; bt.textContent = 'Ver reserva'; }
  }

  function mostrar(r) {
    const [titulo, cls, texto] = ST[r.status] || [r.status, 'espera', ''];
    const S = r.site, zap = (S.whatsapp || '').replace(/\D/g, '');
    const linkZap = zap ? `https://wa.me/${zap.length <= 11 ? '55' + zap : zap}?text=${encodeURIComponent(`Olá! Sou ${r.nome}, reserva ${r.codigo} (${C.brData(r.inicio)} a ${C.brData(r.fim)}).`)}` : '';
    const pg = r.pagamento ? ` (${r.pagamento.metodo === 'pix' ? 'Pix' : 'cartão'}${r.pagamento.parcelas > 1 ? ` em ${r.pagamento.parcelas}x` : ''})` : '';
    $('#mrTitulo').textContent = `Olá, ${r.nome.split(' ')[0]}!`;
    $('#fBusca').hidden = true;
    const el = $('#mrResultado');
    el.hidden = false;
    el.innerHTML = `
      <div class="mr-status mr-${cls}"><strong>${esc(titulo)}</strong><p>${esc(texto)}</p></div>
      <dl class="mr-dados">
        <dt>Código</dt><dd><b class="mr-cod">${esc(r.codigo)}</b></dd>
        <dt>Entrada</dt><dd>${C.dataLonga(r.inicio)}${S.checkin ? ` · ${esc(S.checkin)}` : ''}</dd>
        <dt>Saída</dt><dd>${C.dataLonga(r.fim)}${S.checkout ? ` · ${esc(S.checkout)}` : ''}</dd>
        <dt>Estadia</dt><dd>${r.noites} noite${r.noites > 1 ? 's' : ''}${r.hospedes ? ` · ${r.hospedes} pessoas` : ''}</dd>
        <dt>Valor da estadia</dt><dd>${C.moeda(r.total)}</dd>
        <dt>${MODO[r.modo]} online</dt><dd>${C.moeda(r.valorCobrado)}</dd>
        <dt>Pago</dt><dd>${C.moeda(r.valorPago)}${pg}</dd>
        ${['confirmada', 'conflito'].includes(r.status) && r.restante > 0 ? `<dt>A pagar até a entrada</dt><dd><b>${C.moeda(r.restante)}</b></dd>` : ''}
        ${r.modo === 'caucao' ? '<dt>Caução</dt><dd>Devolvida após a saída</dd>' : (S.caucao > 0 ? `<dt>Caução</dt><dd>${C.moeda(S.caucao)}, devolvida na saída</dd>` : '')}
        ${S.endereco ? `<dt>Endereço</dt><dd>${esc(S.endereco)} – ${esc(S.cidade)}</dd>` : ''}
      </dl>
      ${r.pagarUrl ? `<a class="btn btn-destaque btn-cheio" href="${esc(r.pagarUrl)}">Concluir pagamento</a>` : ''}
      ${linkZap ? `<a class="btn btn-linha btn-cheio" target="_blank" rel="noopener" href="${esc(linkZap)}">Falar com o proprietário</a>` : ''}
      ${S.politica ? `<div class="politica"><strong>Política de cancelamento</strong><p>${esc(S.politica)}</p></div>` : ''}
      ${S.regras && S.regras.length ? `<div class="politica"><strong>Regras da casa</strong><ul>${S.regras.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      <p class="dica-pag">Guarde o código <b>${esc(r.codigo)}</b> para consultar esta página depois.</p>
      <button type="button" class="link" id="mrOutra">Consultar outra reserva</button>`;
    $('#mrOutra').onclick = () => { el.hidden = true; $('#fBusca').hidden = false; $('#mrTitulo').textContent = 'Consulte sua reserva'; $('#mrCodigo').value = ''; $('#mrTel').value = ''; };
    if (retorno.slug) history.replaceState(null, '', location.pathname + '?c=' + r.codigo);
  }

  $('#fBusca').addEventListener('submit', (e) => { e.preventDefault(); buscar(); });
  if ($('#mrCodigo').value && $('#mrTel').value) buscar();
})();
