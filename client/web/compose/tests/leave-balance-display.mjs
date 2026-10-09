import assert from 'node:assert/strict'
import fs from 'node:fs'
const source = fs.readFileSync(new URL('../src/lib/leave-balance-display.js', import.meta.url), 'utf8')
const { businessDay, remaining, queryBalanceReport, isBalanceReport } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
const before = new Date('2026-03-31T16:59:59Z')
const after = new Date('2026-03-31T17:00:00Z')
assert.equal(businessDay(before), '2026-03-31')
assert.equal(businessDay(after), '2026-04-01')
const values = Object.freeze({ year: '2026', entitlement: '3', carried_in: '3', carried_expires: '2026-03-31T00:00:00Z', used: '0', used_from_carried: '0', remaining: '6' })
assert.equal(remaining(values, businessDay(before)), 6)
assert.equal(remaining(values, businessDay(after)), 3)
const consumed = { ...values, used: '2', used_from_carried: '2', remaining: '4' }
assert.equal(remaining(consumed, businessDay(before)), 4)
assert.equal(remaining(consumed, businessDay(after)), 3)
assert.equal(remaining({ ...consumed, carried_in: '0' }, businessDay(after)), 3)
assert.equal(remaining({ ...values, adjustment: '-1', opening_used: '1' }, businessDay(after)), 1)
assert.throws(() => remaining({ ...values, entitlement: 'broken' }), /không hợp lệ/)
const names = ['entitlement', 'carried_in', 'carried_expires', 'adjustment', 'used', 'opening_used', 'used_from_carried', 'year', 'remaining']
const module = { handle: 'leave_balance', moduleID: 'balance-module', fields: names.map(name => ({ name, canReadRecordValue: true })) }
const raw = v => ({ values: Object.entries(v).map(([name, value]) => ({ name, value })) })
const report = { moduleID: module.moduleID, filter: "self_email = 'employee@example.invalid'", metrics: 'sum(remaining) AS rp', dimensions: 'deletedAt' }
assert.equal(isBalanceReport(module, report), true)
assert.equal(isBalanceReport({ ...module, handle: 'other' }, report), false)
const requests = []
const api = { recordListCancellable: args => { requests.push(args); return { cancel () {}, response: async () => ({ set: [raw(consumed)], filter: {} }) } } }
const cancelled = []
assert.deepEqual(await queryBalanceReport(api, 'ns', module, report, fn => cancelled.push(fn), after), [{ dimension_0: null, count: 1, rp: 3 }])
assert.equal(cancelled.length, 1)
assert.equal(requests[0].query, "(self_email = 'employee@example.invalid') AND year = '2026'")
assert.equal(requests[0].deleted, 0)
const restricted = { ...module, fields: module.fields.map(f => ({ ...f, canReadRecordValue: f.name !== 'used_from_carried' })) }
await assert.rejects(queryBalanceReport(api, 'ns', restricted, report, undefined, after), /Không đủ quyền/)
assert.equal(requests.length, 1, 'No API query on denied source fields')
await assert.rejects(queryBalanceReport(api, 'ns', module, { ...report, filter: '' }, undefined, after), /phạm vi/)
const empty = { recordListCancellable: () => ({ cancel () {}, response: async () => ({ set: [], filter: {} }) }) }
await assert.rejects(queryBalanceReport(empty, 'ns', module, report, undefined, after), /Chưa có/)
const duplicate = { recordListCancellable: () => ({ cancel () {}, response: async () => ({ set: [raw(values), raw(values)], filter: {} }) }) }
await assert.rejects(queryBalanceReport(duplicate, 'ns', module, report, undefined, after), /Trùng/)
let pages = 0
const paged = { recordListCancellable: args => ({ cancel () {}, response: async () => {
 pages++
 assert.equal(args.pageCursor, pages === 1 ? undefined : 'cursor-2')
 return { set: [raw({ ...consumed, year: pages === 1 ? '2026' : '2025' })], filter: { nextPage: pages === 1 ? 'cursor-2' : undefined } }
} }) }
assert.deepEqual(await queryBalanceReport(paged, 'ns', module, { ...report, dimensions: 'year', metrics: 'sum(entitlement) AS sum_entitlement,sum(used) AS sum_used,sum(remaining) AS sum_remaining' }, undefined, after), [
 { dimension_0: '2025', count: 1, sum_entitlement: 3, sum_used: 2, sum_remaining: 3 },
 { dimension_0: '2026', count: 1, sum_entitlement: 3, sum_used: 2, sum_remaining: 3 },
])
assert.equal(values.remaining, '6', 'Rendering does not modify the stored field')
console.log('PASS: query/display midnight, carry audit, ACL, scope, missing/duplicate and pagination regressions')
