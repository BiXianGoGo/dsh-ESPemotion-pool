// 2026-11-09 01:53：①「刺」对外文案统一叫「结」（内部仍 池.结 / spine）②/list 分页（结 500→400、事件 2000→1500，删前写日志）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m16-'))
process.env.EMOTION_POOL_DIR = 目录

const 模块 = await import('../lib/index.js')

function 空池() {
  return {
    rev: 0, updated: new Date().toISOString(), axes: { E: 0, S: 0, P: 0 }, spine: { S: 0 },
    prev_cell: 'E0S0P0', events: [], 结: [], stats: { selfreport_total: 0, missed_total: 0 },
    p_state: { 爽: { s: 1, a: 1, 最近: null }, 痛: { s: 1, a: 1, 最近: null } },
  }
}

function 起插件(池) {
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(池 || 空池(), null, 2))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify({ 启用: true, 写入者: ['aaaaaaaa'], 日志: ['情绪池-日志.md'] }, null, 2))
  const 路由 = new Map()
  const ctx = {
    on() {},
    effect(fn) { fn(); return () => {} },
    webServer: { register(o) { 路由.set(o.path, o.handler); return () => {} } },
    systemPrompt: { context: () => () => {} }, llm: {}, agents: { list: () => [] },
  }
  模块.apply(ctx)
  return { 路由 }
}

async function 取(路由, path) {
  let 回 = ''
  let 码 = 200
  const req = { method: 'GET', socket: { remoteAddress: '127.0.0.1' }, async *[Symbol.asyncIterator]() {}, url: path }
  const 键 = '/dsh-emotion-pool' + path.split('?')[0].replace(/^\/dsh-emotion-pool/, '')
  await 路由.get(键)(req, { set statusCode(v) { 码 = v }, get statusCode() { return 码 }, setHeader() {}, writeHead() {}, end(s) { 回 = String(s) } })
  return { 码, 回 }
}

async function 发(路由, path, 体) {
  let 回 = ''
  let 码 = 200
  const req = {
    method: 'POST', socket: { remoteAddress: '127.0.0.1' }, url: path,
    async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(体)) },
  }
  await 路由.get('/dsh-emotion-pool' + path)(req, { set statusCode(v) { 码 = v }, get statusCode() { return 码 }, setHeader() {}, writeHead() {}, end(s) { 回 = String(s) } })
  return { 码, 回 }
}

function 读池() { return JSON.parse(readFileSync(join(目录, '情绪池.json'), 'utf8')) }
function 读日志() { const p = join(目录, '情绪池-日志.md'); return existsSync(p) ? readFileSync(p, 'utf8') : '' }

test('对外文案：/state 用 结 / 结合计，不再露出 刺', async () => {
  const 池 = 空池()
  池.结 = [{ t: new Date().toISOString(), 轴: 'P', 值: -0.1, 注: '他疼' }]
  const { 路由 } = 起插件(池)
  const r = await 取(路由, '/dsh-emotion-pool/state')
  const s = JSON.parse(r.回)
  assert.ok(Array.isArray(s.结) && s.结.length === 1)
  assert.equal(s.结合计.P, -0.1)
  // v0.17：旧字段名保留同值别名（deprecated，v0.18 删）
  assert.deepEqual(s.结, s.结)
  assert.deepEqual(s.刺, s.结)
  assert.deepEqual(s.刺合计, s.结合计)
})

test('/list：结按留存排序分页，翻页不重不漏', async () => {
  const 池 = 空池()
  for (let i = 0; i < 45; i++) 池.结.push({ t: new Date(Date.now() - (45 - i) * 60000).toISOString(), 轴: 'S', 值: 0.1, 注: 'n' + i })
  const { 路由 } = 起插件(池)
  const a = await 取(路由, '/list?kind=结&offset=0&limit=20')
  const oa = JSON.parse(a.回)
  assert.equal(oa.total, 45)
  assert.equal(oa.items.length, 20)
  const b = await 取(路由, '/list?kind=结&offset=20&limit=20')
  const ob = JSON.parse(b.回)
  assert.equal(ob.items.length, 20)
  const c = await 取(路由, '/list?kind=结&offset=40&limit=20')
  const oc = JSON.parse(c.回)
  assert.equal(oc.items.length, 5)
  const 所有 = new Set([...oa.items, ...ob.items, ...oc.items].map((x) => x.注))
  assert.equal(所有.size, 45)
})

test('修剪：结超过 500 删到 400，删前写日志', async () => {
  const 池 = 空池()
  for (let i = 0; i < 501; i++) 池.结.push({ t: new Date(Date.now() - (501 - i) * 60000).toISOString(), 轴: 'S', 值: 0.1, 注: 'c' + i })
  writeFileSync(join(目录, '情绪池-日志.md'), '')
  const { 路由 } = 起插件(池)
  const r = await 发(路由, '/report', { E: 0, S: 0.15, P: 0, 注: '触发修剪' })
  assert.equal(r.码, 200)
  const 后 = 读池()
  assert.equal(后.结.length, 400)
  assert.equal(后.结[399].注, 'c500')
  assert.ok(读日志().includes('结超 500'))
  assert.ok(读日志().includes('剩 400'))
})

test('修剪：事件超过 2000 删到 1500，删前写日志', async () => {
  const 池 = 空池()
  for (let i = 0; i < 2001; i++) 池.events.push({ id: 'e' + i, t: new Date(Date.now() - (2001 - i) * 60000).toISOString(), delta_raw: {}, note: '' })
  writeFileSync(join(目录, '情绪池-日志.md'), '')
  const { 路由 } = 起插件(池)
  const r = await 发(路由, '/report', { E: 0.15, S: 0, P: 0, 注: '触发修剪' })
  assert.equal(r.码, 200)
  const 后 = 读池()
  assert.equal(后.events.length, 1500)
  assert.ok(读日志().includes('事件超 2000'))
})
