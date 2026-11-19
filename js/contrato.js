// Página do contrato: documento em folha inteira, quadros de assinatura no fim e formulário para assinar.
(function () {
  const C = window.Sitio, esc = C.esc;
  const $ = (s) => document.querySelector(s);
  const app = $('#ctApp');
  const token = new URLSearchParams(location.search).get('t') || '';
  let d = null, desenhou = false;

  const dataHora = (iso) => (iso ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)) : '—');
  const mascaraCpf = (v) => v.replace(/\D/g, '').slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  const estado = (msg) => { app.innerHTML = `<div class="ct-estado"><p>${esc(msg)}</p></div>`; };

  // Texto do contrato -> documento: título, subtítulo, cláusulas, parágrafos, itens numerados e local/data.
  function documento(texto) {
    const blocos = String(texto || '').replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.split('\n').map((l) => l.trim()).filter(Boolean)).filter((b) => b.length);
    const titulo = (l) => /^CLÁUSULA\b/i.test(l) || (l.length >= 8 && l.length <= 90 && /\s/.test(l) && /[A-ZÀ-Ú]/.test(l) && !/[a-zà-ú]/.test(l));
    const rotulo = (l) => {
      const m = /^([A-ZÀ-Ú][A-ZÀ-Ú\s]{2,30}):\s*(.*)$/.exec(l);
      return m ? `<b>${esc(m[1])}:</b> ${esc(m[2])}` : esc(l);
    };
    let html = '';
    blocos.forEach((linhas, i) => {
      linhas.forEach((l, j) => {
        if (i === 0 && j === 0) html += `<h1>${esc(l)}</h1>`;
        else if (i === 0) html += `<p class="ct-sub">${esc(l)}</p>`;
        else if (titulo(l)) html += `<h3>${esc(l)}</h3>`;
        else if (/^\d+[.)]\s/.test(l)) html += `<p class="ct-item">${esc(l)}</p>`;
        else if (i === blocos.length - 1 && linhas.length === 1 && l.length < 90) html += `<p class="ct-local">${esc(l)}</p>`;
        else html += `<p>${rotulo(l)}</p>`;
      });
    });
    return html;
  }

  function assinaturas() {
    const loc = d.locador || {}, assinado = d.status === 'assinado';
    return `<div class="ct-assinaturas">
      <div class="ct-assin"><h4>Locador</h4>
        <div class="ct-assin-nome">${esc(loc.nome || '—')}</div>
        ${loc.documento ? `<small>CPF/CNPJ ${esc(loc.documento)}</small>` : ''}
        <small>Contrato emitido eletronicamente em ${dataHora(d.emitido_em)}</small></div>
      <div class="ct-assin"><h4>Locatário</h4>
        ${assinado ? `<img src="${esc(d.assinatura)}" alt="Assinatura de ${esc(d.dados.nome)}">
          <div class="ct-assin-nome">${esc(d.dados.nome)}</div>
          <small>CPF ${esc(d.dados.cpf)}</small>
          <small>Assinado eletronicamente em ${dataHora(d.registro.assinado_em)} · IP ${esc(d.registro.ip || '—')}</small>
          <small>Dispositivo: ${esc(d.registro.navegador || '—')}</small>`
        : '<div class="ct-pendente">Aguardando assinatura</div>'}</div>
    </div>
    ${assinado ? `<div class="ct-hash">Código de verificação do documento (SHA-256): ${esc(d.registro.hash)}</div>` : ''}`;
  }

  function aviso() {
    if (d.status === 'assinado') {
      return d.integro === false
        ? '<div class="ct-aviso ruim">⚠ O texto guardado não confere com o código de verificação. Fale com o proprietário.</div>'
        : `<div class="ct-aviso ok">✅ Contrato assinado em ${dataHora(d.registro.assinado_em)}. Guarde uma cópia: use o botão <b>Imprimir / salvar PDF</b>.</div>`;
    }
    if (d.cancelada) return '<div class="ct-aviso ruim">Esta reserva foi cancelada. O contrato não pode mais ser assinado.</div>';
    const atrasado = new Date(d.prazo) < new Date();
    return atrasado
      ? `<div class="ct-aviso ruim">⏰ O prazo para assinar era ${dataHora(d.prazo)}. Assine agora: a entrada no imóvel depende do contrato assinado.</div>`
      : `<div class="ct-aviso">📄 Leia o contrato com atenção. No fim da página, preencha seus dados e assine na tela. Prazo: até <b>${dataHora(d.prazo)}</b>.</div>`;
  }

  // Na pré-visualização, o que o locatário digita já aparece no texto (o servidor refaz tudo ao assinar).
  function textoAtual() {
    if (d.status === 'assinado') return d.texto;
    const v = { ...d.variaveis };
    const nome = $('#aNome') && $('#aNome').value.trim();
    if (nome) v.locatario_nome = nome;
    if ($('#aCpf')) { v.locatario_cpf = $('#aCpf').value.trim(); v.locatario_rg = $('#aRg').value.trim(); v.locatario_endereco = $('#aEnd').value.trim(); }
    return C.contratoTexto(d.modelo, v);
  }

  function mostrar() {
    const assinado = d.status === 'assinado', pode = !assinado && !d.cancelada;
    document.title = `Contrato · Reserva ${d.codigo}`;
    $('#ctNumero').textContent = `Reserva ${d.codigo}`;
    $('#ctMarca').textContent = d.site.nome || 'Início';
    app.innerHTML = `
      ${aviso()}
      <article class="ct-papel"><div class="ct-doc" id="ctDoc"></div>${assinaturas()}</article>
      ${pode ? `
      <section class="ct-assinar" id="ctAssinar">
        <h2>Assinatura eletrônica</h2>
        <p class="sub">Preencha seus dados (eles entram no contrato acima) e assine no quadro. Registramos data, hora, IP e dispositivo como prova da assinatura.</p>
        <div class="ct-linha">
          <label>Nome completo<input type="text" id="aNome" maxlength="120" autocomplete="name" value="${esc(d.variaveis.locatario_nome || '')}"></label>
          <label>CPF<input type="text" id="aCpf" maxlength="14" inputmode="numeric" placeholder="000.000.000-00" autocomplete="off"></label>
        </div>
        <div class="ct-linha">
          <label>Endereço completo<input type="text" id="aEnd" maxlength="250" placeholder="Rua, número, bairro, cidade – UF" autocomplete="street-address"></label>
          <label>RG (opcional)<input type="text" id="aRg" maxlength="30" autocomplete="off"></label>
        </div>
        <span class="ct-rot">Assinatura <small>(desenhe com o dedo ou o mouse)</small></span>
        <div class="ct-quadro"><canvas id="aCanvas" aria-label="Quadro de assinatura"></canvas><div class="ct-dica" id="aDica">Assine aqui</div><button type="button" class="ct-limpar" id="aLimpar">Limpar</button></div>
        <label class="ct-aceite"><input type="checkbox" id="aAceite"><span>Li e concordo com todas as cláusulas deste contrato e reconheço a validade desta assinatura eletrônica.</span></label>
        <button type="button" class="btn btn-destaque btn-cheio" id="aAssinar" disabled>Assinar contrato</button>
        <p class="erro" id="aErro" role="alert"></p>
        <p class="ct-lgpd">Seus dados (nome, CPF, RG, endereço, assinatura, data, hora e IP) são usados apenas para este contrato, conforme a LGPD.</p>
      </section>` : ''}
      <div class="ct-acoes"><button type="button" class="btn btn-linha" id="ctImprimir">🖨 Imprimir / salvar PDF</button></div>`;
    $('#ctDoc').innerHTML = documento(textoAtual());
    $('#ctImprimir').onclick = () => window.print();
    if (pode) ligarAssinatura();
  }

  function ligarAssinatura() {
    const cv = $('#aCanvas'), ctx = cv.getContext('2d'), dica = $('#aDica'), bt = $('#aAssinar'), aceite = $('#aAceite');
    let ativo = false, ultimo = null;
    const atualizar = () => { bt.disabled = !(desenhou && aceite.checked); };
    function ajustar() {
      const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1b2a4a';
      desenhou = false; dica.style.display = ''; atualizar();
    }
    const ponto = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    cv.addEventListener('pointerdown', (e) => { e.preventDefault(); cv.setPointerCapture(e.pointerId); ativo = true; ultimo = ponto(e); });
    cv.addEventListener('pointermove', (e) => {
      if (!ativo) return;
      const p = ponto(e);
      ctx.beginPath(); ctx.moveTo(ultimo.x, ultimo.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      ultimo = p;
      if (!desenhou) { desenhou = true; dica.style.display = 'none'; atualizar(); }
    });
    ['pointerup', 'pointercancel'].forEach((t) => cv.addEventListener(t, () => { ativo = false; }));
    $('#aLimpar').onclick = ajustar;
    aceite.addEventListener('change', atualizar);
    let w = window.innerWidth;
    window.addEventListener('resize', () => { if (window.innerWidth !== w) { w = window.innerWidth; if (!desenhou) ajustar(); } });
    ajustar();

    const previa = () => { $('#ctDoc').innerHTML = documento(textoAtual()); };
    ['#aNome', '#aRg', '#aEnd'].forEach((s) => $(s).addEventListener('input', previa));
    $('#aCpf').addEventListener('input', (e) => { e.target.value = mascaraCpf(e.target.value); previa(); });

    bt.addEventListener('click', async () => {
      const erro = $('#aErro');
      erro.textContent = '';
      if (!confirm('Confirmar a assinatura deste contrato?')) return;
      bt.disabled = true; bt.textContent = 'Assinando…';
      try {
        const r = await fetch('api/contrato', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ t: token, nome: $('#aNome').value, cpf: $('#aCpf').value, rg: $('#aRg').value,
            endereco: $('#aEnd').value, aceite: aceite.checked, assinatura: imagemAssinatura(cv) }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.erro || 'Não foi possível assinar agora. Tente de novo.');
        d = j;
        mostrar();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (e) {
        erro.textContent = e.message;
        bt.disabled = false; bt.textContent = 'Assinar contrato';
      }
    });
  }

  // Assinatura em PNG com fundo branco e largura limitada, para não pesar.
  function imagemAssinatura(cv) {
    const out = document.createElement('canvas'), larg = Math.min(cv.width, 900), k = larg / cv.width;
    out.width = larg; out.height = Math.round(cv.height * k);
    const o = out.getContext('2d');
    o.fillStyle = '#fff'; o.fillRect(0, 0, out.width, out.height);
    o.drawImage(cv, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  }

  async function carregar() {
    if (!token) return estado('Link incompleto. Abra o contrato pelo link que você recebeu.');
    try {
      const r = await fetch('api/contrato?t=' + encodeURIComponent(token), { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return estado(j.erro || 'Contrato não encontrado.');
      d = j;
      mostrar();
    } catch (e) { estado('Não foi possível carregar o contrato. Verifique sua conexão e tente de novo.'); }
  }
  carregar();
})();
