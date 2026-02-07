// SYP Analytics - Trade Workflow Engine
// State machine for trade status lifecycle + quote-to-trade pipeline

// Valid status transitions
const VALID_TRANSITIONS = {
  draft: ['pending', 'cancelled'],
  pending: ['approved', 'cancelled'],
  approved: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: ['settled'],
  settled: [],
  cancelled: ['draft']
}

// Status display metadata
const STATUS_META = {
  draft: { label: 'Draft', color: 'var(--muted)', bg: 'rgba(136,136,136,0.15)' },
  pending: { label: 'Pending', color: 'var(--warn)', bg: 'rgba(232,195,74,0.15)' },
  approved: { label: 'Approved', color: 'var(--info)', bg: 'rgba(74,144,232,0.15)' },
  confirmed: { label: 'Confirmed', color: 'var(--accent)', bg: 'rgba(232,115,74,0.15)' },
  shipped: { label: 'Shipped', color: 'var(--warn)', bg: 'rgba(232,195,74,0.15)' },
  delivered: { label: 'Delivered', color: 'var(--positive)', bg: 'rgba(74,232,128,0.15)' },
  settled: { label: 'Settled', color: 'var(--positive)', bg: 'rgba(74,232,128,0.25)' },
  cancelled: { label: 'Cancelled', color: 'var(--negative)', bg: 'rgba(232,74,74,0.15)' }
}

// Initialize trade statuses store
const _initTradeStatuses = () => {
  if (!S.tradeStatuses) S.tradeStatuses = LS('tradeStatuses', {})
}

// Get current trade status
const getTradeStatus = (tradeId) => {
  _initTradeStatuses()
  return S.tradeStatuses[tradeId] || 'draft'
}

// Get valid next statuses from current
const canAdvance = (currentStatus) => {
  return VALID_TRANSITIONS[currentStatus] || []
}

