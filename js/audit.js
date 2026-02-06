// SYP Analytics - Audit Trail Client
// Logs all significant actions locally and to server

const logAudit = (action, entityType, entityId, entityName, oldValue, newValue, details) => {
  const entry = {
    timestamp: new Date().toISOString(),
    user: S.trader || 'unknown',
    action,
    entityType,
    entityId,
    entityName,
    oldValue: oldValue ? JSON.stringify(oldValue) : null,
    newValue: newValue ? JSON.stringify(newValue) : null,
    details
  }
  if (!S.auditLog) S.auditLog = []
  S.auditLog.unshift(entry)
  if (S.auditLog.length > 500) S.auditLog = S.auditLog.slice(0, 500)
  SS('auditLog', S.auditLog)

  // Send to server (fire-and-forget)
  fetch('/api/audit/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry)
  }).catch(() => {})
}

// Convenience: log trade creation
const logTradeCreated = (type, trade) => {
  const name = type === 'buy'
    ? `${trade.orderNum || ''} ${trade.mill || ''}`.trim()
    : `${trade.orderNum || ''} ${trade.customer || ''}`.trim()
  logAudit(
    'create',
    type,
    trade.id,
    name || 'New Trade',
    null,
    { product: trade.product, volume: trade.volume, price: trade.price },
    `${type === 'buy' ? 'Buy' : 'Sell'} created: ${trade.product || ''} / ${fmtN(trade.volume)} MBF / ${fmt(trade.price)}`
  )
}

// Convenience: log trade modification with diff
const logTradeModified = (type, tradeId, oldTrade, newTrade) => {
  const changes = []
  const fields = ['product', 'price', 'volume', 'mill', 'customer', 'destination', 'origin', 'region', 'notes', 'shipWeek', 'length']
  fields.forEach(f => {
    if (oldTrade[f] !== newTrade[f]) {
      changes.push(`${f}: ${oldTrade[f] || '—'} -> ${newTrade[f] || '—'}`)
    }
  })
  if (changes.length === 0) return
  const name = type === 'buy'
    ? `${newTrade.orderNum || ''} ${newTrade.mill || ''}`.trim()
    : `${newTrade.orderNum || ''} ${newTrade.customer || ''}`.trim()
  logAudit(
    'modify',
    type,
    tradeId,
    name || 'Trade',
    oldTrade,
    newTrade,
    changes.join('; ')
  )
}

// Convenience: log trade deletion
const logTradeDeleted = (type, trade) => {
  const name = type === 'buy'
    ? `${trade.orderNum || ''} ${trade.mill || ''}`.trim()
    : `${trade.orderNum || ''} ${trade.customer || ''}`.trim()
  logAudit(
    'delete',
    type,
    trade.id,
    name || 'Trade',
    { product: trade.product, volume: trade.volume, price: trade.price },
    null,
    `${type === 'buy' ? 'Buy' : 'Sell'} deleted: ${trade.product || ''} / ${fmtN(trade.volume)} MBF`
  )
}

// Convenience: log workflow status change
const logStatusChange = (tradeId, oldStatus, newStatus, notes) => {
  logAudit(
    'status_change',
    'trade',
    tradeId,
    `Trade ${tradeId}`,
    { status: oldStatus },
    { status: newStatus },
    notes || `Status: ${oldStatus} -> ${newStatus}`
  )
}

// Convenience: log CRM actions
const logCRMAction = (action, entityType, entity) => {
  logAudit(
    action,
    entityType,
    entity.id || entity.name,
    entity.name || 'Unknown',
    action === 'delete' ? entity : null,
    action === 'create' ? entity : null,
    `${entityType} ${action}: ${entity.name || ''}`
  )
}

// Retrieve filtered audit entries from local log
const getAuditLog = (filters = {}) => {
  if (!S.auditLog) S.auditLog = []
  let entries = [...S.auditLog]

  if (filters.action) entries = entries.filter(e => e.action === filters.action)
  if (filters.entityType) entries = entries.filter(e => e.entityType === filters.entityType)
  if (filters.entityId) entries = entries.filter(e => String(e.entityId) === String(filters.entityId))
  if (filters.user) entries = entries.filter(e => e.user === filters.user)
  if (filters.since) {
    const since = new Date(filters.since).getTime()
    entries = entries.filter(e => new Date(e.timestamp).getTime() >= since)
  }
  if (filters.limit) entries = entries.slice(0, filters.limit)

  return entries
}

// Format relative time for display
const _auditRelativeTime = (timestamp) => {
  const now = Date.now()
  const then = new Date(timestamp).getTime()
  const diff = now - then
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Action icon and class mapping
const _auditIcon = (action) => {
  const map = {
    create: { icon: '+', cls: 'create' },
    modify: { icon: '~', cls: 'modify' },
    delete: { icon: 'x', cls: 'delete' },
    status_change: { icon: '>', cls: 'status' }
  }
  return map[action] || { icon: '?', cls: 'info' }
}

// Render audit timeline HTML
const renderAuditTimeline = (entries) => {
  if (!entries || entries.length === 0) {
    return '<div style="padding:24px;text-align:center;color:var(--muted);font-size:12px">No audit entries</div>'
  }

  return `<div class="audit-timeline">${entries.map(e => {
    const { icon, cls } = _auditIcon(e.action)
    return `<div class="audit-entry">
      <div class="audit-time">${escapeHtml(_auditRelativeTime(e.timestamp))}</div>
      <div class="audit-icon audit-icon-${cls}">${icon}</div>
      <div class="audit-detail">
        <strong>${escapeHtml(e.user || 'System')}</strong>
        ${e.action === 'create' ? 'created' : e.action === 'modify' ? 'modified' : e.action === 'delete' ? 'deleted' : 'updated'}
        ${escapeHtml(e.entityType || '')}
        <span class="audit-entity">${escapeHtml(e.entityName || '')}</span>
        ${e.details ? `<div class="audit-meta">${escapeHtml(e.details)}</div>` : ''}
      </div>
    </div>`
  }).join('')}</div>`
}
