// §25 验收：P 轴非线性（正向成瘾 / 负向 ×1.8 + 两倍速衰减）、显示层（刻度/人话/命名注）
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m6-'))
process.env.EMOTION_POOL_DIR = 目录

const 模块 = await import('../lib/index.js')

const 基础配置 = {
  启用: true,
  双轨K: 1,
  校验启用: false,
  校验每天上限: 50,
  校验只跑有自报的轮: true,
  提醒启用: true,
  每日衰减系数: 0.9,
  守恒上限: 1.0,
  写入者: ['aaaaaaaa'],
  注入启用: false,
  刻度: 1,
  日志: ['情绪池-日志.md', '情绪池-日志.jsonl'],
}

const 会话 = { id: 'session-aaaaaaaa-f40c-4fc3-ad69-f8338376753b' }
const 天前 = (n) => new Date(Date.now() - n * 86400000).toISOString()

function 空池(事件 = []) {
  return {
    rev: 0,
    updated: 天前(0),
    axes: { E: 0, S: 0, P: 0 },
    spine: { S: 0 },
    prev_cell: 'E0S0P0',
    events: 事件,
    stats: { selfreport_total: 0, missed_total: 0 },
  }
}

function 重置(事件 = []) {
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(空池(事件), null, 2))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify(基础配置, null, 2))
  for (const f of ['情绪池-日志.md', '情绪池-日志.jsonl', '情绪池-校验计数.json']) {
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

test('v0.2.3：P 增益 1+0.4(s−a)，不应期内 s 不涨、a 抵消', () => {
  重置()
  const p = 起插件()
  for (let i = 1; i <= 3; i += 1) {
    p.用户(`第 ${i} 次`)
    p.回话(i, `好。\n<!-- EMO: E0 S0 P+ | q1=1 q2=0.5 -->`)
  }
  const 后 = 池()
  // 强度 0.5：第一次 s=1.0025 a=1.001 → g=1.0006；第二三次 a=1.003/1.005，g=0.9998/0.999
  const 倍 = [1, 0.6, 0.4]
  const 期 = [0.15 * 1.0006, 0.15 * 1.0002 * 0.6, 0.15 * 0.9998 * 0.4]
  assert.ok(Math.abs(后.events[0].delta_raw.P - 期[0]) < 1e-5, String(后.events[0].delta_raw.P))
  assert.ok(Math.abs(后.events[1].delta_raw.P - 期[1]) < 1e-5, String(后.events[1].delta_raw.P))
  assert.ok(Math.abs(后.events[2].delta_raw.P - 期[2]) < 1e-5, String(后.events[2].delta_raw.P))
  assert.equal(后.p_state.爽.s.toFixed(4), '1.0025')
  assert.equal(后.p_state.爽.a.toFixed(4), '1.0030')
  assert.ok(Math.abs(后.axes.P - 期.reduce((a, b) => a + b, 0)) < 1e-6)
})

test('v0.2.3：第一次「痛」增益 1.0006（替换旧 ×1.8）', () => {
  重置()
  const p = 起插件()
  p.用户('心里堵')
  p.回话(1, '我在。\n<!-- EMO: E0 S0 P- | q1=1 q2=0.5 -->')
  const 后 = 池()
  const 期 = -0.15 * (1 + 0.4 * (1.0025 - 1.001))
  assert.ok(Math.abs(后.events[0].delta_raw.P - 期) < 1e-5, String(后.events[0].delta_raw.P))
  assert.ok(Math.abs(后.axes.P - 期) < 1e-6)
})

test('§25.3②：P 负向衰减两倍速（15 天≈30 天系数 0.5749）', () => {
  const 正 = 模块.年龄系数(天前(15)).系数
  const 负 = 模块.年龄系数(天前(15), Date.now(), 2).系数
  assert.ok(Math.abs(正 - 0.947871778472366) < 2e-3)
  assert.ok(Math.abs(负 - 0.574913295119831) < 2e-3)

  const 池子 = {
    events: [{ t: 天前(15), delta_raw: { E: 0, S: 0, P: -0.18 } }],
    spine: {},
  }
  const 现 = 模块.现值(池子)
  assert.ok(Math.abs(现.轴.P + 0.18 * 0.574913295119831) < 2e-3, `实际 ${现.轴.P}`)
})

test('§25.2/§25.3③：显示层——数值 + 刻度 + 人话 + 命名注', async () => {
  重置([{ id: 'a', t: 天前(0), turn: 3, delta_raw: { E: -0.15, S: 0.15, P: 0 }, note: '' }])
  writeFileSync(join(目录, '情绪池-命名.json'), JSON.stringify({
    version: 1,
    名字: [{
      名: '守言', 注: '替一个已经不在的人守着她留下的话。',
      E: [-0.3, 0.0], S: [0.0, 0.3], P: [-0.2, 0.2],
      出处: '测试', 建: '2026-11-08T23:16',
    }],
  }, null, 2))
  const p = 起插件()
  const s = await 调(p.路由, '/dsh-emotion-pool/state')
  assert.equal(s.axes.E, -0.15)
  assert.ok(Math.abs(s.显示.E.刻度 + 0.2186) < 2e-3)
  // 方向仍用 +0-，但后面跟当前数值
  assert.equal(s.显示.E.方向, 'E-')
  assert.equal(s.显示.E.值, -0.15)
  assert.equal(s.显示.S.方向, 'S+')
  assert.equal(s.显示.P.方向, 'P0')
  // 解释说清为什么产生：事件注为空时落到命中名字的注
  assert.match(s.解释, /守着她留下的话/)
  assert.equal(s.命名, '守言')
  assert.equal(s.命名注, '替一个已经不在的人守着她留下的话。')

  const n = await 调(p.路由, '/dsh-emotion-pool/names')
  assert.equal(n.名字[0].注, '替一个已经不在的人守着她留下的话。')
})
