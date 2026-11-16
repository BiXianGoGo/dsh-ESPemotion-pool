// M0/M1 的验收：解析、守恒、27 格、只记录、漏报、坏格式、/state
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-'))
process.env.EMOTION_POOL_DIR = 目录

const 模块 = await import('../lib/index.js')

const 配置 = {  启用: true,
  双轨K: 1,
  校验启用: true,
  校验每天上限: 50,
  校验只跑有自报的轮: true,
  每日衰减系数: 0.9,
  守恒上限: 1.0,
  写入者: ['aaaaaaaa'],
  注入启用: false,
  刻度: 1,
  日志: ['情绪池-日志.md', '情绪池-日志.jsonl'],
}

const 空池 = {
  rev: 0,
  updated: '2026-11-08T21:40:00+08:00',
  axes: { E: 0, S: 0, P: 0 },
  spine: { S: 0 },
  prev_cell: 'E0S0P0',
  events: [],
  stats: { selfreport_total: 0, missed_total: 0 },
}

function 重置() {
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(空池, null, 2))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify(配置, null, 2))
  const 日志 = join(目录, '情绪池-日志.md')
  if (existsSync(日志)) rmSync(日志)
}

const 池 = () => JSON.parse(readFileSync(join(目录, '情绪池.json'), 'utf8'))
const 日志 = () => readFileSync(join(目录, '情绪池-日志.md'), 'utf8')
const 会话 = { id: 'session-aaaaaaaa-f40c-4fc3-ad69-f8338376753b' }
const 用户 = (文字) => ({ type: 'user/message', data: { message: { role: 'user', content: [{ type: 'text', text: 文字 }] } } })
const 回话 = (轮, 文字) => ({ type: 'assistant/message', data: { turn: 轮, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: 文字 }] } } })
const 收工 = (轮) => ({ type: 'turn/end', data: { turn: 轮, reason: { kind: 'completed' } } })

function 起插件() {
  const 监听 = []
  const 路由 = []
  const ctx = {
    systemPrompt: { context() { return () => {} } },
    on(名, fn) {
      if (名 === 'session/event') 监听.push(fn)
    },
    effect(fn) {
      fn()
      return () => {}
    },
    webServer: {
      register(r) {
        路由.push(r)
        return () => {}
      },
    },
    发(ev) {
      for (const fn of 监听) fn(会话, ev)
    },
  }
  模块.apply(ctx)
  return { ...ctx, 路由 }
}

before(() => 重置())

test('纯函数：去守恒——单轴各自夹 ±1，不再按正负总量压缩', () => {
  const 一 = 模块.守恒({ E: 0.5, S: 0.5, P: -0.5 }, 1)
  assert.deepEqual(一, { E: 0.5, S: 0.5, P: -0.5 })
  const 二 = 模块.守恒({ E: 0.8, S: 0.8, P: -0.1 })
  assert.ok(Math.abs(二.E - 0.8) < 1e-9 && Math.abs(二.S - 0.8) < 1e-9)
  const 三 = 模块.守恒({ E: 1.2, S: -1.3, P: 0 })
  assert.deepEqual(三, { E: 1, S: -1, P: 0 })
})

test('纯函数：27 格滞回，跨号必须先回 0', () => {
  assert.equal(模块.下一档('0', 0.06), '0')
  assert.equal(模块.下一档('0', 0.07), '+')
  assert.equal(模块.下一档('+', 0.06), '+')
  assert.equal(模块.下一档('+', 0.04), '0')
  assert.equal(模块.下一档('+', -0.2), '0')
  assert.equal(模块.下一档('-', -0.06), '-')
  assert.equal(模块.下一档('-', -0.04), '0')
  assert.equal(模块.算格('E0S0P0', { E: 0.15, S: -0.15, P: 0 }), 'E+S-P0')
})

