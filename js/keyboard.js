// SYP Analytics - Keyboard Shortcuts Module
// Power user keyboard shortcuts for fast navigation and actions

// ============================================================================
// SHORTCUT DEFINITIONS
// ============================================================================

const SHORTCUTS={
  'd':{action:()=>go('dashboard'),desc:'Dashboard',group:'Navigation'},
  'b':{action:()=>go('blotter'),desc:'Trade Blotter',group:'Navigation'},
  'q':{action:()=>go('quotes'),desc:'Quote Engine',group:'Navigation'},
  'r':{action:()=>go('risk'),desc:'Risk',group:'Navigation'},
  'c':{action:()=>go('crm'),desc:'CRM',group:'Navigation'},
  'm':{action:()=>go('millintel'),desc:'Mill Intel',group:'Navigation'},
  'a':{action:()=>go('analytics'),desc:'Analytics',group:'Navigation'},
  'l':{action:()=>go('leaderboard'),desc:'Leaderboard',group:'Navigation'},
  'p':{action:()=>go('pnl-calendar'),desc:'P&L',group:'Navigation'},
  'n':{action:()=>document.getElementById('new-buy-btn')?.click(),desc:'New Buy',group:'Actions'},
  'N':{action:()=>document.getElementById('new-sell-btn')?.click(),desc:'New Sell',group:'Actions'},
  '/':{action:()=>{const el=document.getElementById('search-input');if(el){el.focus();el.select()}},desc:'Search',group:'Actions'},
  '?':{action:()=>toggleShortcutOverlay(),desc:'Show Shortcuts',group:'System'},
  'Cmd+K':{action:()=>toggleCommandPalette(),desc:'Command Palette',group:'System'},
  'Escape':{action:()=>closeAllModals(),desc:'Close Modal',group:'System'}
}

let _shortcutOverlayVisible=false

// ============================================================================
// INITIALIZATION
// ============================================================================

function initKeyboard(){
  document.addEventListener('keydown',e=>{
    // Command palette: Cmd+K / Ctrl+K (works even in inputs)
    if(e.key==='k'&&(e.metaKey||e.ctrlKey)){
      e.preventDefault()
      toggleCommandPalette()
      return
    }

    // Skip when typing in input, textarea, select, or contentEditable
    const tag=e.target.tagName.toLowerCase()
    if(tag==='input'||tag==='textarea'||tag==='select')return
    if(e.target.isContentEditable)return

    // Build the key string
    let key=e.key

    // Handle / specially — prevent default browser find
    if(key==='/'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
      e.preventDefault()
    }

    // Handle ? (Shift+/) — use the raw key value
    // For Escape, use the key directly

    const shortcut=SHORTCUTS[key]
    if(shortcut&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
      e.preventDefault()
      shortcut.action()
    }
  })
}

// ============================================================================
// SHORTCUT OVERLAY
// ============================================================================

function toggleShortcutOverlay(){
  _shortcutOverlayVisible=!_shortcutOverlayVisible
  if(_shortcutOverlayVisible){
    showShortcutOverlay()
  }else{
    hideShortcutOverlay()
  }
}

