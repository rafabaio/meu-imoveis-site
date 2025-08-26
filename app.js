// Básico: mapa + lista + editar + EXCLUIR + exportar.
// Simplificado, sem animações, sem clusters, sem filtros.
// Delete persistente via localStorage: "imoveis_deletados".
// Edições locais em "imoveis_locais".

let mapa, marcadores = [], dados = [];
let editandoId = null;
let isMoving = false;
const markerById = new Map();

main().catch(err => {
  console.error('Falha ao iniciar:', err);
  alert('Erro ao iniciar. Veja o Console (F12).');
});

async function main(){
  // 1) Mapa simples
  mapa = L.map('map', { preferCanvas: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap'
  }).addTo(mapa);
  mapa.setView([-23.4205, -51.9331], 12);

  // 2) Carrega base
  try {
    const r = await fetch('imoveis.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    dados = await r.json();
  } catch (e) {
    console.error('Não carregou imoveis.json:', e);
    alert('Não foi possível carregar imoveis.json. Abra com Live Server.');
    dados = [];
  }

  // 3) Aplica exclusões + edições locais
  const deletados = getDeletados();
  dados = dados.filter(x => !deletados.has(String(x.id)));

  const locais = JSON.parse(localStorage.getItem('imoveis_locais') || '[]');
  dados = mergeSeguro(dados, locais);

  // 4) Sanea coordenadas
  dados = dados.map(it => saneCoords(it));

  // 5) Render
  renderLista(dados);
  renderMarcadores(dados, { fitOnce: true });

  // 6) Ações globais
  on('#btn-cadastrar','click', () => abrirModal());
  on('#form-cadastro','submit', (e)=> e.preventDefault());
  on('#c-salvar','click', salvarCadastro);
  on('#c-cancelar','click', ()=>document.getElementById('dlg-cadastro').close());
  on('#btn-exportar','click', exportarJSON);
  on('#btn-limpar-local','click', limparLocais);
}

/* ---------------- helpers de estado ---------------- */

function getDeletados(){
  try {
    const arr = JSON.parse(localStorage.getItem('imoveis_deletados') || '[]');
    return new Set(arr.map(x => String(x)));
  } catch { return new Set(); }
}
function setDeletados(set){
  localStorage.setItem('imoveis_deletados', JSON.stringify(Array.from(set)));
}

function mergeSeguro(base, extra) {
  // Não sobrescreve base com undefined/null/'' vindo de extra
  const byId = new Map(base.map(x => [String(x.id), { ...x }]));
  for (const e of extra) {
    const id = String(e.id);
    const alvo = byId.get(id) || {};
    const out = { ...alvo };
    for (const [k, v] of Object.entries(e)) {
      if (v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '')) {
        out[k] = v;
      }
    }
    byId.set(id, out);
  }
  return Array.from(byId.values());
}

function saneCoords(it){
  const lat = typeof it.lat === 'string' ? parseFloat(it.lat) : it.lat;
  const lng = typeof it.lng === 'string' ? parseFloat(it.lng) : it.lng;
  const ok = Number.isFinite(lat) && Number.isFinite(lng);
  return { ...it, lat: ok ? lat : undefined, lng: ok ? lng : undefined, _coordsOk: ok };
}

function on(sel, evt, fn){
  const el = document.querySelector(sel);
  if (el) el.addEventListener(evt, fn, { passive: true });
}

/* ---------------- lista ---------------- */

