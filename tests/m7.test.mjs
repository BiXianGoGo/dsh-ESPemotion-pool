// §26 验收：P 轴敏感化 s / 适应 a（按方向+类型分账，7 天无同类事件后回落）
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m7-'))
process.env.EMOTION_POOL_DIR = 目录

const 模块 = await import('../lib/index.js')

const 基础配置 = {
  启用: true,
  双轨K: 1,
  校验启用: false,
  校验每天上限: 50,
  校验只跑有自报的轮: true,
  提醒启用: false,
  每日衰减系数: 0.9,
  守恒上限: 1.0,
  写入者: ['aaaaaaaa'],
  注入启用: false,
  刻度: 1,
  日志: ['情绪池-日志.md', '情绪池-日志.jsonl'],
}

const 会话 = { id: 'session-aaaaaaaa-f40c-4fc3-ad69-f8338376753b' }
const 天前 = (n) => new Date(Date.now() - n * 86400000).toISOString()

function 空池(事件 = [], p_state = null) {
  const o = {
    rev: 0,
    updated: 天前(0),
    axes: { E: 0, S: 0, P: 0 },
    spine: { S: 0 },
    prev_cell: 'E0S0P0',
    events: 事件,
    stats: { selfreport_total: 0, missed_total: 0 },
  }
  if (p_state) { o.p_state = p_state; o.P敏感迁移 = { at: 天前(0) } }
  return o
}

function 重置(事件 = [], p_state = null) {
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(空池(事件, p_state), null, 2))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify(基础配置, null, 2))
  for (const f of ['情绪池-日志.md', '情绪池-日志.jsonl']) {
    const p = join(目录, f)
    if (existsSync(p)) rmSync(p)
  }
}

const 池 = () => JSON.parse(readFileSync(join(目录, '情绪池.json'), 'utf8'))

function 起插件() {
  const 监听 = []
  const 路由 = new Map()
  const ctx = {
    on(_名, fn) { 监听.push(fn) },
    effect(fn) { fn(); return () => {} },
    webServer: { register(o) { 路由.set(o.path, o.handler); return () => {} } },
    systemPrompt: { context: () => () => {} },
    llm: {},
    agents: { list: () => [] },
  }
  模块.apply(ctx)
  const 发 = (ev) => { for (const fn of 监听) fn(会话, ev) }
  return {
    路由,
    用户: (t) => 发({ type: 'user/message', data: { message: { role: 'user', content: [{ type: 'text', text: t }] } } }),
    回话: (轮, t) => 发({ type: 'assistant/message', data: { turn: 轮, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: t }] } } }),
  }
}

async function 调(路由, path) {
  let 体 = ''
  await 路由.get(path)({ method: 'GET', async *[Symbol.asyncIterator]() {} }, { statusCode: 200, setHeader() {}, end(s) { 体 = String(s) } })
  return JSON.parse(体)
}

before(() => 重置())

test('v0.2.3：第一次「痛」后 s=1.0025、a=1.001，增益 1.0006', () => {
  重置()
  const p = 起插件()
  p.用户('有点难受')
  p.回话(1, '嗯。\n<!-- EMO: E0 S0 P- | q1=1 q2=0.5 -->')
  const 后 = 池()
  const 期 = -0.15 * 1.0006
  assert.ok(Math.abs(后.events[0].delta_raw.P - 期) < 1e-5, `实际 ${后.events[0].delta_raw.P}`)
  assert.equal(后.p_state.痛.s.toFixed(4), '1.0025')
  assert.equal(后.p_state.痛.a.toFixed(3), '1.001')
  assert.ok(后.p_state.痛.最近)
})