function showShortcutOverlay(){
  _shortcutOverlayVisible=true
  let existing=document.getElementById('shortcut-overlay')
  if(existing){existing.remove()}

  // Group shortcuts
  const groups={}
  Object.entries(SHORTCUTS).forEach(([key,s])=>{
    const g=s.group||'Other'
    if(!groups[g])groups[g]=[]
    groups[g].push({key,desc:s.desc})
  })

  const groupsHtml=Object.entries(groups).map(([name,items])=>`
    <div style="margin-bottom:16px">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:8px;font-weight:600">${escapeHtml(name)}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        ${items.map(i=>`
          <div style="display:flex;align-items:center;gap:10px;padding:4px 0">
            <kbd style="display:inline-block;min-width:28px;padding:3px 8px;font-size:12px;font-weight:600;line-height:1.4;color:var(--fg);background:var(--panel-alt);border:1px solid var(--border);text-align:center;font-family:inherit">${escapeHtml(i.key==='Escape'?'Esc':i.key==='/'?'/':i.key)}</kbd>
            <span style="font-size:12px;color:var(--fg)">${escapeHtml(i.desc)}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('')

  const overlay=document.createElement('div')
  overlay.id='shortcut-overlay'
  overlay.style.cssText='position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);backdrop-filter:blur(2px)'
  overlay.onclick=e=>{if(e.target===overlay)hideShortcutOverlay()}
  overlay.innerHTML=`
    <div style="background:var(--panel);border:1px solid var(--border);padding:24px;width:420px;max-width:90vw;max-height:80vh;overflow-y:auto" onclick="event.stopPropagation()">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div style="font-size:14px;font-weight:700;color:var(--accent);letter-spacing:0.5px">KEYBOARD SHORTCUTS</div>
        <button onclick="hideShortcutOverlay()" style="background:none;border:none;color:var(--muted);font-size:18px;cursor:pointer;padding:4px 8px;line-height:1">&times;</button>
      </div>
      ${groupsHtml}
      <div style="margin-top:12px;font-size:10px;color:var(--muted);text-align:center">Press <kbd style="padding:2px 6px;font-size:10px;background:var(--panel-alt);border:1px solid var(--border)">?</kbd> or <kbd style="padding:2px 6px;font-size:10px;background:var(--panel-alt);border:1px solid var(--border)">Esc</kbd> to close</div>
    </div>`
  document.body.appendChild(overlay)
}

function hideShortcutOverlay(){
  _shortcutOverlayVisible=false
  const overlay=document.getElementById('shortcut-overlay')
  if(overlay)overlay.remove()
}

// ============================================================================
// MODAL MANAGEMENT
// ============================================================================

function closeAllModals(){
  // Close shortcut overlay if open
  if(_shortcutOverlayVisible){
    hideShortcutOverlay()
    return
  }
  // Close standard modal
  if(typeof closeModal==='function')closeModal()
  // Close command palette if open
  if(document.getElementById('cmd-palette')){closeCommandPalette();return}
  // Close any overlay elements
  const overlays=document.querySelectorAll('.modal-overlay')
  overlays.forEach(o=>o.remove())
}

// ============================================================================
// COMMAND PALETTE
// ============================================================================

let _cmdActiveIdx=0
let _cmdItems=[]

function toggleCommandPalette(){
  if(document.getElementById('cmd-palette'))closeCommandPalette()
  else openCommandPalette()
}

function openCommandPalette(){
  if(document.getElementById('cmd-palette'))return
  _cmdActiveIdx=0
  _cmdItems=[]
  const overlay=document.createElement('div')
  overlay.id='cmd-palette'
  overlay.className='cmd-palette-overlay'
  overlay.onclick=e=>{if(e.target===overlay)closeCommandPalette()}
  overlay.innerHTML=`
    <div class="cmd-palette-box">
      <input type="text" class="cmd-search-input" id="cmd-search" placeholder="Search views, actions, customers, mills..." autocomplete="off">
      <div class="cmd-results" id="cmd-results"></div>
    </div>`
  document.body.appendChild(overlay)
  const input=document.getElementById('cmd-search')
  input.focus()
  input.addEventListener('input',()=>updateCommandResults(input.value))
  input.addEventListener('keydown',handleCmdPaletteKeys)
  updateCommandResults('')
}

function closeCommandPalette(){
  const el=document.getElementById('cmd-palette')
  if(el)el.remove()
  _cmdItems=[]
  _cmdActiveIdx=0
}

function buildCommandItems(query){
  const q=query.toLowerCase().trim()
  const items=[]
  // Navigation
  const navItems=[
    {icon:'&#128202;',label:'Dashboard',sub:'Overview',type:'view',action:()=>go('dashboard')},
    {icon:'&#128202;',label:'Leaderboard',sub:'Dashboard > Leaderboard',type:'view',action:()=>go('leaderboard')},
    {icon:'&#128203;',label:'Trade Blotter',sub:'Trading',type:'view',action:()=>go('blotter')},
    {icon:'&#128203;',label:'P&L',sub:'Trading > P&L',type:'view',action:()=>go('pnl-calendar')},
    {icon:'&#128176;',label:'Quote Engine',sub:'Quotes',type:'view',action:()=>go('quotes')},
    {icon:'&#128229;',label:'Mill Intel',sub:'Mill Intelligence',type:'view',action:()=>go('millintel')},
    {icon:'&#128200;',label:'Analytics',sub:'Briefing & Analysis',type:'view',action:()=>go('analytics')},
    {icon:'&#128200;',label:'Risk',sub:'Analytics > Risk',type:'view',action:()=>go('risk')},
    {icon:'&#128100;',label:'CRM',sub:'Customer Management',type:'view',action:()=>go('crm')},
    {icon:'&#9881;',label:'Settings',sub:'Configuration',type:'view',action:()=>go('settings')}
  ]
  items.push(...navItems)
  // Actions
  items.push(
    {icon:'&#43;',label:'New Buy',sub:'Create buy trade',type:'action',action:()=>{if(typeof showBuyModal==='function')showBuyModal()}},
    {icon:'&#43;',label:'New Sell',sub:'Create sell trade',type:'action',action:()=>{if(typeof showSellModal==='function')showSellModal()}},
    {icon:'&#128196;',label:'Export PDF',sub:'Export current view',type:'action',action:()=>{if(typeof exportPDF==='function')exportPDF()}},
    {icon:'&#9681;',label:'Toggle Theme',sub:'Switch dark/light',type:'action',action:()=>{if(typeof toggleTheme==='function')toggleTheme()}},
    {icon:'&#63;',label:'Keyboard Shortcuts',sub:'Show shortcut overlay',type:'action',action:()=>toggleShortcutOverlay()}
  )
  // Customers
  if(typeof S!=='undefined'&&S.customers){
    S.customers.forEach(c=>{
      if(c.name)items.push({icon:'&#127970;',label:c.name,sub:'Customer'+(c.destination?' - '+c.destination:''),type:'customer',action:()=>{go('crm');S.crmTab='customers';S.selectedCustomer=c.name;render()}})
    })
  }
  // Mills
  if(typeof S!=='undefined'&&S.mills){
    S.mills.forEach(m=>{
      if(m.name)items.push({icon:'&#127981;',label:m.name,sub:'Mill'+(m.location?' - '+m.location:''),type:'mill',action:()=>{go('crm');S.crmTab='mills';render()}})
    })
  }
  if(!q)return items.slice(0,12)
  // Fuzzy filter
  return items.filter(item=>{
    const text=(item.label+' '+item.sub).toLowerCase()
    return text.includes(q)
  }).slice(0,12)
}

function highlightMatch(text,query){
  if(!query)return escapeHtml(text)
  const escaped=escapeHtml(text)
  const q=query.toLowerCase()
  const idx=text.toLowerCase().indexOf(q)
  if(idx<0)return escaped
  const before=escapeHtml(text.slice(0,idx))
  const match=escapeHtml(text.slice(idx,idx+query.length))
  const after=escapeHtml(text.slice(idx+query.length))
  return before+'<mark>'+match+'</mark>'+after
}

function updateCommandResults(query){
  _cmdItems=buildCommandItems(query)
  _cmdActiveIdx=0
  const container=document.getElementById('cmd-results')
  if(!container)return
  if(!_cmdItems.length){
    container.innerHTML='<div style="padding:20px;text-align:center;color:var(--muted);font-size:12px">No results found</div>'
    return
  }
  container.innerHTML=_cmdItems.map((item,i)=>
    '<div class="cmd-result-item'+(i===_cmdActiveIdx?' cmd-active':'')+'" data-cmd-idx="'+i+'" onclick="executeCommand('+i+')" onmouseenter="_cmdActiveIdx='+i+';updateCmdActive()">'+
    '<span class="cmd-icon">'+item.icon+'</span>'+
    '<div><div class="cmd-label">'+highlightMatch(item.label,query)+'</div>'+(item.sub?'<div class="cmd-sub">'+escapeHtml(item.sub)+'</div>':'')+'</div>'+
    '<div class="cmd-meta"><span class="cmd-type">'+escapeHtml(item.type)+'</span></div>'+
    '</div>'
  ).join('')
}

function updateCmdActive(){
  document.querySelectorAll('.cmd-result-item').forEach((el,i)=>{
    el.classList.toggle('cmd-active',i===_cmdActiveIdx)
  })
}

function executeCommand(idx){
  const item=_cmdItems[idx]
  if(!item)return
  closeCommandPalette()
  item.action()
}

function handleCmdPaletteKeys(e){
  if(e.key==='ArrowDown'){
    e.preventDefault()
    _cmdActiveIdx=Math.min(_cmdActiveIdx+1,_cmdItems.length-1)
    updateCmdActive()
    const active=document.querySelector('.cmd-result-item.cmd-active')
    if(active)active.scrollIntoView({block:'nearest'})
  }else if(e.key==='ArrowUp'){
    e.preventDefault()
    _cmdActiveIdx=Math.max(_cmdActiveIdx-1,0)
    updateCmdActive()
    const active=document.querySelector('.cmd-result-item.cmd-active')
    if(active)active.scrollIntoView({block:'nearest'})
  }else if(e.key==='Enter'){
    e.preventDefault()
    executeCommand(_cmdActiveIdx)
  }else if(e.key==='Escape'){
    e.preventDefault()
    closeCommandPalette()
  }
}