function renderLista(arr) {
  const ul = document.getElementById('lista');
  if (!ul) return;
  ul.innerHTML = '';
  const frag = document.createDocumentFragment();

  arr.forEach(imovel => {
    const li = document.createElement('li');
    li.className = 'card';
    const precoFmt = Number.isFinite(imovel.preco) ? new Intl.NumberFormat('pt-BR').format(imovel.preco) : '—';
    li.innerHTML = `
      <img loading="lazy" referrerpolicy="no-referrer"
           src="${imovel.imagem || 'https://via.placeholder.com/400x260?text=Imagem'}"
           alt="${imovel.titulo || 'Empreendimento'}"
           onerror="this.onerror=null;this.src='https://via.placeholder.com/400x260?text=Sem+imagem';"/>
      <div>
        <h3>${imovel.titulo || 'Empreendimento'} ${imovel._coordsOk ? '' : '<span style="color:#c00;font-size:12px">• falta lat/lng</span>'}</h3>
        <div class="meta">
          ${imovel.preco ? 'R$ '+precoFmt : ''}${imovel.quartos ? ' • ' + imovel.quartos + ' quarto(s)' : ''}${Number.isFinite(imovel.suites)&&imovel.suites>0?` • ${imovel.suites} suíte(s)`:''}${imovel.tipo? ' • ' + imovel.tipo : ''}${imovel.construtora? ' • ' + imovel.construtora : ''}
        </div>
        <div class="row">
          <button data-zoom>Ir no mapa</button>
          <a href="detalhe.html?id=${encodeURIComponent(imovel.id)}"><button>Detalhes</button></a>
          <button data-editar>Editar</button>
          <button data-excluir style="border-color:#f2c; color:#b00">Excluir</button>
        </div>
      </div>
    `;

    li.querySelector('[data-zoom]').addEventListener('click', () => focoNoMapa(imovel, true));
    li.querySelector('[data-editar]').addEventListener('click', () => abrirModal(imovel));
    li.querySelector('[data-excluir]').addEventListener('click', () => excluirImovel(imovel));

    frag.appendChild(li);
  });

  ul.appendChild(frag);
}

/* ---------------- mapa/pins ---------------- */

function renderMarcadores(arr, { fitOnce=false } = {}) {
  marcadores.forEach(m => m.remove());
  marcadores = [];
  markerById.clear();

  const adicionados = [];
  arr.forEach(i => {
    if (Number.isFinite(i?.lat) && Number.isFinite(i?.lng)) {
      const m = L.marker([i.lat, i.lng]).addTo(mapa);
      const preco = Number.isFinite(i?.preco)
        ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(i.preco)
        : '';
      m.bindTooltip(`${i.titulo || 'Empreendimento'}${preco ? `<br>${preco}` : ''}`, { sticky: true, direction: 'top', opacity: 0.9 });
      m.bindPopup(`<b>${i.titulo || 'Empreendimento'}</b>${preco ? `<br>${preco}` : ''}`);
      marcadores.push(m);
      adicionados.push(m);
      if (i.id != null) markerById.set(String(i.id), m);
    }
  });

  if (fitOnce && adicionados.length) {
    const group = new L.featureGroup(adicionados);
    mapa.fitBounds(group.getBounds().pad(0.2), { animate: false });
  }
}

function focoNoMapa(imovel, comZoom=false) {
  const lat = typeof imovel?.lat === 'string' ? parseFloat(imovel.lat) : imovel?.lat;
  const lng = typeof imovel?.lng === 'string' ? parseFloat(imovel.lng) : imovel?.lng;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    alert('Este empreendimento está sem coordenadas válidas. Abra “Editar” e preencha lat/lng.');
    abrirModal(imovel);
    return;
  }

  if (isMoving) return;
  isMoving = true;
  try {
    if (mapa && mapa.stop) mapa.stop();
    const target = comZoom ? 16 : Math.max(mapa.getZoom(), 15);
    mapa.setView([lat, lng], target, { animate: false });
    const mk = markerById.get(String(imovel.id));
    if (mk && mk.openPopup) setTimeout(() => mk.openPopup(), 10);
  } finally {
    setTimeout(() => { isMoving = false; }, 200);
  }
}

/* ---------------- CRUD: criar/editar/excluir ---------------- */

function abrirModal(imovel=null){
  const dlg = document.getElementById('dlg-cadastro');
  if (!dlg) return;
  const isEdit = !!imovel;
  document.getElementById('dlg-titulo').textContent = isEdit ? 'Editar empreendimento' : 'Novo empreendimento';
  editandoId = isEdit ? imovel.id : null;

  setVal('c-id', isEdit ? (imovel.id ?? '') : '');
  setVal('c-titulo', isEdit ? (imovel.titulo||'') : '');
  setVal('c-preco', isEdit ? (imovel.preco||'') : '');
  setVal('c-quartos', isEdit ? (imovel.quartos||'') : '');
  setVal('c-suites', isEdit ? (imovel.suites||0) : 0);
  setVal('c-tipo', isEdit ? (imovel.tipo||'') : 'Apartamento');
  setVal('c-construtora', isEdit ? (imovel.construtora||'') : '');
  setVal('c-lat', isEdit && Number.isFinite(imovel.lat) ? imovel.lat : '');
  setVal('c-lng', isEdit && Number.isFinite(imovel.lng) ? imovel.lng : '');
  setVal('c-vagas', isEdit ? (imovel.vagas||0) : 1);
  setVal('c-area', isEdit ? (imovel.area_m2||'') : '');
  setVal('c-imagem', isEdit ? (imovel.imagem||'') : '');
  setVal('c-desc', isEdit ? (imovel.descricao||'') : '');

  dlg.showModal();
}

