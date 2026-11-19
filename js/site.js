(function () {
  const C = window.Sitio;
  const $ = (s) => document.querySelector(s);
  const esc = C.esc;
  let D, ocup, hoje, base, ci = null, co = null, fotoAtual = 0;
  const LIMITE_MESES = 18;

  fetch('api/dados')
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then((d) => { D = C.normalizar(d); iniciar(); });

  function iniciar() {
    hoje = C.hoje();
    ocup = C.ocupacao(D);
    const [y, m] = hoje.split('-').map(Number);
    base = { y, m };
    const S = D.site;
    document.title = `${S.nome} – aluguel em ${S.cidade}`;
    document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = S[el.dataset.t] || ''; });

    if (D.fotos.length) {
      $('#heroFundo').innerHTML = `<img src="${esc(D.fotos[0].arquivo)}" alt="">`;
      $('#heroFundo').classList.add('com-foto');
    }

    const fatos = [];
    if (S.capacidade) fatos.push(['Capacidade', S.capacidade]);
    if (S.checkin) fatos.push(['Entrada', S.checkin]);
    if (S.checkout) fatos.push(['Saída', S.checkout]);
    if (D.precos.minNoites > 1) fatos.push(['Estadia mínima', D.precos.minNoites + ' noites']);
    S.comodidades.slice(0, Math.max(0, 4 - fatos.length)).forEach((c) => fatos.push([c.icone, c.nome]));
    $('#fatos').innerHTML = fatos.map(([a, b]) => `<li><span>${esc(a)}</span><strong>${esc(b)}</strong></li>`).join('');

    $('#listaComodidades').innerHTML = S.comodidades.map((c) => `
      <li><span class="ico" aria-hidden="true">${esc(c.icone)}</span>
      <div><strong>${esc(c.nome)}</strong>${c.detalhe ? `<small>${esc(c.detalhe)}</small>` : ''}</div></li>`).join('');

    galeria();

    if (S.regras.length) {
      $('#regras').hidden = false;
      $('#listaRegras').innerHTML = S.regras.map((r) => `<li>${esc(r)}</li>`).join('');
    }

    $('#enderecoTxt').textContent = S.endereco || 'O endereço completo é enviado na confirmação da reserva.';
    const local = C.localMapa(S);
    $('#mapa').src = C.mapaEmbed(local.q);
    $('#btnRota').href = C.mapaLink(local.q);
    if (zap()) { $('#btnZapLocal').href = linkZap(`Olá! Gostaria de saber mais sobre o ${S.nome}.`); $('#btnZapLocal').target = '_blank'; }

    $('#mesAnt').onclick = () => mover(-1);
    $('#mesProx').onclick = () => mover(1);
    $('#meses').onclick = (e) => { const b = e.target.closest('button[data-d]'); if (b) escolher(b.dataset.d); };
    agenda();
    resumo();

    const topo = $('#topo');
    const rolar = () => topo.classList.toggle('solido', window.scrollY > 40);
    window.addEventListener('scroll', rolar, { passive: true }); rolar();
  }

  /* ---------- Fotos ---------- */
  function galeria() {
    const g = $('#galeria');
    if (!D.fotos.length) {
      g.classList.add('vazia');
      g.innerHTML = '<div class="sem-fotos"><span aria-hidden="true">📷</span><strong>Fotos em breve</strong><p>Estamos preparando as fotos do sítio. Enquanto isso, fale com a gente para receber imagens pelo WhatsApp.</p></div>';
      return;
    }
    g.innerHTML = D.fotos.map((f, i) => `
      <button type="button" data-i="${i}"><img src="${esc(f.arquivo)}" alt="${esc(f.legenda || 'Foto do sítio')}" loading="lazy">
      ${f.legenda ? `<span>${esc(f.legenda)}</span>` : ''}</button>`).join('');
    g.onclick = (e) => { const b = e.target.closest('button[data-i]'); if (b) abrirFoto(+b.dataset.i); };
    $('#visorX').onclick = () => $('#visor').close();
    $('#visorAnt').onclick = () => abrirFoto(fotoAtual - 1);
    $('#visorProx').onclick = () => abrirFoto(fotoAtual + 1);
    $('#visor').addEventListener('click', (e) => { if (e.target.id === 'visor') e.target.close(); });
    $('#visor').addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') abrirFoto(fotoAtual - 1);
      if (e.key === 'ArrowRight') abrirFoto(fotoAtual + 1);
    });
  }
  function abrirFoto(i) {
    const n = D.fotos.length;
    fotoAtual = (i + n) % n;
    const f = D.fotos[fotoAtual];
    $('#visorImg').src = f.arquivo;
    $('#visorImg').alt = f.legenda || 'Foto do sítio';
    $('#visorLeg').textContent = f.legenda || '';
    if (!$('#visor').open) $('#visor').showModal();
  }

  /* ---------- Agenda ---------- */
  function mover(n) {
    const d = new Date(Date.UTC(base.y, base.m - 1 + n, 1));
    base = { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
    agenda();
  }
  function distMeses() {
    const [y, m] = hoje.split('-').map(Number);
    return (base.y - y) * 12 + (base.m - m);
  }
  // Um dia pode ser saída se todas as noites desde a entrada estiverem livres
  // (e o próprio dia, quando o dia da saída fica bloqueado para limpeza).
  function podeSair(d) {
    if (!ci || co || d <= ci) return false;
    return !C.conflito(ocup, ci, d, D.precos.bloquearSaida);
  }
  function escolher(d) {
    if (ci && !co && podeSair(d)) co = d;
    else if (!ocup.has(d) && d >= hoje) { ci = d; co = null; }
    agenda(); resumo();
  }
  function agenda() {
    $('#mesAnt').disabled = distMeses() <= 0;
    $('#mesProx').disabled = distMeses() >= LIMITE_MESES;
    let html = '';
    for (let k = 0; k < 2; k++) {
      const dt = new Date(Date.UTC(base.y, base.m - 1 + k, 1));
      const y = dt.getUTCFullYear(), m = dt.getUTCMonth() + 1;
      html += `<div class="mes"><h3>${C.MESES[m - 1]} <span>${y}</span></h3><div class="grade">` +
        C.DIAS_C.map((x) => `<span class="dsem">${x}</span>`).join('') +
        C.gradeMes(y, m).map(celula).join('') + '</div></div>';
    }
    $('#meses').innerHTML = html;
  }
  function celula(d) {
    if (!d) return '<span></span>';
    const dia = +d.slice(8);
    const passado = d < hoje, ocupado = ocup.has(d);
    const p = C.precoNoite(D, d);
    const cls = ['dia'];
    let clicavel = !passado && !ocupado;
    if (passado) cls.push('passado');
    else if (ocupado) { cls.push('ocupado'); if (podeSair(d)) { clicavel = true; cls.push('saida-ok'); } }
    if (p.tipo !== 'semana' && !passado && !ocupado) cls.push('especial');
    if (d === ci) cls.push('sel', 'sel-ini');
    if (co && d === co) cls.push('sel', 'sel-fim');
    if (ci && co && d > ci && d < co) cls.push('entre');
    const preco = passado || ocupado ? '' : (p.valor > 0 ? C.moeda(p.valor).replace(/\s/g, ' ') : 'consulte');
    const titulo = `${C.brData(d)}${ocupado ? ' – ocupado' : ''}${p.tipo !== 'semana' ? ' – ' + p.rotulo : ''}`;
    return `<button type="button" class="${cls.join(' ')}" data-d="${d}" title="${esc(titulo)}" ${clicavel ? '' : 'disabled'}>
      <b>${dia}</b><small>${esc(preco)}</small></button>`;
  }

  /* ---------- Resumo e contato ---------- */
  const zap = () => (D.site.whatsapp || '').replace(/\D/g, '');
  function linkZap(msg) {
    let n = zap();
    if (n.length <= 11) n = '55' + n;
    return `https://wa.me/${n}?text=${encodeURIComponent(msg)}`;
  }
  function resumo() {
    const el = $('#resumo');
    const P = D.precos;
    if (!ci) {
      el.innerHTML = `<h3>Sua reserva</h3><p class="dica">Escolha o dia de entrada no calendário.</p>${extras()}`;
      return;
    }
    if (!co) {
      el.innerHTML = `<h3>Sua reserva</h3>
        <dl><dt>Entrada</dt><dd>${C.dataLonga(ci)}</dd></dl>
        <p class="dica">Agora escolha o dia de saída.</p>
        <button type="button" class="link" id="limpar">Limpar seleção</button>${extras()}`;
      $('#limpar').onclick = limpar;
      return;
    }
    const o = C.orcamento(D, ci, co);
    const curto = o.n < o.minNoites;
    let linhas = '';
    if (!o.consulta) {
      if (o.semanas) linhas += `<li><span>${o.semanas} semana${o.semanas > 1 ? 's' : ''} (pacote)</span><span>${C.moeda(o.semanas * P.semanal)}</span></li>`;
      linhas += o.avulsas.map((x) => `<li><span>${C.dataLonga(x.data)}${x.tipo !== 'semana' ? ` <em>${esc(x.rotulo)}</em>` : ''}</span><span>${C.moeda(x.valor)}</span></li>`).join('');
      if (o.limpeza) linhas += `<li><span>Taxa de limpeza</span><span>${C.moeda(o.limpeza)}</span></li>`;
    }
    const msg = [
      `Olá! Gostaria de reservar o ${D.site.nome}.`,
      `Entrada: ${C.dataLonga(ci)}`,
      `Saída: ${C.dataLonga(co)} (${o.n} noite${o.n > 1 ? 's' : ''})`,
      o.consulta ? '' : `Valor no site: ${C.moeda(o.total)}`,
    ].filter(Boolean).join('\n');
    el.innerHTML = `<h3>Sua reserva</h3>
      <dl><dt>Entrada</dt><dd>${C.dataLonga(ci)}</dd><dt>Saída</dt><dd>${C.dataLonga(co)}</dd>
      <dt>Estadia</dt><dd>${o.n} noite${o.n > 1 ? 's' : ''}</dd></dl>
      ${curto ? `<p class="aviso">Para estas datas a estadia mínima é de ${o.minNoites} noites.</p>` : ''}
      ${o.consulta ? '<p class="dica">Valor sob consulta para estas datas.</p>'
        : `<ul class="linhas">${linhas}</ul><p class="total"><span>Total</span><strong>${C.moeda(o.total)}</strong></p>`}
      ${P.caucao > 0 ? `<p class="dica">Caução de ${C.moeda(P.caucao)}, devolvida na saída.</p>` : ''}
      ${podeOnline(o, curto) ? '<button type="button" class="btn btn-destaque btn-cheio" id="btReservar">Reservar e pagar online</button>' : ''}
      ${curto ? '' : (zap()
        ? `<a class="btn btn-zap" target="_blank" rel="noopener" href="${esc(linkZap(msg))}">Pedir reserva pelo WhatsApp</a>
           <p class="dica">A reserva só vale depois da confirmação do proprietário.</p>`
        : '<p class="dica">O contato para reservas será divulgado em breve.</p>')}
      <button type="button" class="link" id="limpar">Limpar seleção</button>`;
    $('#limpar').onclick = limpar;
    if ($('#btReservar')) $('#btReservar').onclick = () => abrirReservar(o);
  }

  /* ---------- Reserva online ---------- */
  const podeOnline = (o, curto) => D.precos.online && D.precos.online.ativo && !o.consulta && !curto && C.modosOnline(D, o).length > 0;
  function abrirReservar(o) {
    const dlg = $('#dlgReservar');
    $('#rvDatas').textContent = `${C.dataLonga(ci)} → ${C.dataLonga(co)} · ${o.n} noite${o.n > 1 ? 's' : ''} · ${C.moeda(o.total)}`;
    const modos = C.modosOnline(D, o);
    $('#rvModos').innerHTML = '<legend>Como prefere pagar?</legend>' + modos.map((m, i) => `
      <label class="modo"><input type="radio" name="rvModo" value="${m.modo}" ${i === 0 ? 'checked' : ''}>
        <span><strong>${esc(m.rotulo)} · ${C.moeda(m.valor)}</strong><small>${esc(m.detalhe)}</small></span></label>`).join('');
    // Mostra só o que o proprietário preencheu, e o aceite cita só o que aparece na tela.
    const politica = String(D.precos.online.politica || '').trim(), regras = (D.site.regras || []).filter(Boolean);
    const blocos = [];
    if (politica) blocos.push(`<strong>Política de cancelamento</strong><p>${esc(politica)}</p>`);
    if (regras.length) blocos.push(`<strong>Regras da casa</strong><ul>${regras.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`);
    $('#rvPolitica').hidden = !blocos.length;
    $('#rvPolitica').innerHTML = blocos.join('');
    const itens = [regras.length && 'as regras da casa', politica && 'a política de cancelamento'].filter(Boolean);
    $('#rvAceiteL').hidden = !itens.length;
    $('#rvAceite').required = !!itens.length;
    $('#rvAceiteTxt').textContent = `Li e aceito ${itens.join(' e ')}.`;
    $('#rvErro').textContent = '';
    try { const s = JSON.parse(localStorage.getItem('sitio_cliente')) || {}; ['Nome', 'Tel', 'Email'].forEach((k) => { if (s[k] && !$('#rv' + k).value) $('#rv' + k).value = s[k]; }); } catch (e) { /* sem dados salvos */ }
    dlg.showModal();
  }
  $('#rvFechar').onclick = () => $('#dlgReservar').close();
  $('#fReservar').addEventListener('submit', async (e) => {
    e.preventDefault();
    const bt = $('#rvPagar'), modo = (document.querySelector('input[name=rvModo]:checked') || {}).value;
    bt.disabled = true; bt.textContent = 'Reservando…'; $('#rvErro').textContent = '';
    const corpo = { inicio: ci, fim: co, modo, nome: $('#rvNome').value, telefone: $('#rvTel').value,
      email: $('#rvEmail').value, hospedes: $('#rvHosp').value, obs: $('#rvObs').value };
    try {
      const r = await fetch('api/reservar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erro || 'Não foi possível reservar agora. Tente de novo.');
      try {
        localStorage.setItem('sitio_cliente', JSON.stringify({ Nome: corpo.nome, Tel: corpo.telefone, Email: corpo.email }));
        localStorage.setItem('sitio_reserva', JSON.stringify({ codigo: j.codigo, telefone: corpo.telefone }));
      } catch (x) { /* navegador sem armazenamento */ }
      bt.textContent = 'Abrindo o pagamento…';
      location.href = j.url;
    } catch (err) {
      $('#rvErro').textContent = err.message;
      bt.disabled = false; bt.textContent = 'Ir para o pagamento';
      if (/reservadas/.test(err.message)) recarregarOcupacao();
    }
  });
  function recarregarOcupacao() {
    fetch('api/dados', { cache: 'no-store' }).then((r) => r.json()).then((d) => { D = C.normalizar(d); ocup = C.ocupacao(D); agenda(); }).catch(() => {});
  }

  function extras() {
    const P = D.precos, x = [];
    if (P.semanal > 0) x.push(`Pacote de 7 noites: ${C.moeda(P.semanal)}`);
    if (P.limpeza > 0) x.push(`Taxa de limpeza: ${C.moeda(P.limpeza)}`);
    if (P.minNoites > 1) x.push(`Estadia mínima: ${P.minNoites} noites`);
    return x.length ? `<ul class="extras">${x.map((t) => `<li>${t}</li>`).join('')}</ul>` : '';
  }
  function limpar() { ci = co = null; agenda(); resumo(); }
})();
