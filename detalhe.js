function qs(sel){return document.querySelector(sel)}
function getParam(name){return new URLSearchParams(location.search).get(name)}

async function init(){
  const id = parseInt(getParam('id'),10)
  if(!id){ alert('ID inválido.'); location.href = 'index.html'; return }
  let dados = []
  try{
    const r = await fetch('imoveis.json',{cache:'no-store'})
    if(!r.ok) throw new Error('HTTP '+r.status)
    dados = await r.json()
  }catch(e){
    console.error('Erro ao carregar imoveis.json', e)
    alert('Não foi possível carregar os dados.')
    return
  }
  const locais = JSON.parse(localStorage.getItem('imoveis_locais') || '[]')
  const all = [...dados, ...locais]
  const item = all.find(x=>x.id===id)
  if(!item){ alert('Imóvel não encontrado'); location.href='index.html'; return }

  // Hero
  const mainUrl = (item.imagem || 'https://via.placeholder.com/800x480?text=Imagem')
  qs('#d-img').src = mainUrl
  montarThumbs([mainUrl, ...(Array.isArray(item.galeria)?item.galeria:[])].filter(Boolean))

  // Cabeçalho
  qs('#d-titulo').textContent = item.titulo
  const precoFmt = new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'}).format(item.preco||0)
  qs('#d-meta').textContent = `${precoFmt} • ${item.quartos||'?'} quarto(s)${Number.isFinite(item.suites)&&item.suites>0?` • ${item.suites} suíte(s)`:''}`
  qs('#d-construtora').textContent = item.construtora ? `Construtora: ${item.construtora}` : ''
  const solPartes = []
  if (item.sol_manha_texto) solPartes.push(`Sol da manhã: ${item.sol_manha_texto}`)
  if (item.sol_tarde_texto) solPartes.push(`Sol da tarde: ${item.sol_tarde_texto}`)
  qs('#d-sol').textContent = solPartes.join(' • ')

  // Info
  qs('#d-area').textContent = Number.isFinite(item.area_m2) ? `${item.area_m2} m²` : '—'
  qs('#d-vagas').textContent = Number.isFinite(item.vagas) ? String(item.vagas) : '—'
  qs('#d-suites').textContent = Number.isFinite(item.suites) ? String(item.suites) : '—'
  qs('#d-tipo').textContent = item.tipo || '—'

  // Descrição
  qs('#d-desc').textContent = item.descricao || '—'

  // Galeria adicional
  const gal = Array.isArray(item.galeria) ? item.galeria : []
  const wrap = qs('#d-galeria')
  if(gal.length===0){ wrap.innerHTML = '<em>Sem fotos adicionais.</em>' }
  else{
    wrap.innerHTML = gal.map(url=>`<img src="${url}" alt="Foto"/>`).join('')
  }
}

function montarThumbs(urls){
  const box = qs('#d-thumbs')
  box.innerHTML = ''
  let active = null
  urls.slice(0,12).forEach((u,idx)=>{
    const img = document.createElement('img')
    img.src = u
    img.alt = 'Miniatura'
    img.className = idx===0 ? 'active' : ''
    if(idx===0){ active = img }
    img.addEventListener('click', ()=>{
      qs('#d-img').src = u
      if(active) active.classList.remove('active')
      img.classList.add('active')
      active = img
    })
    box.appendChild(img)
  })
}

init()