function salvarCadastro(e) {
  if (e) e.preventDefault();

  const novo = saneCoords({
    id: editandoId || gerarId(),
    titulo: getVal('c-titulo').trim(),
    preco: parseInt(getVal('c-preco'), 10) || 0,
    quartos: parseInt(getVal('c-quartos'), 10) || 0,
    suites: parseInt(getVal('c-suites'), 10) || 0,
    tipo: getVal('c-tipo').trim() || 'Apartamento',
    construtora: getVal('c-construtora').trim() || '',
    lat: parseFloat(getVal('c-lat')),
    lng: parseFloat(getVal('c-lng')),
    vagas: parseInt(getVal('c-vagas'), 10) || 0,
    area_m2: parseFloat(getVal('c-area')) || undefined,
    imagem: getVal('c-imagem').trim(),
    descricao: getVal('c-desc')
  });

  if (!novo.titulo || !Number.isFinite(novo.lat) || !Number.isFinite(novo.lng)) {
    alert('Preencha título, latitude e longitude válidos.');
    return;
  }

  // salva/atualiza local
  let locais = JSON.parse(localStorage.getItem('imoveis_locais') || '[]');
  const i = locais.findIndex(x => String(x.id) === String(novo.id));
  if (i >= 0) locais[i] = novo; else locais.push(novo);
  localStorage.setItem('imoveis_locais', JSON.stringify(locais));

  // atualiza memória
  const j = dados.findIndex(x => String(x.id) === String(novo.id));
  if (j >= 0) dados[j] = { ...dados[j], ...novo }; else dados.push(novo);

  renderLista(dados);
  renderMarcadores(dados, { fitOnce: false });

  document.getElementById('dlg-cadastro').close();
  editandoId = null;
  alert('Salvo localmente! Use "Exportar JSON" para baixar o conjunto completo.');
}

function excluirImovel(imovel){
  if (!imovel || imovel.id == null) return;
  const id = String(imovel.id);
  if (!confirm(`Excluir o empreendimento:\n${imovel.titulo || id}?`)) return;

  // remove de locais (se existir)
  let locais = JSON.parse(localStorage.getItem('imoveis_locais') || '[]');
  locais = locais.filter(x => String(x.id) !== id);
  localStorage.setItem('imoveis_locais', JSON.stringify(locais));

  // adiciona à lista de deletados (para também esconder os do JSON base)
  const del = getDeletados();
  del.add(id);
  setDeletados(del);

  // remove da memória atual
  dados = dados.filter(x => String(x.id) !== id);

  renderLista(dados);
  renderMarcadores(dados, { fitOnce: false });
}

/* ---------------- util ---------------- */

function getVal(id){ const el=document.getElementById(id); return el ? el.value || '' : '' }
function setVal(id, val){ const el=document.getElementById(id); if (el) el.value = (val ?? '') }

function gerarId(){
  const base = dados.length ? Math.max(...dados.map(x => parseInt(x.id,10) || 0)) : 100;
  return base + 1;
}

function exportarJSON() {
  // exporta base atual (base JSON – removidos – + locais)
  const del = getDeletados();
  const locais = JSON.parse(localStorage.getItem('imoveis_locais') || '[]');
  const combinado = mergeSeguro(dados.filter(x => !del.has(String(x.id))), locais);
  const blob = new Blob([JSON.stringify(combinado, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'imoveis.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function limparLocais(){
  if (!confirm('Isto apaga somente os dados locais (edições e deletados). Continuar?')) return;
  localStorage.removeItem('imoveis_locais');
  localStorage.removeItem('imoveis_deletados');
  location.reload();
}
