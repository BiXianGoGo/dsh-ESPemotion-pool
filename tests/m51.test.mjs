// v0.17 收尾包验收：结窗/streak 按会话、旧结构迁移、v1 白名单、刺→结、现值单参
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m51-'))
process.env.EMOTION_POOL_DIR = 目录
const 模块 = await import('../lib/index.js?m51=' + Date.now())

const 配 = (写 = ['aaaaaaaa', 'cccccccc', 'aaaaaaaa', 'bbbbbbbb']) => ({ 启用: true, 写入者: 写, 刻度: 1, 日志: ['情绪池-日志.md'] })

function 池(额外 = {}) {
  return { rev: 0, updated: new Date().toISOString(), axes: { E: 0, S: 0, P: 0 }, spine: { E: 0, S: 0, P: 0 }, prev_cell: 'E0S0P0', events: [], 结: [], stats: { selfreport_total: 0, missed_total: 0 }, p_state: { 爽: { s: 1, a: 1, 最近: null }, 痛: { s: 1, a: 1, 最近: null } }, ...额外 }
}
function 起(p = 池(), c = 配()) {
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(p, null, 2))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify(c, null, 2))
  const 路由 = new Map()
  const ctx = { on() {}, effect(fn) { fn(); return () => {} }, webServer: { register(o) { 路由.set(o.path, o.handler); return () => {} } }, systemPrompt: { context: () => () => {} }, llm: {}, agents: { list: () => [] } }
  模块.apply(ctx)
  return 路由
}
async function 发(路由, path, 体) {
  let 回 = ''; let 码 = 200
  const req = { method: 'POST', socket: { remoteAddress: '127.0.0.1' }, url: path, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(体)) } }
  await 路由.get('/dsh-emotion-pool' + path)(req, { set statusCode(v) { 码 = v }, get statusCode() { return 码 }, setHeader() {}, end(s) { 回 = String(s) } })
  return { 码, 回: JSON.parse(回 || '{}') }
}
const 读池 = () => JSON.parse(readFileSync(join(目录, '情绪池.json'), 'utf8'))
const 读日志 = () => existsSync(join(目录, '情绪池-日志.md')) ? readFileSync(join(目录, '情绪池-日志.md'), 'utf8') : ''

test('两间各自计 streak/结窗：互不递减、互不清零', async () => {
  const 路由 = 起()
  await 发(路由, '/report', { E: 0.15, S: 0, P: 0, 轮: 'a1', 会话: 'session-aaaaaaaa-1111' })
  await 发(路由, '/report', { E: 0.15, S: 0, P: 0, 轮: 'b1', 会话: 'session-bbbbbbbb-2222' })
  const p = 读池()
  assert.equal(p.streak.aaaaaaaa.E.n, 1)
  assert.equal(p.streak.bbbbbbbb.E.n, 1)
  assert.ok(Math.abs(p.events[0].delta_raw.E - 0.15) < 1e-9)
  assert.ok(Math.abs(p.events[1].delta_raw.E - 0.15) < 1e-9, '第二间不该被第一间的同向递减压')
})

test('旧结窗/旧 streak 只在读入时归到 写入者[0]，只迁一次', async () => {
  const 现 = new Date().toISOString()
  起(池({ 结窗: { E: { dir: 1, sum: 0.3, t: Date.now() }, S: { dir: 0, sum: 0, t: 0 }, P: { dir: 0, sum: 0, t: 0 } }, streak: { E: { n: 2, dir: 1, t: Date.now() }, S: { n: 0, dir: 0, t: 0 }, P: { n: 0, dir: 0, t: 0 } } }))
  const p1 = 模块.读池()
  assert.equal(p1.结窗.aaaaaaaa.E.sum, 0.3)
  assert.equal(p1.streak.aaaaaaaa.E.n, 2)
  assert.equal(p1.结窗.E, undefined)
  assert.ok(读日志().includes('旧结窗已归到 aaaaaaaa'))
  const 前 = (读日志().match(/旧结窗已归到/g) || []).length
  模块.读池()
  const 后 = (读日志().match(/旧结窗已归到/g) || []).length
  assert.equal(后, 前, '第二次读不该再迁一遍')
})

test('v1/report：写入者名单内的 cccccccc 能写，名单外 403', async () => {
  const 路由 = 起()
  const 好 = await 发(路由, '/v1/report', { E: 0.15, S: 0, P: 0, 轮: 'x1', 来源: 'probe', 会话: 'session-cccccccc-7cd3-44e9-9c9a-abae7c728005' })
  assert.equal(好.码, 200)
  const 坏 = await 发(路由, '/v1/report', { E: 0.15, S: 0, P: 0, 轮: 'x2', 来源: 'probe', 会话: 'session-zzzz-0000' })
  assert.equal(坏.码, 403)
  assert.ok(String(坏.回.error).includes('只接受写入者名单内的会话'))
})

test('v1/report：写入者名单为空 → 403', async () => {
  const 路由 = 起(池(), 配([]))
  const r = await 发(路由, '/v1/report', { E: 0.15, S: 0, P: 0, 轮: 'y1', 来源: 'probe', 会话: 'session-aaaaaaaa-f40c-4fc3-ad69-f8338376753b' })
  assert.equal(r.码, 403)
})

test('池.刺 → 结：读入迁移、旧键消失、/state.刺 同值别名', async () => {
  const 旧刺 = [{ t: new Date().toISOString(), 轴: 'P', 值: 0.3, 注: '疼', 率: 0.1, 速: '急' }]
  起(池({ 刺: 旧刺 }))
  const p = 模块.读池()
  assert.equal(p.刺, undefined)
  assert.equal(p.结.length, 1)
  const 路 = 起(读池())
  const req = { method: 'GET', socket: { remoteAddress: '127.0.0.1' }, url: '/dsh-emotion-pool/state', async *[Symbol.asyncIterator]() {} }
  let 回 = ''
  await 路.get('/dsh-emotion-pool/state')(req, { setHeader() {}, end(s) { 回 = String(s) }, set statusCode(v) {}, get statusCode() { return 200 } })
  const s = JSON.parse(回)
  assert.deepEqual(s.刺, s.结)
  assert.deepEqual(s.刺合计, s.结合计)
})

test('现值(池) 单参：与旧两参行为一致', () => {
  const p = 池({ events: [{ t: new Date().toISOString(), delta_raw: { E: 0.2, S: -0.1, P: 0 }, note: 'x', sid: 'aaaaaaaa', turn: '1' }], 快照启用: false })
  const a = 模块.现值(p)
  const b = 模块.现值(p, 1.0)
  assert.deepEqual(a.轴, b.轴)
  assert.deepEqual(a.合, b.合)
})