// Check if trade requires approval based on rules
const requiresApproval = (trade) => {
  if (!trade) return false
  // Volume > 100 MBF
  if ((trade.volume || 0) > 100) return true
  // Total value > $50,000
  if ((trade.price || 0) * (trade.volume || 0) > 50000) return true
  // New customer (first trade)
  if (trade.customer) {
    const custTrades = S.sells.filter(s =>
      s.customer === trade.customer && s.id !== trade.id && s.status !== 'cancelled'
    )
    if (custTrades.length === 0) return true
  }
  // Price deviation > 10% from RL benchmark
  if (trade.product && trade.price) {
    const latestRL = S.rl && S.rl.length > 0 ? S.rl[S.rl.length - 1] : null
    if (latestRL) {
      const region = trade.region || 'central'
      const prodKey = trade.product.replace(/\s+/g, '').replace(/#/g, '#')
      const benchmark = latestRL[region] && latestRL[region][prodKey]
      if (benchmark && benchmark > 0) {
        const deviation = Math.abs(trade.price - benchmark) / benchmark
        if (deviation > 0.10) return true
      }
    }
  }
  return false
}

// Set trade status with validation and audit logging
const setTradeStatus = (tradeId, tradeType, newStatus, notes) => {
  _initTradeStatuses()
  const oldStatus = S.tradeStatuses[tradeId] || 'draft'

  // Validate transition
  const valid = canAdvance(oldStatus)
  if (oldStatus !== newStatus && !valid.includes(newStatus)) {
    showToast(`Cannot move from ${oldStatus} to ${newStatus}`, 'warn')
    return false
  }

  S.tradeStatuses[tradeId] = newStatus
  SS('tradeStatuses', S.tradeStatuses)

  // Log the status change
  if (typeof logStatusChange === 'function' && oldStatus !== newStatus) {
    logStatusChange(tradeId, oldStatus, newStatus, notes)
  }

  return true
}

// Advance to the next valid status
const advanceTradeStatus = (tradeId, tradeType, notes) => {
  _initTradeStatuses()
  const current = S.tradeStatuses[tradeId] || 'draft'
  const next = canAdvance(current)

  if (next.length === 0) {
    showToast('No further transitions available', 'info')
    return false
  }

  // Pick first non-cancelled transition (prefer forward movement)
  const target = next.find(s => s !== 'cancelled') || next[0]

  // Check approval requirement when moving to pending
  if (target === 'pending') {
    const trades = tradeType === 'buy' ? S.buys : S.sells
    const trade = trades.find(t => t.id === tradeId)
    if (trade && requiresApproval(trade)) {
      showToast('Trade requires approval — moved to pending review', 'warn')
    }
  }

  const result = setTradeStatus(tradeId, tradeType, target, notes)
  if (result) {
    showToast(`Status: ${current} -> ${target}`, 'positive')
    render()
  }
  return result
}

// Get all trades pending approval
const getApprovalQueue = () => {
  _initTradeStatuses()
  const queue = []

  S.buys.filter(b => getTradeStatus(b.id) === 'pending').forEach(b => {
    if (requiresApproval(b)) {
      queue.push({ ...b, type: 'buy', status: 'pending' })
    }
  })

  S.sells.filter(s => getTradeStatus(s.id) === 'pending').forEach(s => {
    if (requiresApproval(s)) {
      queue.push({ ...s, type: 'sell', status: 'pending' })
    }
  })

  return queue.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
}

// Count trades needing action (pending status)
const getPendingCount = () => {
  _initTradeStatuses()
  let count = 0
  S.buys.forEach(b => { if (getTradeStatus(b.id) === 'pending') count++ })
  S.sells.forEach(s => { if (getTradeStatus(s.id) === 'pending') count++ })
  return count
}

// Render a status badge
const renderStatusBadge = (status) => {
  const meta = STATUS_META[status] || STATUS_META.draft
  return `<span class="status-badge" style="display:inline-block;padding:2px 8px;font-size:10px;font-weight:600;text-transform:uppercase;color:${meta.color};background:${meta.bg};border:1px solid ${meta.color}">${escapeHtml(meta.label)}</span>`
}

// Render workflow action buttons for a trade
const renderWorkflowActions = (tradeId, currentStatus) => {
  const next = canAdvance(currentStatus)
  if (next.length === 0) return ''

  return `<div class="workflow-actions" style="display:flex;gap:4px;margin-top:6px">${next.map(s => {
    const meta = STATUS_META[s] || STATUS_META.draft
    const isCancelled = s === 'cancelled'
    return `<button class="btn btn-sm" style="font-size:10px;padding:2px 8px;background:${isCancelled ? 'transparent' : meta.bg};color:${meta.color};border:1px solid ${meta.color}" onclick="advanceTradeStatusTo('${tradeId}','${s}')">${meta.label}</button>`
  }).join('')}</div>`
}

// Helper for onclick — advance to specific status
const advanceTradeStatusTo = (tradeId, newStatus) => {
  const tradeType = S.buys.find(b => b.id === tradeId) ? 'buy' : 'sell'
  setTradeStatus(tradeId, tradeType, newStatus)
  render()
}

// Render the full approval queue panel
const renderApprovalQueue = () => {
  const queue = getApprovalQueue()
  if (queue.length === 0) {
    return '<div style="padding:16px;text-align:center;color:var(--muted);font-size:12px">No trades pending approval</div>'
  }

  return `<div class="approval-queue">
    <div style="font-weight:600;margin-bottom:12px;font-size:12px;text-transform:uppercase;color:var(--muted)">Pending Approval (${queue.length})</div>
    ${queue.map(t => {
      const isBuy = t.type === 'buy'
      const counterparty = isBuy ? (t.mill || '—') : (t.customer || '—')
      const totalVal = (t.price || 0) * (t.volume || 0)
      const reasons = []
      if ((t.volume || 0) > 100) reasons.push('High volume')
      if (totalVal > 50000) reasons.push('High value')
      if (t.customer) {
        const custTrades = S.sells.filter(s => s.customer === t.customer && s.id !== t.id && s.status !== 'cancelled')
        if (custTrades.length === 0) reasons.push('New customer')
      }

      return `<div style="padding:10px;margin-bottom:8px;background:var(--panel-alt);border:1px solid var(--warn);border-radius:var(--radius,4px)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div>
            <span style="font-weight:600;color:${isBuy ? 'var(--positive)' : 'var(--info)'}">${isBuy ? 'BUY' : 'SELL'}</span>
            <span style="margin-left:8px;font-size:11px">${escapeHtml(t.orderNum || t.po || '—')}</span>
          </div>
          <div style="display:flex;gap:4px">
            <button class="btn btn-sm btn-success" style="font-size:10px;padding:2px 8px" onclick="setTradeStatus(${t.id},'${t.type}','approved','Approved');render()">Approve</button>
            <button class="btn btn-sm btn-danger" style="font-size:10px;padding:2px 8px" onclick="setTradeStatus(${t.id},'${t.type}','cancelled','Rejected');render()">Reject</button>
          </div>
        </div>
        <div style="font-size:10px;display:grid;grid-template-columns:1fr 1fr;gap:4px">
          <div><span style="color:var(--muted)">${isBuy ? 'Mill' : 'Customer'}:</span> ${escapeHtml(counterparty)}</div>
          <div><span style="color:var(--muted)">Product:</span> ${escapeHtml(t.product || '')} ${escapeHtml(t.length || 'RL')}</div>
          <div><span style="color:var(--muted)">Volume:</span> ${fmtN(t.volume)} MBF</div>
          <div><span style="color:var(--muted)">Price:</span> ${fmt(t.price)}</div>
        </div>
        ${reasons.length ? `<div style="margin-top:6px;font-size:9px;color:var(--warn)">Flags: ${reasons.join(', ')}</div>` : ''}
      </div>`
    }).join('')}
  </div>`
}

// ============================================================================
// QUOTE-TO-TRADE PIPELINE
// ============================================================================

// Quote status definitions
const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired']

// Get quote status
const getQuoteStatus = (quoteId) => {
  if (!S.quoteStatuses) S.quoteStatuses = LS('quoteStatuses', {})
  return S.quoteStatuses[quoteId] || 'draft'
}

// Set quote status with audit logging
const setQuoteStatus = (quoteId, status) => {
  if (!S.quoteStatuses) S.quoteStatuses = LS('quoteStatuses', {})
  if (!QUOTE_STATUSES.includes(status)) {
    showToast(`Invalid quote status: ${status}`, 'warn')
    return false
  }
  const oldStatus = S.quoteStatuses[quoteId] || 'draft'
  S.quoteStatuses[quoteId] = status
  SS('quoteStatuses', S.quoteStatuses)

  if (typeof logAudit === 'function') {
    logAudit('status_change', 'quote', quoteId, `Quote ${quoteId}`, { status: oldStatus }, { status }, `Quote status: ${oldStatus} -> ${status}`)
  }
  return true
}

// Convert an accepted quote into linked buy/sell draft trades
const convertQuoteToTrades = (quoteId) => {
  const quote = (S.quoteItems || []).find(q => q.id === quoteId)
  if (!quote) {
    showToast('Quote not found', 'warn')
    return null
  }

  const qStatus = getQuoteStatus(quoteId)
  if (qStatus !== 'accepted') {
    showToast('Only accepted quotes can be converted to trades', 'warn')
    return null
  }

  const buyId = genId()
  const sellId = genId()
  const orderNum = `Q${quoteId}-${Date.now().toString(36).slice(-4).toUpperCase()}`

  // Create buy draft
  const buy = {
    id: buyId,
    orderNum,
    date: today(),
    mill: quote.mill || quote.source || '',
    origin: quote.origin || '',
    region: quote.region || 'central',
    product: quote.product || '',
    length: quote.length || 'RL',
    price: quote.cost || quote.fobPrice || 0,
    volume: quote.volume || 0,
    notes: `From Quote #${quoteId}`,
    trader: S.trader || 'Ian P',
    miles: 0,
    rate: 0,
    freight: 0,
    tally: null
  }

  // Create sell draft
  const sell = {
    id: sellId,
    orderNum,
    linkedPO: orderNum,
    oc: orderNum,
    date: today(),
    customer: quote.customer || '',
    destination: quote.destination || '',
    region: quote.region || 'central',
    product: quote.product || '',
    length: quote.length || 'RL',
    price: quote.sellPrice || quote.landedPrice || 0,
    volume: quote.volume || 0,
    freight: quote.freight || 0,
    miles: quote.miles || 0,
    rate: quote.rate || S.flatRate || 3.50,
    notes: `From Quote #${quoteId}`,
    trader: S.trader || 'Ian P',
    delivered: false,
    tally: null
  }

  S.buys.unshift(buy)
  S.sells.unshift(sell)

  // Set initial statuses to draft
  setTradeStatus(buyId, 'buy', 'draft', 'Created from quote')
  setTradeStatus(sellId, 'sell', 'draft', 'Created from quote')

  // Log audit
  if (typeof logTradeCreated === 'function') {
    logTradeCreated('buy', buy)
    logTradeCreated('sell', sell)
  }
  if (typeof logAudit === 'function') {
    logAudit('convert', 'quote', quoteId, `Quote ${quoteId}`, null, { buyId, sellId, orderNum }, 'Quote converted to linked buy/sell trades')
  }

  saveAllLocal()
  showToast(`Quote converted — Order #${orderNum}`, 'positive')
  render()

  return { buyId, sellId, orderNum }
}
