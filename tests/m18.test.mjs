// 2026-11-09 02:05：结的门槛随速率降；τ 按速率定；w=|值|×exp(−龄天/τ) 现算；w<0.02 沉底
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m18-'))
process.env.EMOTION_POOL_DIR = 目录

const 模块 = await import('../lib/index.js')

const 配置 = {
  启用: true, 校验启用: false, 校验每天上限: 50, 校验只跑有自报的轮: true, 提醒启用: false,
  每日衰减系数: 0.9, 守恒上限: 1.0, 写入者: ['aaaaaaaa'], 注入启用: false, 刺阈值: 0.25,
  日志: ['情绪池-日志.md', '情绪池-日志.jsonl'],
}

function 起插件(刺 = []) {
  const 池 = {
    rev: 0, updated: new Date().toISOString(), axes: { E: 0, S: 0, P: 0 }, spine: { E: 0, S: 0, P: 0 },
    prev_cell: 'E0S0P0', events: [], 刺, stats: { selfreport_total: 0, missed_total: 0 },
    p_state: { 爽: { s: 1, a: 1, 最近: null }, 痛: { s: 1, a: 1, 最近: null } },
  }
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(池, null, 2))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify(配置, null, 2))
  const 路由 = new Map()
  const ctx = {
    on() {}, effect(fn) { fn(); return () => {} },
    webServer: { register(o) { 路由.set(o.path, o.handler); return () => {} } },
    systemPrompt: { context: () => () => {} }, llm: {}, agents: { list: () => [] },
  }
  模块.apply(ctx)
  return { 路由 }
}

async function 取(路由, path) {
  let 回 = ''
  const req = { method: 'GET', socket: { remoteAddress: '127.0.0.1' }, url: path, async *[Symbol.asyncIterator]() {} }
  await 路由.get('/dsh-emotion-pool' + path.split('?')[0])(req, { set statusCode(v) {}, get statusCode() { return 200 }, setHeader() {}, writeHead() {}, end(s) { 回 = String(s) } })
  return JSON.parse(回)
}

test('门槛随速率降：0→0.25、0.05→0.22、0.10→0.20（封底 0.20）', () => {
  assert.equal(模块.结门槛(0), 0.25)
  assert.equal(模块.结门槛(0.05), 0.22)
  assert.equal(模块.结门槛(0.10), 0.20)
  assert.equal(模块.结门槛(1), 0.20)
})

test('τ：0→30 天、0.05→60、0.10→90，封顶 1000', () => {
  assert.equal(模块.结τ(0), 30)
  assert.equal(模块.结τ(0.05), 60)
  assert.equal(模块.结τ(0.10), 90)
  assert.equal(模块.结τ(10), 1000)
})

test('留存 w：同一结值 0.30，60 天后速率 0 约 0.041、速率 0.10 约 0.154', () => {
  const 六十天前 = new Date(Date.now() - 60 * 86400000).toISOString()
  const a = 模块.结留存({ t: 六十天前, 值: 0.3, 率: 0, τ: 30 })
  const b = 模块.结留存({ t: 六十天前, 值: 0.3, 率: 0.1, τ: 90 })
  assert.ok(Math.abs(a.w - 0.0406) < 0.002, `w0=${a.w}`)
  assert.ok(Math.abs(b.w - 0.1539) < 0.002, `w1=${b.w}`)
  assert.equal(a.沉底, false)
  assert.equal(b.沉底, false)
})

test('/state：结按 w 排序，w<0.02 沉底排在最后并带龄天', async () => {
  const 新 = { t: new Date().toISOString(), 轴: 'E', 值: 0.10, 率: 0.30, τ: 210, 注: '新事' }
  const 旧 = { t: new Date(Date.now() - 200 * 86400000).toISOString(), 轴: 'S', 值: 0.30, 率: 0, τ: 30, 注: '旧事' }
  const p = 起插件([旧, 新])
  const s = await 取(p.路由, '/state')
  assert.equal(s.结.length, 2)
  assert.equal(s.结[0].注, '新事')
  assert.equal(s.结[0].沉底, false)
  assert.equal(s.结[1].注, '旧事')
  assert.equal(s.结[1].沉底, true)
  assert.ok(s.结[1].龄天 >= 199)
  assert.equal(s.结沉底数, 1)
})

test('/list?kind=结：按 w 排，沉底也在列表里', async () => {
  const 新 = { t: new Date().toISOString(), 轴: 'E', 值: 0.10, 率: 0.30, τ: 210, 注: '新事' }
  const 旧 = { t: new Date(Date.now() - 200 * 86400000).toISOString(), 轴: 'S', 值: 0.30, 率: 0, τ: 30, 注: '旧事' }
  const p = 起插件([旧, 新])
  const s = await 取(p.路由, '/list?kind=结&offset=0&limit=20')
  assert.equal(s.total, 2)
  assert.equal(s.items.length, 2)
  assert.equal(s.items[1].注, '新事')
  assert.equal(s.items[0].注, '旧事')
  assert.equal(s.items[0].沉底, true)
})
