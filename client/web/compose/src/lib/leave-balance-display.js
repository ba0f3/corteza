// Presentation only. Approval allocation remains authoritative on the server.
const inputs = ['entitlement', 'carried_in', 'carried_expires', 'adjustment', 'used', 'opening_used', 'used_from_carried', 'year', 'remaining']
const numbers = ['entitlement', 'carried_in', 'adjustment', 'used', 'opening_used', 'used_from_carried']

export function businessDay (now = new Date()) {
  return new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10)
}

export function isBalance (module) {
  return module && module.handle === 'leave_balance' && inputs.every(name => module.fields.some(f => f.name === name))
}

export function assertReadable (module) {
  if (!isBalance(module) || inputs.some(name => module.fields.find(f => f.name === name).canReadRecordValue !== true)) {
    throw new Error('Không đủ quyền đọc thông tin để tính số dư phép')
  }
}

export function valueMap (record) {
  if (Array.isArray(record.values)) {
    return Object.fromEntries(record.values.map(v => [v.name, v.value]))
  }
  return record.values || {}
}

function number (values, name) {
  const v = values[name]
  if (v === undefined || v === null || v === '') return 0
  const n = Number(v)
  if (!Number.isFinite(n)) throw new Error('Dữ liệu quỹ phép không hợp lệ')
  return n
}

export function remaining (values, day = businessDay()) {
  if (!/^\d{4}$/.test(String(values.year))) throw new Error('Thiếu năm của quỹ phép')
  const expiry = String(values.carried_expires || `${values.year}-03-31`).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry) || Number.isNaN(Date.parse(expiry + 'T00:00:00Z')) || new Date(expiry + 'T00:00:00Z').toISOString().slice(0, 10) !== expiry) throw new Error('Ngày hết hạn phép không hợp lệ')
  const carry = day <= expiry ? number(values, 'carried_in') : number(values, 'used_from_carried')
  return number(values, 'entitlement') + carry + number(values, 'adjustment') - number(values, 'used') - number(values, 'opening_used')
}

// Only replace the existing HRM sum(remaining) reports. All other reports keep
// their native server aggregate path. Query stays inside normal record ACL.
export function isBalanceReport (module, report) {
  return isBalance(module) && /sum\(remaining\)/i.test(report.metrics || '')
}

export async function queryBalanceReport (api, namespaceID, module, report, onCancel = () => {}, now = new Date()) {
  assertReadable(module)
  if (!report.filter) throw new Error('Thiếu phạm vi truy vấn quỹ phép')
  if (!['deletedAt', 'year'].includes(report.dimensions)) throw new Error('Chiều dữ liệu quỹ phép chưa được hỗ trợ')
  const metrics = (report.metrics || '').split(',').map(s => {
    const m = s.trim().match(/^sum\((\w+)\) AS (\w+)$/i)
    if (!m || ![...numbers, 'remaining'].includes(m[1])) throw new Error('Phép tổng hợp quỹ phép chưa được hỗ trợ')
    return { field: m[1], alias: m[2] }
  })
  const day = businessDay(now)
  const personalYear = report.dimensions === 'deletedAt'
  const query = personalYear ? `(${report.filter}) AND year = '${day.slice(0, 4)}'` : report.filter
  const rows = []
  let pageCursor
  const cursors = new Set()
  do {
    const request = api.recordListCancellable({ namespaceID, moduleID: module.moduleID, query, deleted: 0, limit: 100, sort: 'recordID ASC', pageCursor })
    onCancel(request.cancel)
    const result = await request.response()
    rows.push(...(result.set || []))
    if (rows.length > 1000) throw new Error('Quỹ phép vượt giới hạn truy vấn hiển thị')
    pageCursor = result.filter && result.filter.nextPage
    if (pageCursor && cursors.has(pageCursor)) throw new Error('Phân trang quỹ phép không hợp lệ')
    if (pageCursor) cursors.add(pageCursor)
  } while (pageCursor)
  if (personalYear && rows.length !== 1) throw new Error(rows.length ? 'Trùng quỹ phép nhân viên/năm' : 'Chưa có quỹ phép năm hiện tại')
  const groups = new Map()
  for (const row of rows) {
    const values = valueMap(row)
    const key = personalYear ? null : String(values.year)
    const group = groups.get(key) || { dimension_0: key, count: 0 }
    group.count++
    for (const m of metrics) {
      group[m.alias] = (group[m.alias] || 0) + (m.field === 'remaining' ? remaining(values, day) : number(values, m.field))
    }
    groups.set(key, group)
  }
  return [...groups.values()].sort((a, b) => String(a.dimension_0).localeCompare(String(b.dimension_0)))
}
