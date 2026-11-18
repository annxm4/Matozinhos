// Regras compartilhadas entre o site e o painel: datas, feriados, preços e ocupação.
(function (g) {
  const C = {};
  const pad = (n) => String(n).padStart(2, '0');

  // Datas são sempre strings 'AAAA-MM-DD'; as contas usam UTC para não sofrer com fuso.
  C.iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  C.parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  C.fmt = (dt) => dt.toISOString().slice(0, 10);
  C.addDias = (s, n) => { const d = C.parse(s); d.setUTCDate(d.getUTCDate() + n); return C.fmt(d); };
  C.hoje = () => { const d = new Date(); return C.iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
  C.dow = (s) => C.parse(s).getUTCDay();
  C.noites = (a, b) => Math.round((C.parse(b) - C.parse(a)) / 864e5);
  C.brData = (s) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
  C.DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  C.DIAS_C = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  C.MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  C.dataLonga = (s) => `${C.DIAS_C[C.dow(s)]}, ${C.brData(s)}`;
  C.moeda = (v) => Number(v).toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL',
    minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2,
  });
  C.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  C.id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // Células de um mês (null = espaço vazio antes do dia 1). mes: 1 a 12.
  C.gradeMes = (ano, mes) => {
    const primeiro = new Date(Date.UTC(ano, mes - 1, 1)).getUTCDay();
    const total = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    const cel = Array(primeiro).fill(null);
    for (let d = 1; d <= total; d++) cel.push(C.iso(ano, mes, d));
    return cel;
  };

  function pascoa(ano) {
    const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const gg = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - gg + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
    return C.iso(ano, mes, dia);
  }

  // Feriados nacionais + datas comemorativas que costumam ter preço diferenciado.
  C.feriadosDoAno = (ano) => {
    const p = pascoa(ano);
    const f = [
      [C.iso(ano, 1, 1), 'Ano Novo'],
      [C.addDias(p, -48), 'Carnaval (segunda)'],
      [C.addDias(p, -47), 'Carnaval (terça)'],
      [C.addDias(p, -2), 'Sexta-feira Santa'],
      [p, 'Páscoa'],
      [C.iso(ano, 4, 21), 'Tiradentes'],
      [C.iso(ano, 5, 1), 'Dia do Trabalho'],
      [C.addDias(p, 60), 'Corpus Christi'],
      [C.iso(ano, 9, 7), 'Independência'],
      [C.iso(ano, 10, 12), 'Nossa Senhora Aparecida'],
      [C.iso(ano, 11, 2), 'Finados'],
      [C.iso(ano, 11, 15), 'Proclamação da República'],
      [C.iso(ano, 11, 20), 'Consciência Negra'],
      [C.iso(ano, 12, 24), 'Véspera de Natal'],
      [C.iso(ano, 12, 25), 'Natal'],
      [C.iso(ano, 12, 31), 'Réveillon'],
    ];
    return f.map(([data, nome]) => ({ data, nome, preco: null }));
  };

  C.padrao = () => {
    const ano = Number(C.hoje().slice(0, 4));
    return {
      versao: 1,
      site: {
        nome: 'Sítio em Matozinhos',
        slogan: 'Piscina, hidromassagem, sinuca e churrasco para reunir quem você gosta.',
        descricao: 'Um sítio completo em Matozinhos, Minas Gerais, para alugar por diária, fim de semana, semana ou feriado. A casa tem 3 quartos, sala e cozinha, e a área de lazer reúne piscina, hidromassagem, churrasqueira, freezer e mesa de sinuca. A garagem comporta vários carros.',
        whatsapp: '',
        cidade: 'Matozinhos – MG',
        endereco: '',
        mapa: '', // coordenadas "lat, lng" ou link do Google Maps
        capacidade: '',
        checkin: '',
        checkout: '',
        regras: [],
        comodidades: [
          { icone: '🏊', nome: 'Piscina', detalhe: '' },
          { icone: '🛁', nome: 'Hidromassagem', detalhe: '' },
          { icone: '🎱', nome: 'Sinuca', detalhe: '' },
          { icone: '🔥', nome: 'Churrasqueira', detalhe: '' },
          { icone: '❄️', nome: 'Freezer', detalhe: '' },
          { icone: '🛏️', nome: '3 quartos', detalhe: '' },
          { icone: '🛋️', nome: 'Sala', detalhe: '' },
          { icone: '🍳', nome: 'Cozinha', detalhe: '' },
          { icone: '📺', nome: 'Televisão', detalhe: '' },
          { icone: '🪑', nome: 'Mesas e cadeiras', detalhe: '' },
          { icone: '🚗', nome: 'Garagem', detalhe: 'Para vários carros' },
        ],
      },
      precos: {
        diasSemana: [0, 0, 0, 0, 0, 0, 0], // domingo a sábado; 0 = sob consulta
        feriado: 0,
        semanal: 0,
        limpeza: 0,
        caucao: 0,
        minNoites: 1,
        periodos: [], // { id, nome, inicio, fim, preco, minNoites }
        datas: {},    // { 'AAAA-MM-DD': preço }
      },
      feriados: [...C.feriadosDoAno(ano), ...C.feriadosDoAno(ano + 1)],
      fotos: [],     // { arquivo, legenda }
      reservas: [],  // { id, inicio, fim, status, priv }
      cripto: null,
    };
  };

  // Ponto do mapa. Prioridade: campo "mapa" (coordenadas/link) > endereço + cidade > cidade.
  C.localMapa = (S) => {
    const m = String(S.mapa || '').trim();
    if (m) {
      const pin = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(m) // marcador de um lugar no link
        || /(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/.exec(m); // "lat, lng" ou @lat,lng
      if (pin) return { q: `${pin[1]},${pin[2]}`, exato: true };
      if (!/^https?:/i.test(m)) return { q: m, exato: true };
    }
    const partes = [S.endereco, S.cidade].map((x) => String(x || '').trim()).filter(Boolean);
    return { q: partes.join(', ') || 'Matozinhos, MG', exato: false };
  };
  C.mapaEmbed = (q) => 'https://maps.google.com/maps?q=' + encodeURIComponent(q) + '&z=16&output=embed';
  C.mapaLink = (q) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);

  C.normalizar = (d) => {
    const p = C.padrao();
    d = d || {};
    const out = { ...p, ...d };
    out.site = { ...p.site, ...(d.site || {}) };
    out.precos = { ...p.precos, ...(d.precos || {}) };
    ['feriados', 'fotos', 'reservas'].forEach((k) => { if (!Array.isArray(out[k])) out[k] = p[k]; });
    return out;
  };

  // Preço da noite que começa na data informada.
  // Prioridade: preço da data > período especial > feriado > dia da semana.
  C.precoNoite = (D, data) => {
    const P = D.precos;
    if (P.datas && P.datas[data] != null) return { valor: P.datas[data], tipo: 'data', rotulo: 'Preço especial' };
    const per = (P.periodos || []).find((x) => x.inicio && x.fim && x.inicio <= data && data <= x.fim);
    if (per) return { valor: per.preco || 0, tipo: 'periodo', rotulo: per.nome || 'Período especial', periodo: per };
    const fer = (D.feriados || []).find((x) => x.data === data);
    if (fer) {
      const v = fer.preco != null ? fer.preco : P.feriado;
      if (v > 0) return { valor: v, tipo: 'feriado', rotulo: fer.nome };
      return { valor: P.diasSemana[C.dow(data)] || 0, tipo: 'feriado', rotulo: fer.nome };
    }
    return { valor: P.diasSemana[C.dow(data)] || 0, tipo: 'semana', rotulo: C.DIAS[C.dow(data)] };
  };

  // Noites ocupadas: da entrada até a véspera da saída (o dia da saída fica livre para nova entrada).
  C.ocupacao = (D, ignorarId) => {
    const m = new Map();
    (D.reservas || []).forEach((r) => {
      if (r.id === ignorarId || !r.inicio || !r.fim) return;
      for (let d = r.inicio; d < r.fim; d = C.addDias(d, 1)) m.set(d, r);
    });
    return m;
  };

  C.orcamento = (D, inicio, fim) => {
    const P = D.precos;
    const noites = [];
    for (let d = inicio; d < fim; d = C.addDias(d, 1)) noites.push({ data: d, ...C.precoNoite(D, d) });
    const n = noites.length;
    let minNoites = P.minNoites || 1;
    noites.forEach((x) => { if (x.periodo && x.periodo.minNoites > minNoites) minNoites = x.periodo.minNoites; });
    const consulta = noites.some((x) => !(x.valor > 0));
    // Pacote semanal: vale para cada 7 noites, desde que a estadia não pegue período especial.
    const temPeriodo = noites.some((x) => x.tipo === 'periodo');
    const semanas = P.semanal > 0 && !temPeriodo ? Math.floor(n / 7) : 0;
    const avulsas = noites.slice(semanas * 7);
    const diarias = avulsas.reduce((s, x) => s + (x.valor || 0), 0);
    const cheio = noites.reduce((s, x) => s + (x.valor || 0), 0);
    let subtotal = semanas * P.semanal + diarias;
    let usouSemanal = semanas > 0;
    if (usouSemanal && subtotal >= cheio) { subtotal = cheio; usouSemanal = false; }
    const limpeza = P.limpeza || 0;
    return {
      noites, n, minNoites, consulta, subtotal, limpeza,
      semanas: usouSemanal ? semanas : 0,
      avulsas: usouSemanal ? avulsas : noites,
      total: subtotal + limpeza,
    };
  };

  g.Sitio = C;
})(typeof window !== 'undefined' ? window : globalThis);
