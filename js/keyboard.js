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
  'm':{action:()=>go('mi-prices'),desc:'Mill Intel',group:'Navigation'},
  'a':{action:()=>go('benchmark'),desc:'Analytics',group:'Navigation'},
  'l':{action:()=>go('leaderboard'),desc:'Leaderboard',group:'Navigation'},
  'p':{action:()=>go('pnl-calendar'),desc:'P&L Calendar',group:'Navigation'},
  'n':{action:()=>document.getElementById('new-buy-btn')?.click(),desc:'New Buy',group:'Actions'},
  'N':{action:()=>document.getElementById('new-sell-btn')?.click(),desc:'New Sell',group:'Actions'},
  '/':{action:()=>{const el=document.getElementById('search-input');if(el){el.focus();el.select()}},desc:'Search',group:'Actions'},
  '?':{action:()=>toggleShortcutOverlay(),desc:'Show Shortcuts',group:'System'},
  'Escape':{action:()=>closeAllModals(),desc:'Close Modal',group:'System'}
}

let _shortcutOverlayVisible=false

// ============================================================================
// INITIALIZATION
// ============================================================================

function initKeyboard(){
  document.addEventListener('keydown',e=>{
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
            <kbd style="display:inline-block;min-width:28px;padding:3px 8px;font-size:12px;font-weight:600;line-height:1.4;color:var(--fg);background:var(--panel-alt);border:1px solid var(--border);border-radius:4px;text-align:center;font-family:inherit">${escapeHtml(i.key==='Escape'?'Esc':i.key==='/'?'/':i.key)}</kbd>
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
    <div style="background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:24px;width:420px;max-width:90vw;max-height:80vh;overflow-y:auto" onclick="event.stopPropagation()">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div style="font-size:14px;font-weight:700;color:var(--accent);letter-spacing:0.5px">KEYBOARD SHORTCUTS</div>
        <button onclick="hideShortcutOverlay()" style="background:none;border:none;color:var(--muted);font-size:18px;cursor:pointer;padding:4px 8px;line-height:1">&times;</button>
      </div>
      ${groupsHtml}
      <div style="margin-top:12px;font-size:10px;color:var(--muted);text-align:center">Press <kbd style="padding:2px 6px;font-size:10px;background:var(--panel-alt);border:1px solid var(--border);border-radius:3px">?</kbd> or <kbd style="padding:2px 6px;font-size:10px;background:var(--panel-alt);border:1px solid var(--border);border-radius:3px">Esc</kbd> to close</div>
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
  // Close any overlay elements
  const overlays=document.querySelectorAll('.modal-overlay')
  overlays.forEach(o=>o.remove())
}