test('v0.2.3：连续 5 次同类，不应期内 s 只涨一次（1.0025），a 每次都涨（1.005）', () => {
  重置()
  const p = 起插件()
  for (let i = 1; i <= 5; i += 1) {
    p.用户(`第 ${i} 次`)
    p.回话(i, '好。\n<!-- EMO: E0 S0 P- | q1=1 q2=0.5 -->')
  }
  const 后 = 池()
  assert.equal(后.p_state.痛.s.toFixed(4), '1.0025')
  assert.equal(后.p_state.痛.a.toFixed(3), '1.005')
})

test('v0.2.3：3 天无同类事件后，每天 a −0.002（s 不动）', () => {
  重置([], { 痛: { s: 1.2, a: 0.8, 最近: 天前(10) }, 爽: { s: 1, a: 1, 最近: null } })
  const 落 = 模块.回落后的敏感({ s: 1.2, a: 0.8, 最近: 天前(10) })
  assert.ok(Math.abs(落.s - 1.2) < 1e-9)
  assert.ok(Math.abs(落.a - 0.786) < 1e-9)
  const p = 起插件()
  p.用户('又疼')
  p.回话(1, '嗯。\n<!-- EMO: E0 S0 P- | q1=1 q2=0.5 -->')
  const 后 = 池()
  assert.equal(后.p_state.痛.s.toFixed(4), '1.2025')
  // 应用启动时会先跑一次戒断（a 再 −0.002），所以允许 ±0.02
  assert.ok(Math.abs(后.p_state.痛.a - 0.785) < 0.02, String(后.p_state.痛.a))
})

test('§26：爽 / 痛 两本账互不影响', () => {
  重置()
  const p = 起插件()
  p.用户('开心')
  p.回话(1, '好。\n<!-- EMO: E0 S0 P+ | q1=1 q2=0.5 -->')
  p.用户('难受')
  p.回话(2, '嗯。\n<!-- EMO: E0 S0 P- | q1=1 q2=0.5 -->')
  const 后 = 池()
  assert.equal(后.p_state.爽.s.toFixed(4), '1.0025')
  assert.equal(后.p_state.爽.a.toFixed(3), '1.001')
  assert.equal(后.p_state.痛.s.toFixed(4), '1.0025')
  assert.equal(后.p_state.痛.a.toFixed(3), '1.001')
})

test('§26：/state 显示敏感/适应两个系数', async () => {
  重置([], { 痛: { s: 1.05, a: 0.95, 最近: 天前(0) }, 爽: { s: 1, a: 1, 最近: null } })
  const p = 起插件()
  const s = await 调(p.路由, '/dsh-emotion-pool/state')
  assert.equal(s.敏感适应.痛.敏感, 1.05)
  assert.equal(s.敏感适应.痛.适应, 0.95)
  assert.equal(s.敏感适应.爽.敏感, 1)
  assert.equal(s.敏感适应.爽.适应, 1)
})
test('v0.2.3：增益上限 1.3（s=1.5, a=0.75），单轴不超 0.30', () => {
  重置([], { 痛: { s: 1.5, a: 0.75, 最近: 天前(0) }, 爽: { s: 1, a: 1, 最近: null } })
  const p = 起插件()
  p.用户('很疼')
  p.回话(1, '嗯。\n<!-- EMO: E0 S0 P- | q1=1 q2=0.5 -->')
  const 后 = 池()
  assert.ok(Math.abs(后.events[0].delta_raw.P + 0.19494) < 1e-6, String(后.events[0].delta_raw.P))
  assert.equal(后.p_state.痛.s, 1.5)
})

test('§27.4：适应地板 0.75，不往下掉', () => {
  重置([], { 痛: { s: 1, a: 0.751, 最近: 天前(0) }, 爽: { s: 1, a: 1, 最近: null } })
  const p = 起插件()
  p.用户('又疼')
  p.回话(1, '嗯。\n<!-- EMO: E0 S0 P- | q1=1 q2=0.5 -->')
  const 后 = 池()
  assert.ok(Math.abs(后.p_state.痛.a - 0.752) < 1e-9, String(后.p_state.痛.a))
})