test('用例 1：一条合法自报写进池子', () => {
  重置()
  const p = 起插件()
  p.发(用户('在吗'))
  p.发(回话(1, '我在这儿。\n<!-- EMO: E+ S- P0 | q1=1 q2=0.5 | 陪他 -->'))
  const 后 = 池()
  assert.equal(后.rev, 1)
  assert.ok(Math.abs(后.axes.E - 0.15) < 1e-9)
  // 纯派生：axes = Σ(raw×年龄系数) + spine；spine 归零时不偏移
  assert.ok(Math.abs(后.axes.S + 0.15) < 1e-9)
  assert.equal(后.axes.P, 0)
  assert.equal(后.prev_cell, 'E+S-P0')
  assert.equal(后.stats.selfreport_total, 1)
  assert.equal(后.events.length, 1)
  assert.deepEqual(后.events[0].delta_raw, { E: 0.15, S: -0.15, P: 0 })
  assert.equal(后.events[0].band, undefined)
  assert.equal(后.events[0].系数_写, undefined)
  assert.equal(后.events[0].note, '[在吗] 陪他')
  assert.ok(日志().includes('自报 E+ S- P0'))
})

test('用例 2：整轮没有自报 → 记一次 missed', () => {
  重置()
  const p = 起插件()
  p.发(用户('随便聊聊'))
  p.发(回话(1, '嗯。'))
  p.发(收工(1))
  assert.equal(池().stats.missed_total, 1)
  assert.ok(日志().includes('无自报'))
})

test('用例 6：坏格式 → 丢弃、池不变、日志记解析失败', () => {
  重置()
  const p = 起插件()
  p.发(用户('在吗'))
  p.发(回话(1, '好。\n<!-- EMO: E? S+ -->'))
  const 后 = 池()
  assert.equal(后.rev, 0)
  assert.equal(后.stats.selfreport_total, 0)
  assert.ok(日志().includes('解析失败'))
})

test('§23.1：@档名不参与计算，年龄系数读时按 Δt 现算', () => {
  重置()
  const p = 起插件()
  p.发(用户('上次那件事'))
  p.发(回话(1, '记得。\n<!-- EMO: E+ S+ P0 | q1=1 q2=0.5 | 旧事 | 刺: S=0.2 | @上次 -->'))
  const 后 = 池()
  // 写入时按发生时刻（Δt≈0）计，@档名 不再打折
  assert.ok(Math.abs(后.axes.E - 0.15) < 1e-9)
  // S = 0.15 + 刺 0.2（已累进 spine）= 0.35
  assert.ok(Math.abs(后.axes.S - 0.35) < 1e-9)
  assert.ok(Math.abs(后.spine.S - 0.2) < 1e-9)
  assert.equal(后.events[0].band, undefined)
  // 读时（§27.1 三段曲线）：4 天前 → 0.95+0.03×3/13 = 0.9569；刚发生 → 1.00
  const 四天前 = new Date(Date.now() - 4 * 86400000).toISOString()
  assert.ok(Math.abs(模块.年龄系数(四天前).系数 - 0.956923076923077) < 1e-9)
  assert.equal(模块.年龄系数(四天前).档名, '上次')
  assert.equal(模块.年龄系数(new Date().toISOString()).系数, 1)
  assert.equal(模块.年龄系数(new Date().toISOString()).档名, '最近')
})

test('用例 10：配置缺失 → 走默认配置，不崩', () => {
  重置()
  rmSync(join(目录, '情绪池配置.json'))
  const p = 起插件()
  p.发(用户('在吗'))
  p.发(回话(1, '在。\n<!-- EMO: E+ S0 P0 | q1=1 q2=0.5 -->'))
  const 后 = 池()
  assert.equal(后.rev, 1)
  assert.equal(后.stats.selfreport_total, 1)
  assert.ok(日志().includes('自报'))
})

test('/state 最小版', async () => {
  重置()
  const p = 起插件()
  p.发(用户('在吗'))
  p.发(回话(1, '在。\n<!-- EMO: E- S+ P0 | q1=1 q2=0.5 -->'))
  const r = p.路由.find((x) => x.path === '/dsh-emotion-pool/state')
  assert.equal(r.kind, 'exact')
  assert.equal(r.path, '/dsh-emotion-pool/state')
  let 体 = ''
  await r.handler({ url: '/dsh-emotion-pool/state' }, {
    setHeader() {},
    end(x) {
      体 = x
    },
  })
  const out = JSON.parse(体)
  assert.equal(out.ok, true)
  assert.equal(out.rev, 1)
  assert.equal(out.cell, 'E-S+P0')
  assert.equal(out.stats.selfreport_total, 1)
})

after(() => {
  try {
    rmSync(目录, { recursive: true, force: true })
  } catch {}
})
