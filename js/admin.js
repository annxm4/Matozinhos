(function () {
  const C = window.Sitio, esc = C.esc;
  const $ = (s) => document.querySelector(s);
  const LS = 'sitio_painel';

  let token = null, chave = null, D = null, versao = 0, sujo = false, aba = 'reservas';
  let cal = null, editando = null, dataSel = null;

  /* ---------- Utilidades ---------- */
  function b64DeBytes(u) {
    let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function bytesDeB64(b) {
    const bin = atob(b.replace(/\s/g, ''));
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function toast(msg, erro) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false; t.classList.toggle('ruim', !!erro);
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, erro ? 7000 : 3500);
  }
  function definir(obj, caminho, v) {
    const p = caminho.split('.');
    const ult = p.pop();
    p.reduce((o, k) => o[k], obj)[ult] = v;
  }
  const num = (v) => (v === '' || v == null ? null : Number(v));

  /* ---------- API (Vercel + Neon) ---------- */
  async function api(caminho, { method = 'GET', body } = {}) {
    const r = await fetch('api/' + caminho, {
      method, cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { localStorage.removeItem(LS); throw new Error(j.erro || 'Sessão expirada. Entre novamente.'); }
    if (!r.ok) throw new Error(j.erro || 'Erro no servidor (' + r.status + ').');
    return j;
  }
  async function carregar() {
    const j = await api('dados?admin=1');
    D = j.dados ? C.normalizar(j.dados) : C.padrao();
    versao = j.versao;
  }
  async function salvar() {
    const out = JSON.parse(JSON.stringify(D, (k, v) => (k === '_d' ? undefined : v)));
    for (let i = 0; i < D.reservas.length; i++) out.reservas[i].priv = await cifrar(D.reservas[i]._d || {});
    versao = (await api('dados', { method: 'PUT', body: { dados: out, versao } })).versao;
    sujo = false; barra();
  }
  async function publicar(msg) {
    const b = $('#btPublicar');
    b.disabled = true; b.textContent = 'Publicando…';
    try { await salvar(msg); toast('Publicado!'); return true; }
    catch (e) { toast(e.message, true); return false; }
    finally { b.disabled = false; b.textContent = 'Publicar alterações'; }
  }
  function marcar() { sujo = true; barra(); }
  function barra() { $('#publicar').hidden = !sujo; }
  window.addEventListener('beforeunload', (e) => { if (sujo) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- Criptografia dos dados dos hóspedes ---------- */
  async function derivar(senha, salt) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: bytesDeB64(salt), iterations: 250000, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }
  async function cifrar(obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chave, new TextEncoder().encode(JSON.stringify(obj))));
    const u = new Uint8Array(12 + ct.length); u.set(iv); u.set(ct, 12);
    return b64DeBytes(u);
  }
  async function decifrar(b) {
    const u = bytesDeB64(b);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, chave, u.slice(12));
    return JSON.parse(new TextDecoder().decode(pt));
  }
  async function abrirReservas() {
    for (const r of D.reservas) {
      try { r._d = r.priv ? await decifrar(r.priv) : {}; } catch (e) { r._d = {}; }
    }
  }

  /* ---------- Entrada ---------- */
  const erroEntrada = (m) => { $('#erroEntrada').textContent = m || ''; };
  function telaEntrada() {
    $('#app').hidden = true; $('#entrada').hidden = false;
    $('#fToken').hidden = false; $('#fSenha').hidden = true;
  }
  function pedirSenha() {
    const novo = !D.cripto;
    $('#fToken').hidden = true; $('#fSenha').hidden = false;
    $('#senha2L').hidden = !novo; $('#senha2').required = novo;
    $('#senhaTxt').textContent = novo
      ? 'Crie uma senha para o painel. Ela protege os dados dos hóspedes (nome, telefone e valores). Guarde bem: sem ela esses dados não podem ser recuperados.'
      : 'Digite a senha do painel.';
    $('#senha').focus();
  }
  $('#fToken').addEventListener('submit', async (e) => {
    e.preventDefault(); erroEntrada();
    try {
      const r = await fetch('api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ senha: $('#token').value }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erro || 'Não foi possível entrar (erro ' + r.status + ').');
      token = j.token;
      await carregar(); pedirSenha();
    } catch (err) { erroEntrada(err.message); }
  });
  $('#fSenha').addEventListener('submit', async (e) => {
    e.preventDefault(); erroEntrada();
    const senha = $('#senha').value;
    try {
      if (D.cripto) {
        chave = await derivar(senha, D.cripto.salt);
        try { await decifrar(D.cripto.check); } catch (x) { chave = null; throw new Error('Senha incorreta.'); }
      } else {
        if (senha !== $('#senha2').value) throw new Error('As senhas não são iguais.');
        const salt = b64DeBytes(crypto.getRandomValues(new Uint8Array(16)));
        chave = await derivar(senha, salt);
        D.cripto = { salt, check: await cifrar({ ok: 1 }) };
        await salvar('Configura o painel');
      }
      const bruta = new Uint8Array(await crypto.subtle.exportKey('raw', chave));
      localStorage.setItem(LS, JSON.stringify({ token, chave: b64DeBytes(bruta) }));
      await entrar();
    } catch (err) { erroEntrada(err.message); }
  });
  async function entrar() {
    await abrirReservas();
    const [y, m] = C.hoje().split('-').map(Number);
    cal = { y, m };
    $('#entrada').hidden = true; $('#app').hidden = false;
    desenhar();
  }
  $('#sair').onclick = () => {
    if (sujo && !confirm('Há alterações não publicadas. Sair mesmo assim?')) return;
    sujo = false; localStorage.removeItem(LS); location.reload();
  };
  (async function inicio() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(LS)); } catch (e) { /* sem sessão */ }
    if (!s || !s.token) return telaEntrada();
    try {
      token = s.token;
      await carregar();
      if (!D.cripto) { telaEntrada(); return pedirSenha(); }
      chave = await crypto.subtle.importKey('raw', bytesDeB64(s.chave), 'AES-GCM', true, ['encrypt', 'decrypt']);
      await decifrar(D.cripto.check);
      await entrar();
    } catch (e) { telaEntrada(); erroEntrada(e.message && !/operation/i.test(e.message) ? e.message : 'Entre novamente.'); }
  })();

  /* ---------- Navegação ---------- */
  $('#abas').onclick = (e) => { const b = e.target.closest('[data-aba]'); if (b) { aba = b.dataset.aba; desenhar(); } };
  $('#btPublicar').onclick = () => publicar();
  function desenhar() {
    document.querySelectorAll('#abas button').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === aba));
    $('#painel').innerHTML = ({ reservas: vReservas, precos: vPrecos, fotos: vFotos, site: vSite })[aba]();
    barra();
  }
  const painel = $('#painel');
  painel.addEventListener('input', (e) => {
    const el = e.target, k = el.dataset.k;
    if (!k) return;
    let v = el.value;
    if (el.dataset.tipo === 'num') v = v === '' ? (el.dataset.vazio === 'null' ? null : 0) : Number(v);
    if (el.dataset.tipo === 'linhas') v = v.split('\n').map((x) => x.trim()).filter(Boolean);
    definir(D, k, v); marcar();
  });
  painel.addEventListener('change', (e) => {
    if (e.target.id === 'envio') return enviarFotos(e.target.files);
    if (e.target.dataset.k && $('#calAdmin')) atualizarCal();
  });
  painel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (b && acoes[b.dataset.a]) acoes[b.dataset.a](b.dataset);
  });

  /* ---------- Calendário do painel ---------- */
  function calendario() {
    const ocup = C.ocupacao(D), hoje = C.hoje();
    const cel = C.gradeMes(cal.y, cal.m).map((d) => {
      if (!d) return '<span></span>';
      const r = ocup.get(d), p = C.precoNoite(D, d);
      const cls = ['cd'];
      if (d === hoje) cls.push('hoje');
      if (r) cls.push('st-' + r.status);
      else if (p.tipo !== 'semana') cls.push('esp-' + p.tipo);
      const rot = r ? (r.status === 'bloqueio' ? 'Bloqueado' : ((r._d && r._d.nome) || 'Reserva').split(' ')[0])
        : (p.valor > 0 ? C.moeda(p.valor) : '—');
      return `<button type="button" class="${cls.join(' ')}" data-a="dia" data-d="${d}" title="${esc(p.rotulo)}"><b>${+d.slice(8)}</b><small>${esc(rot)}</small></button>`;
    }).join('');
    return `<div class="cal" id="calAdmin">
      <div class="cal-topo"><button type="button" class="bt bt-liso" data-a="mes" data-n="-1" aria-label="Mês anterior">‹</button>
      <strong>${C.MESES[cal.m - 1]} ${cal.y}</strong>
      <button type="button" class="bt bt-liso" data-a="mes" data-n="1" aria-label="Próximo mês">›</button></div>
      <div class="cal-grade">${C.DIAS_C.map((x) => `<i>${x}</i>`).join('')}${cel}</div>
      <p class="leg"><span class="p st-confirmada"></span>Confirmada <span class="p st-pendente"></span>Pendente
      <span class="p st-bloqueio"></span>Bloqueio <span class="p esp-feriado"></span>Feriado / especial</p></div>`;
  }

  // Atualiza os dias sem trocar os botões: trocar o elemento no meio de um toque faria o clique se perder.
  function atualizarCal() {
    const tmp = document.createElement('div');
    tmp.innerHTML = calendario();
    const novos = tmp.querySelectorAll('.cd'), atuais = document.querySelectorAll('#calAdmin .cd');
    novos.forEach((n, i) => {
      const a = atuais[i];
      a.className = n.className; a.title = n.title;
      a.querySelector('small').textContent = n.querySelector('small').textContent;
    });
  }

  const acoes = {
    mes(d) {
      const x = new Date(Date.UTC(cal.y, cal.m - 1 + Number(d.n), 1));
      cal = { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1 };
      $('#calAdmin').outerHTML = calendario();
    },
    dia(d) {
      if (aba === 'reservas') { const r = C.ocupacao(D).get(d.d); r ? abrirReserva(r) : abrirReserva(null, d.d); }
      else abrirData(d.d);
    },
    nova() { abrirReserva(null); },
    bloquear() { abrirReserva(null, null, 'bloqueio'); },
    editar(d) { abrirReserva(D.reservas.find((r) => r.id === d.id)); },

    addFeriado() { D.feriados.push({ data: C.hoje(), nome: '', preco: null }); marcar(); desenhar(); },
    delFeriado(d) { D.feriados.splice(+d.i, 1); marcar(); desenhar(); },
    gerarFeriados() {
      const ano = Number($('#anoFer').value);
      const tem = new Set(D.feriados.map((f) => f.data));
      C.feriadosDoAno(ano).forEach((f) => { if (!tem.has(f.data)) D.feriados.push(f); });
      D.feriados.sort((a, b) => a.data.localeCompare(b.data));
      marcar(); desenhar(); toast('Feriados de ' + ano + ' adicionados.');
    },
    limparFeriados() { const h = C.hoje(); D.feriados = D.feriados.filter((f) => f.data >= h); marcar(); desenhar(); },
    addPeriodo() { D.precos.periodos.push({ id: C.id(), nome: '', inicio: '', fim: '', preco: 0, minNoites: 1 }); marcar(); desenhar(); },
    delPeriodo(d) { D.precos.periodos.splice(+d.i, 1); marcar(); desenhar(); },
    delData(d) { delete D.precos.datas[d.d]; marcar(); desenhar(); },

    addComod() { D.site.comodidades.push({ icone: '✨', nome: '', detalhe: '' }); marcar(); desenhar(); },
    delComod(d) { D.site.comodidades.splice(+d.i, 1); marcar(); desenhar(); },
    moverComod(d) { mover(D.site.comodidades, +d.i, +d.n); },
    moverFoto(d) { mover(D.fotos, +d.i, +d.n); },
    delFoto(d) { excluirFoto(+d.i); },
  };
  function mover(lista, i, n) {
    const j = i + n;
    if (j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    marcar(); desenhar();
  }

  /* ---------- Reservas ---------- */
  const ROT = { confirmada: 'Confirmada', pendente: 'Pendente', bloqueio: 'Bloqueio' };
  function cartaoReserva(r) {
    const d = r._d || {}, n = C.noites(r.inicio, r.fim);
    const tel = (d.telefone || '').replace(/\D/g, '');
    const falta = d.valor != null && d.sinal != null ? d.valor - d.sinal : null;
    return `<li class="res st-${r.status}">
      <div><strong>${r.status === 'bloqueio' ? 'Bloqueio' : esc(d.nome || 'Sem nome')}</strong>
        <span class="selo">${ROT[r.status]}</span>
        <p>${C.dataLonga(r.inicio)} → ${C.dataLonga(r.fim)} · ${n} noite${n > 1 ? 's' : ''}</p>
        ${d.valor != null ? `<p>${C.moeda(d.valor)}${d.sinal ? ` · sinal ${C.moeda(d.sinal)}` : ''}${falta > 0 ? ` · falta ${C.moeda(falta)}` : ''}</p>` : ''}
        ${d.obs ? `<p class="obs">${esc(d.obs)}</p>` : ''}</div>
      <div class="res-acoes">
        ${tel ? `<a class="bt bt-liso" target="_blank" rel="noopener" href="https://wa.me/${tel.length <= 11 ? '55' + tel : tel}">WhatsApp</a>` : ''}
        <button type="button" class="bt bt-liso" data-a="editar" data-id="${r.id}">Editar</button></div></li>`;
  }
  function vReservas() {
    const hoje = C.hoje();
    const ord = [...D.reservas].sort((a, b) => a.inicio.localeCompare(b.inicio));
    const prox = ord.filter((r) => r.fim >= hoje), pass = ord.filter((r) => r.fim < hoje).reverse();
    return `<div class="cab"><h1>Reservas</h1>
        <button type="button" class="bt bt-pri" data-a="nova">+ Nova reserva</button>
        <button type="button" class="bt bt-liso" data-a="bloquear">Bloquear datas</button></div>
      <p class="dica">Toque em um dia livre para criar uma reserva, ou em um dia ocupado para editar.</p>
      ${calendario()}
      <h2>Próximas (${prox.length})</h2>
      ${prox.length ? `<ul class="lista">${prox.map(cartaoReserva).join('')}</ul>` : '<p class="vazio">Nenhuma reserva futura.</p>'}
      ${pass.length ? `<details><summary>Reservas passadas (${pass.length})</summary><ul class="lista">${pass.map(cartaoReserva).join('')}</ul></details>` : ''}`;
  }
  function abrirReserva(r, inicio, status) {
    editando = r || null;
    const d = (r && r._d) || {};
    $('#rTitulo').textContent = r ? 'Editar reserva' : (status === 'bloqueio' ? 'Bloquear datas' : 'Nova reserva');
    $('#rStatus').value = r ? r.status : (status || 'confirmada');
    $('#rInicio').value = r ? r.inicio : (inicio || '');
    $('#rFim').value = r ? r.fim : (inicio ? C.addDias(inicio, 1) : '');
    $('#rNome').value = d.nome || ''; $('#rTel').value = d.telefone || '';
    $('#rValor').value = d.valor != null ? d.valor : ''; $('#rSinal').value = d.sinal != null ? d.sinal : '';
    $('#rObs').value = d.obs || '';
    $('#rExcluir').hidden = !r; $('#rErro').textContent = '';
    ajustarReserva();
    $('#dlgReserva').showModal();
  }
  function ajustarReserva() {
    const a = $('#rInicio').value, b = $('#rFim').value;
    $('#rHospede').hidden = $('#rStatus').value === 'bloqueio';
    let t = '';
    if (a && b && a < b) {
      const o = C.orcamento(D, a, b);
      t = `${o.n} noite${o.n > 1 ? 's' : ''}. ` + (o.consulta ? 'Há noites sem preço na tabela.'
        : `Pela tabela: ${C.moeda(o.total)}${o.limpeza ? ' (com limpeza)' : ''}. <button type="button" class="link" id="rUsar" data-v="${o.total}">Usar este valor</button>`);
    }
    $('#rTabela').innerHTML = t;
  }
  ['rInicio', 'rFim', 'rStatus'].forEach((id) => $('#' + id).addEventListener('change', ajustarReserva));
  $('#rTabela').addEventListener('click', (e) => { if (e.target.id === 'rUsar') $('#rValor').value = e.target.dataset.v; });
  $('#rCancelar').onclick = () => $('#dlgReserva').close();
  $('#fReserva').addEventListener('submit', async (e) => {
    e.preventDefault();
    const a = $('#rInicio').value, b = $('#rFim').value, st = $('#rStatus').value;
    if (!(a < b)) { $('#rErro').textContent = 'A saída precisa ser depois da entrada.'; return; }
    const ocup = C.ocupacao(D, editando && editando.id);
    for (let x = a; x < b; x = C.addDias(x, 1)) {
      if (ocup.has(x)) { $('#rErro').textContent = `O dia ${C.brData(x)} já está ocupado por outra reserva.`; return; }
    }
    const antes = JSON.stringify(D.reservas, (k, v) => (k === '_d' ? undefined : v));
    const antesD = D.reservas.map((r) => r._d);
    const r = editando || { id: C.id() };
    if (!editando) D.reservas.push(r);
    Object.assign(r, { inicio: a, fim: b, status: st });
    r._d = st === 'bloqueio' ? { obs: $('#rObs').value.trim() } : {
      nome: $('#rNome').value.trim(), telefone: $('#rTel').value.trim(),
      valor: num($('#rValor').value), sinal: num($('#rSinal').value), obs: $('#rObs').value.trim(),
    };
    await gravarReservas(antes, antesD, 'Atualiza reservas');
  });
  $('#rExcluir').onclick = async () => {
    if (!editando || !confirm('Excluir esta reserva? As datas voltam a ficar disponíveis no site.')) return;
    const antes = JSON.stringify(D.reservas, (k, v) => (k === '_d' ? undefined : v));
    const antesD = D.reservas.map((r) => r._d);
    D.reservas = D.reservas.filter((r) => r !== editando);
    await gravarReservas(antes, antesD, 'Remove reserva');
  };
  // Reservas são publicadas na hora; se falhar, volta ao estado anterior.
  async function gravarReservas(antes, antesD, msg) {
    const bt = $('#rSalvar'); bt.disabled = true; bt.textContent = 'Salvando…';
    try {
      await salvar(msg);
      $('#dlgReserva').close(); desenhar();
      toast('Salvo!');
    } catch (err) {
      D.reservas = JSON.parse(antes); D.reservas.forEach((r, i) => { r._d = antesD[i]; });
      $('#rErro').textContent = err.message;
    } finally { bt.disabled = false; bt.textContent = 'Salvar'; }
  }

  /* ---------- Preços ---------- */
  const campoNum = (k, v, extra) => `<input type="number" min="0" step="0.01" inputmode="decimal" data-tipo="num" data-k="${k}" value="${v == null ? '' : v}" ${extra || ''}>`;
  function vPrecos() {
    const P = D.precos, hoje = C.hoje(), ano = Number(hoje.slice(0, 4));
    const ordem = [1, 2, 3, 4, 5, 6, 0];
    const fer = D.feriados.map((f, i) => ({ f, i })).filter((x) => x.f.data >= hoje || !x.f.data);
    const passados = D.feriados.length - fer.length;
    const datas = Object.keys(P.datas).sort();
    return `<div class="cab"><h1>Preços</h1></div>
    <section class="bloco"><h2>Diária por dia da semana</h2>
      <p class="dica">Valor da noite que começa em cada dia. Deixe 0 para aparecer “consulte” no site.</p>
      <div class="semana">${ordem.map((i) => `<label>${C.DIAS[i]}${campoNum('precos.diasSemana.' + i, P.diasSemana[i])}</label>`).join('')}</div>
    </section>

    <section class="bloco"><h2>Semana, taxas e estadia mínima</h2>
      <div class="g4">
        <label>Pacote de 7 noites (R$)${campoNum('precos.semanal', P.semanal)}</label>
        <label>Taxa de limpeza (R$)${campoNum('precos.limpeza', P.limpeza)}</label>
        <label>Caução (R$)${campoNum('precos.caucao', P.caucao)}</label>
        <label>Mínimo de noites<input type="number" min="1" step="1" data-tipo="num" data-k="precos.minNoites" value="${P.minNoites}"></label>
      </div>
      <p class="dica">O pacote semanal vale a cada 7 noites seguidas quando sai mais barato que as diárias, e não se aplica a estadias que pegam um período especial. Use 0 para desligar.</p>
    </section>

    <section class="bloco"><h2>Feriados</h2>
      <div class="g4"><label>Diária padrão de feriado (R$)${campoNum('precos.feriado', P.feriado)}</label></div>
      <p class="dica">Cada feriado usa a diária padrão acima, a não ser que você preencha um valor próprio. Para um feriado prolongado inteiro, crie um período especial.</p>
      <div class="tabela">${fer.map(({ f, i }) => `<div class="linha l-fer">
        <input type="date" data-k="feriados.${i}.data" value="${esc(f.data)}" aria-label="Data">
        <input type="text" data-k="feriados.${i}.nome" value="${esc(f.nome)}" placeholder="Nome do feriado" aria-label="Nome">
        ${campoNum(`feriados.${i}.preco`, f.preco, 'data-vazio="null" placeholder="padrão" aria-label="Valor próprio"')}
        <button type="button" class="bt bt-x" data-a="delFeriado" data-i="${i}" aria-label="Remover">×</button></div>`).join('')}</div>
      <div class="acoes">
        <button type="button" class="bt bt-liso" data-a="addFeriado">+ Feriado (ex.: municipal)</button>
        <select id="anoFer" aria-label="Ano">${[0, 1, 2].map((n) => `<option>${ano + n}</option>`).join('')}</select>
        <button type="button" class="bt bt-liso" data-a="gerarFeriados">Adicionar feriados nacionais do ano</button>
        ${passados ? `<button type="button" class="bt bt-liso" data-a="limparFeriados">Apagar ${passados} já passados</button>` : ''}
      </div>
    </section>

    <section class="bloco"><h2>Períodos especiais</h2>
      <p class="dica">Temporadas e datas com preço próprio (Réveillon, Carnaval, férias de julho…). Têm prioridade sobre feriados e dias da semana.</p>
      <div class="tabela">${P.periodos.map((p, i) => `<div class="linha l-per">
        <label>Nome<input type="text" data-k="precos.periodos.${i}.nome" value="${esc(p.nome)}" placeholder="Ex.: Réveillon"></label>
        <label>De<input type="date" data-k="precos.periodos.${i}.inicio" value="${esc(p.inicio)}"></label>
        <label>Até<input type="date" data-k="precos.periodos.${i}.fim" value="${esc(p.fim)}"></label>
        <label>Diária (R$)${campoNum(`precos.periodos.${i}.preco`, p.preco)}</label>
        <label>Mín. noites<input type="number" min="1" step="1" data-tipo="num" data-k="precos.periodos.${i}.minNoites" value="${p.minNoites || 1}"></label>
        <button type="button" class="bt bt-x" data-a="delPeriodo" data-i="${i}" aria-label="Remover">×</button></div>`).join('')}</div>
      <div class="acoes"><button type="button" class="bt bt-liso" data-a="addPeriodo">+ Período especial</button></div>
    </section>

    <section class="bloco"><h2>Conferir e ajustar por data</h2>
      <p class="dica">O calendário mostra o preço final de cada noite. Toque em um dia para definir um preço só para aquela data.</p>
      ${calendario()}
      ${datas.length ? `<ul class="fichas">${datas.map((d) => `<li>${C.brData(d)} · ${C.moeda(P.datas[d])}
        <button type="button" data-a="delData" data-d="${d}" aria-label="Remover preço de ${C.brData(d)}">×</button></li>`).join('')}</ul>` : ''}
    </section>`;
  }
  function abrirData(d) {
    dataSel = d;
    const p = C.precoNoite(D, d);
    $('#dTitulo').textContent = C.dataLonga(d);
    $('#dAtual').textContent = `Preço atual: ${p.valor > 0 ? C.moeda(p.valor) : 'sob consulta'} (${p.rotulo}).`;
    $('#dValor').value = D.precos.datas[d] != null ? D.precos.datas[d] : '';
    $('#dLimpar').hidden = D.precos.datas[d] == null;
    $('#dlgData').showModal();
  }
  $('#dCancelar').onclick = () => $('#dlgData').close();
  $('#dLimpar').onclick = () => { delete D.precos.datas[dataSel]; marcar(); $('#dlgData').close(); desenhar(); };
  $('#fData').addEventListener('submit', (e) => {
    e.preventDefault();
    D.precos.datas[dataSel] = Number($('#dValor').value);
    marcar(); $('#dlgData').close(); desenhar();
  });

  /* ---------- Fotos ---------- */
  const srcFoto = (f) => f.arquivo;
  function vFotos() {
    return `<div class="cab"><h1>Fotos</h1>
      <label class="bt bt-pri">+ Enviar fotos<input type="file" id="envio" accept="image/*" multiple hidden></label></div>
      <p class="dica">A primeira foto é a capa do site. As fotos são reduzidas automaticamente antes do envio.</p>
      <p class="dica" id="progresso"></p>
      ${D.fotos.length ? `<ul class="fotos">${D.fotos.map((f, i) => `<li>
        <img src="${esc(srcFoto(f))}" alt="" loading="lazy">${i === 0 ? '<span class="selo capa">Capa</span>' : ''}
        <input type="text" data-k="fotos.${i}.legenda" value="${esc(f.legenda)}" placeholder="Legenda (ex.: Piscina)" aria-label="Legenda">
        <div class="acoes">
          <button type="button" class="bt bt-liso" data-a="moverFoto" data-i="${i}" data-n="-1" ${i === 0 ? 'disabled' : ''} aria-label="Mover para antes">←</button>
          <button type="button" class="bt bt-liso" data-a="moverFoto" data-i="${i}" data-n="1" ${i === D.fotos.length - 1 ? 'disabled' : ''} aria-label="Mover para depois">→</button>
          <span class="esp"></span>
          <button type="button" class="bt bt-perigo" data-a="delFoto" data-i="${i}">Excluir</button></div></li>`).join('')}</ul>`
        : '<p class="vazio">Nenhuma foto ainda. Envie as fotos da piscina, hidromassagem, quartos, churrasqueira e área externa.</p>'}`;
  }
  async function reduzir(arquivo) {
    const img = await createImageBitmap(arquivo);
    const esc2 = Math.min(1, 1600 / Math.max(img.width, img.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.width * esc2); cv.height = Math.round(img.height * esc2);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.82);
  }
  async function enviarFotos(arquivos) {
    const lista = [...arquivos];
    if (!lista.length) return;
    const prog = (t) => { const p = $('#progresso'); if (p) p.textContent = t; };
    let ok = 0;
    try {
      for (let i = 0; i < lista.length; i++) {
        prog(`Enviando foto ${i + 1} de ${lista.length}…`);
        let url;
        try { url = await reduzir(lista[i]); } catch (e) { toast(`Não foi possível ler "${lista[i].name}".`, true); continue; }
        const { arquivo } = await api('foto', { method: 'POST', body: { imagem: url } });
        D.fotos.push({ arquivo, legenda: '' });
        ok++;
      }
      if (ok) { await salvar('Atualiza fotos'); toast(`${ok} foto${ok > 1 ? 's enviadas' : ' enviada'}.`); }
    } catch (e) {
      toast(e.message, true);
      if (ok) marcar();
    }
    desenhar();
  }
  async function excluirFoto(i) {
    const f = D.fotos[i];
    if (!confirm('Excluir esta foto do site?')) return;
    try {
      const m = /^api\/foto\?id=([\w-]+)$/.exec(f.arquivo);
      if (m) await api('foto?id=' + m[1], { method: 'DELETE' }); // fotos antigas em fotos/ ficam no repositório
      D.fotos.splice(i, 1);
      await salvar('Atualiza fotos');
      toast('Foto excluída.');
    } catch (e) { toast(e.message, true); }
    desenhar();
  }

  /* ---------- Site ---------- */
  function vSite() {
    const S = D.site;
    const txt = (k, rot, extra) => `<label>${rot}<input type="text" data-k="site.${k}" value="${esc(S[k])}" ${extra || ''}></label>`;
    return `<div class="cab"><h1>Site</h1></div>
    <section class="bloco"><h2>Apresentação</h2>
      ${txt('nome', 'Nome do sítio')}
      ${txt('slogan', 'Frase de destaque')}
      <label>Descrição<textarea rows="5" data-k="site.descricao">${esc(S.descricao)}</textarea></label>
    </section>
    <section class="bloco"><h2>Contato e localização</h2>
      <div class="g2">
        ${txt('whatsapp', 'WhatsApp para reservas (com DDD)', 'inputmode="tel" placeholder="31 9XXXX-XXXX"')}
        ${txt('cidade', 'Cidade')}
      </div>
      ${txt('endereco', 'Endereço ou ponto de referência (aparece no site e no mapa)', 'placeholder="Deixe vazio para mostrar só a cidade"')}
      <p class="dica">Sem WhatsApp cadastrado, o botão de pedir reserva não aparece no site.</p>
    </section>
    <section class="bloco"><h2>Estadia</h2>
      <div class="g4">
        ${txt('capacidade', 'Capacidade', 'placeholder="Ex.: até 15 pessoas"')}
        ${txt('checkin', 'Entrada', 'placeholder="Ex.: a partir das 9h"')}
        ${txt('checkout', 'Saída', 'placeholder="Ex.: até as 18h"')}
      </div>
      <label>Regras e informações (uma por linha)
        <textarea rows="5" data-tipo="linhas" data-k="site.regras" placeholder="Ex.: Não é permitido som alto após as 22h">${esc(S.regras.join('\n'))}</textarea></label>
    </section>
    <section class="bloco"><h2>Comodidades</h2>
      <div class="tabela">${S.comodidades.map((c, i) => `<div class="linha l-com">
        <input type="text" class="emoji" data-k="site.comodidades.${i}.icone" value="${esc(c.icone)}" aria-label="Ícone (emoji)">
        <input type="text" data-k="site.comodidades.${i}.nome" value="${esc(c.nome)}" placeholder="Nome" aria-label="Nome">
        <input type="text" data-k="site.comodidades.${i}.detalhe" value="${esc(c.detalhe)}" placeholder="Detalhe (opcional)" aria-label="Detalhe">
        <button type="button" class="bt bt-x" data-a="moverComod" data-i="${i}" data-n="-1" ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button>
        <button type="button" class="bt bt-x" data-a="moverComod" data-i="${i}" data-n="1" ${i === S.comodidades.length - 1 ? 'disabled' : ''} aria-label="Descer">↓</button>
        <button type="button" class="bt bt-x" data-a="delComod" data-i="${i}" aria-label="Remover">×</button></div>`).join('')}</div>
      <div class="acoes"><button type="button" class="bt bt-liso" data-a="addComod">+ Comodidade</button></div>
    </section>`;
  }
})();
