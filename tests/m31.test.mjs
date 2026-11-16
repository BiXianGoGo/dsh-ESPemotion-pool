// v0.5 A：刻度 10（显示/输入），内部仍 -1~+1
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m31-'))
process.env.EMOTION_POOL_DIR = 目录
const 模 = await import('../lib/index.js')

const 会话 = 'session-aaaaaaaa-f40c-4fc3-ad69-f8338376753b'
const 基础 = {
  启用: true, 校验启用: false, 校验每天上限: 50, 校验只跑有自报的轮: true, 提醒启用: false,
  每日衰减系数: 0.9, 守恒上限: 1.0, 写入者: ['aaaaaaaa'], 注入启用: false, 刺阈值: 0.25,
  结累计阈值: 0.45, 结急阈值: 0.2, 结急速率: 0.05,
  双轨校验: false, 一致阈值: 0.1, 报警阈值: 0.4, 报警冷却小时: 24,
  日志: ['情绪池-日志.md', '情绪池-日志.jsonl'], 刻度: 10,
}
function 起(刻度 = 10, 事件 = []) {
  const 配置 = {
  ...基础, 刻度 }
  const p = {
    rev: 0, updated: new Date().toISOString(), axes: { E: 0, S: 0, P: 0 },
    spine: { E: 0, S: 0, P: 0 }, overflow: { E: 0, S: 0, P: 0 }, prev_cell: 'E0S0P0',
    events: 事件, 结: [], stats: { selfreport_total: 0, missed_total: 0 },
    p_state: { 爽: { s: 1, a: 1, 最近: null }, 痛: { s: 1, a: 1, 最近: null } },
    streak: { aaaaaaaa: { E: { n: 0, dir: 0, t: 0 }, S: { n: 0, dir: 0, t: 0 }, P: { n: 0, dir: 0, t: 0 } } },
  }
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(p, null, 2))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify(配置, null, 2))
  const 路由 = new Map()
  const ctx = {
    on() {}, effect(fn) { fn(); return () => {} },
    webServer: { register(o) { 路由.set(o.path, o.handler); return () => {} } },
    systemPrompt: { context: () => () => {} },
  }
  模.apply(ctx)
  return { 路由, 池: () => JSON.parse(readFileSync(join(目录, '情绪池.json'), 'utf8')) }
}
async function 请求(路由, 路径, 体, 方法 = 'POST') {
  let 回 = ''; let 码 = 200
  const req = { method: 方法, socket: { remoteAddress: '127.0.0.1' }, url: 路径, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(体 || {})) } }
  await 路由.get(路径)(req, { set statusCode(v) { 码 = v }, get statusCode() { return 码 }, setHeader() {}, end(s) { 回 = String(s) } })
  return { 码, 体: JSON.parse(回 || '{}') }
}

test('刻度 10：/report E+1 入口先除，内部记 0.1', async () => {
  const { 路由, 池 } = 起(10)
  const r = await 请求(路由, '/dsh-emotion-pool/report', { E: 1, 注: '试刻度' })
  assert.equal(r.码, 200)
  const e = 池().events.at(-1)
  assert.ok(Math.abs(e.delta_raw.E - 0.1) < 1e-9, JSON.stringify(e.delta_raw))
})

test('刻度 10：/state 显示层乘 10，并标分母', async () => {
  const 事件 = [{ id: 'e1', t: new Date().toISOString(), delta_raw: { E: 0.3, S: -0.1, P: 0 }, note: 'x' }]
  const { 路由 } = 起(10, 事件)
  const { 体 } = await 请求(路由, '/dsh-emotion-pool/state', null, 'GET')
  assert.equal(体.刻度, 10)
  assert.ok(Math.abs(体.axes.E - 3) < 1e-6, String(体.axes.E))
  assert.ok(Math.abs(体.axes.S - -1) < 1e-6, String(体.axes.S))
  assert.match(体.显示文本, /\/ 10/)
  assert.match(体.显示.E.文本, /\/ 10/)
  assert.ok(Math.abs(体.事件明细.at(-1).delta_raw.E - 3) < 1e-6)
})

test('刻度 1 与 10 等价：E 0.1 和 E 1 落在同一点', async () => {
  const a = 起(1)
  await 请求(a.路由, '/dsh-emotion-pool/report', { E: 0.1 })
  const b = 起(10)
  await 请求(b.路由, '/dsh-emotion-pool/report', { E: 1 })
  assert.ok(Math.abs(a.池().events.at(-1).delta_raw.E - b.池().events.at(-1).delta_raw.E) < 1e-9)
})

test('刻度 10：/name 收刻度单位，/names 原样按刻度吐回', async () => {
  const { 路由 } = 起(10)
  const 加 = await 请求(路由, '/dsh-emotion-pool/name', { 名: '满格', 注: '顶到 9 以上', E: [8, 10], S: [-1, 1], P: [-1, 1], 出处: 'test' })
  assert.equal(加.码, 200, JSON.stringify(加.体))
  const { 体 } = await 请求(路由, '/dsh-emotion-pool/names', null, 'GET')
  const 条 = 体.名字.find((n) => n.名 === '满格')
  assert.ok(条, JSON.stringify(体.名字))
  assert.deepEqual(条.E, { lo: 8, hi: 10 })
})

test('刻度 10：/set 收刻度单位（spine.S 5 → 内部 0.5）', async () => {
  const { 路由 } = 起(10)
  const r = await 请求(路由, '/dsh-emotion-pool/set', { spine: { S: 5 }, 原因: '试刻度' })
  assert.equal(r.码, 200)
  assert.ok(Math.abs(r.体.spine.S - 0.5) < 1e-9, JSON.stringify(r.体.spine))
})