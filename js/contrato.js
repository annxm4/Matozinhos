// Página do contrato: o locatário lê, preenche os dados, assina no quadro e baixa a cópia assinada.
(function () {
  const C = window.Sitio, esc = C.esc;
  const $ = (s) => document.querySelector(s);
  const token = new URLSearchParams(location.search).get('t') || '';
  let dados = null, desenhou = false;

  const dataHora = (iso) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'long', timeStyle: 'short' }).format(new Date(iso));
  const mascaraCpf = (v) => v.replace(/\D/g, '').slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');

  async function carregar() {
    try {
      const r = await fetch('api/contrato?t=' + encodeURIComponent(token), { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erro || 'Não foi possível abrir o contrato agora.');
      dados = j;
      mostrar();
    } catch (e) {
      $('#ctTitulo').textContent = 'Contrato não encontrado';
      $('#ctErroGeral').textContent = e.message;
    }
  }

  function status(cls, titulo, texto) {
    const el = $('#ctStatus');
    el.className = 'mr-status mr-' + cls;
    el.innerHTML = `<strong>${esc(titulo)}</strong>${texto ? `<p>${esc(texto)}</p>` : ''}`;
  }

  // Pré-visualização: o modelo é preenchido com o que o locatário digita (o servidor refaz ao assinar).
  function previa() {
    const v = { ...dados.variaveis };
    const nome = $('#ctNome').value.trim(), cpf = $('#ctCpf').value.trim(), rg = $('#ctRg').value.trim(), end = $('#ctEnd').value.trim();
    if (nome) v.locatario_nome = nome;
    v.locatario_cpf = cpf; v.locatario_rg = rg; v.locatario_endereco = end;
    $('#ctTexto').textContent = C.contratoTexto(dados.modelo, v);
  }

  function mostrar() {
    $('#ctConteudo').hidden = false;
    document.title = `Contrato · Reserva ${dados.codigo}`;
    if (dados.status === 'assinado') return mostrarAssinado();
    $('#ctTitulo').textContent = `Reserva ${dados.codigo}`;
    if (dados.cancelada) {
      status('ruim', 'Reserva cancelada', 'Este contrato não pode mais ser assinado.');
      $('#ctTexto').textContent = C.contratoTexto(dados.modelo, dados.variaveis);
      return;
    }
    const atrasado = new Date(dados.prazo) < new Date();
    status('espera', 'Contrato aguardando sua assinatura',
      atrasado ? 'O prazo para assinar já passou. Assine agora para liberar sua entrada.'
        : `Leia com atenção e assine até ${dataHora(dados.prazo)}. A entrada no imóvel depende do contrato assinado.`);
    $('#ctNome').value = dados.variaveis.locatario_nome || '';
    $('#fAssinar').hidden = false;
    previa();
    prepararQuadro();
  }

  function mostrarAssinado() {
    $('#ctTitulo').textContent = 'Contrato assinado';
    status('ok', 'Contrato assinado', `Assinado em ${dataHora(dados.registro.assinado_em)}. Guarde uma cópia.`);
    $('#ctTexto').textContent = dados.texto;
    $('#fAssinar').hidden = true;
    const el = $('#ctAssinado');
    el.hidden = false;
    el.innerHTML = `
      <div class="assinatura-final">
        <img src="${esc(dados.assinatura)}" alt="Assinatura de ${esc(dados.dados.nome)}">
        <p><b>${esc(dados.dados.nome)}</b><br>CPF ${esc(dados.dados.cpf)}<br>Locatário</p>
      </div>
      <div class="registro">
        <strong>Registro da assinatura eletrônica</strong>
        <dl>
          <dt>Reserva</dt><dd>${esc(dados.codigo)}</dd>
          <dt>Assinado por</dt><dd>${esc(dados.dados.nome)} · CPF ${esc(dados.dados.cpf)}</dd>
          <dt>Data e hora</dt><dd>${esc(dataHora(dados.registro.assinado_em))} (horário de Brasília)</dd>
          <dt>Endereço IP</dt><dd>${esc(dados.registro.ip || '—')}</dd>
          <dt>Navegador</dt><dd class="miudo">${esc(dados.registro.navegador || '—')}</dd>
          <dt>Código de verificação (SHA-256)</dt><dd class="miudo hash">${esc(dados.registro.hash)}</dd>
        </dl>
      </div>
      <button type="button" class="btn btn-destaque btn-cheio sem-impressao" id="ctBaixar">Baixar PDF / imprimir</button>
      <p class="dica-pag sem-impressao">No celular, toque em “Baixar PDF” e escolha “Salvar como PDF”.</p>`;
    $('#ctBaixar').onclick = () => window.print();
  }

  /* ---------- Quadro de assinatura ---------- */
  function prepararQuadro() {
    const cv = $('#ctCanvas'), ctx = cv.getContext('2d');
    let desenhando = false, ultimo = null;
    function ajustar() {
      const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1b2a4a';
      desenhou = false;
    }
    const ponto = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    cv.addEventListener('pointerdown', (e) => {
      e.preventDefault(); cv.setPointerCapture(e.pointerId);
      desenhando = true; ultimo = ponto(e);
      ctx.beginPath(); ctx.arc(ultimo.x, ultimo.y, 1.1, 0, Math.PI * 2); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
    });
    cv.addEventListener('pointermove', (e) => {
      if (!desenhando) return;
      const p = ponto(e);
      ctx.beginPath(); ctx.moveTo(ultimo.x, ultimo.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      ultimo = p; desenhou = true;
    });
    const parar = () => { desenhando = false; };
    cv.addEventListener('pointerup', parar); cv.addEventListener('pointercancel', parar);
    $('#ctLimpar').onclick = ajustar;
    let w = window.innerWidth;
    window.addEventListener('resize', () => { if (window.innerWidth !== w) { w = window.innerWidth; ajustar(); } });
    ajustar();
  }

  // Assinatura em PNG com fundo branco, recortada e reduzida para não pesar.
  function imagemAssinatura() {
    const cv = $('#ctCanvas'), out = document.createElement('canvas');
    const larg = Math.min(cv.width, 900), esc2 = larg / cv.width;
    out.width = larg; out.height = Math.round(cv.height * esc2);
    const o = out.getContext('2d');
    o.fillStyle = '#fff'; o.fillRect(0, 0, out.width, out.height);
    o.drawImage(cv, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  }

  ['#ctNome', '#ctCpf', '#ctRg', '#ctEnd'].forEach((s) => $(s).addEventListener('input', previa));
  $('#ctCpf').addEventListener('input', (e) => { e.target.value = mascaraCpf(e.target.value); previa(); });

  $('#fAssinar').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#ctErro').textContent = '';
    if (!desenhou) { $('#ctErro').textContent = 'Faça sua assinatura no quadro.'; return; }
    const bt = $('#ctAssinar');
    bt.disabled = true; bt.textContent = 'Assinando…';
    try {
      const r = await fetch('api/contrato', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t: token, nome: $('#ctNome').value, cpf: $('#ctCpf').value, rg: $('#ctRg').value,
          endereco: $('#ctEnd').value, aceite: $('#ctAceite').checked, assinatura: imagemAssinatura() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erro || 'Não foi possível assinar agora. Tente de novo.');
      dados = j;
      mostrarAssinado();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      $('#ctErro').textContent = err.message;
      bt.disabled = false; bt.textContent = 'Assinar contrato';
    }
  });

  if (!token) { $('#ctTitulo').textContent = 'Link incompleto'; $('#ctErroGeral').textContent = 'Abra o contrato pelo link que você recebeu.'; }
  else carregar();
})();
