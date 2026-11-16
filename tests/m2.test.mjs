// M2 验收：每日衰减、改档补差、守恒混合、并发写（用例 3/4/5/8）
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m2-'))
process.env.EMOTION_POOL_DIR = 目录

const 模块 = await import('../lib/index.js')
const 模块路径 = fileURLToPath(new URL('../lib/index.js', import.meta.url))

const 配置 = {  启用: true,
  双轨K: 1,
  校验启用: false,
  校验每天上限: 50,
  校验只跑有自报的轮: true,
  每日衰减系数: 0.9,
  守恒上限: 1.0,
  写入者: ['aaaaaaaa', 'dddddddd'],
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
  last_decay: 今天(),
  last_sums: null,
}

function 今天() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function 昨天() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
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
const 另一会 = { id: 'session-dddddddd-0c89-438e-aa4e-aeaeb3d9c240' }
const 用户 = (文字) => ({ type: 'user/message', data: { message: { role: 'user', content: [{ type: 'text', text: 文字 }] } } })
const 回话 = (轮, 文字) => ({ type: 'assistant/message', data: { turn: 轮, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: 文字 }] } } })

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
    发(ev, 会 = 会话) {
      for (const fn of 监听) fn(会, ev)
    },
  }
  模块.apply(ctx)
  return { ...ctx, 路由 }
}

before(() => 重置())

test('纯函数：派生 + 守恒，没有每日衰减', () => {
  const 池 = {
    spine: { S: 0 },
    events: [
      { t: new Date().toISOString(), delta_raw: { E: 0.2, S: -0.2, P: 0 } },
      { t: new Date(Date.now() - 4 * 86400000).toISOString(), delta_raw: { E: 0.2, S: -0.2, P: 0 } },
    ],
  }
  const 现 = 模块.现值(池)
  assert.ok(Math.abs(现.合.E - (0.2 + 0.2 * 0.956923076923077)) < 1e-6)
  assert.ok(Math.abs(现.合.S - (-0.2 - 0.2 * 0.956923076923077)) < 1e-6)
  assert.equal(模块.结算衰减, undefined, '每日衰减口径应已删除')
})

test('用例 3：连续 7 次 E+，按 Δt 现算、不贴 1.0', () => {
  重置()
  const p = 起插件()
  for (let i = 1; i <= 7; i += 1) {
    p.发(用户(`第 ${i} 次`))
    p.发(回话(i, `好。\n<!-- EMO: E+ S0 P0 | q1=1 q2=0.5 -->`))
  }
  const 后 = 池()
  assert.equal(后.events.length, 7)
  // 把 7 条事件摊到「6 天前 … 今天」，读时按年龄系数现算
  const 龄 = [6, 5, 4, 3, 2, 1, 0]
  后.events.forEach((e, i) => {
    e.t = new Date(Date.now() - 龄[i] * 86400000).toISOString()
  })
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(后, null, 2))
  const 现 = 模块.现值(后)
  // §27.1：6→0.9615、5→0.9592、4→0.9569、3→0.9546、2→0.9523、1→0.95、0→1.0
  // 2026-11-09 01:30：同轴连续同向递减 1 / 0.6 / 0.4 / 0.2 / 0.2 / 0.2 / 0.2
  // 0.2：无轨迹轮由兜底按 k=0.4 推快照；7 轮后的快照和
  const 期望 = 0.4036846154471153
  // 递减之后 7 条不再贴 1.0（约 0.40），守恒只兜底
  assert.ok(Math.abs(现.合.E - 期望) < 1e-6, `缩前 ${现.合.E} 应等于 ${期望}`)
  assert.ok(现.轴.E <= 1.0 + 1e-9, `守恒后不该超过 1.0，实际 ${现.轴.E}`)
  assert.ok(日志(), '应有守恒/写入日志')
  assert.ok(!日志().includes('衰减'), '纯派生后不该再有每日衰减日志')
})

test('用例 4：守恒只压同号超出，混合强度保留', () => {
  // 纯函数：去守恒后单轴不再按正负总量压缩，原样返回
  const 混 = 模块.守恒({ E: -0.8, S: -0.8, P: 0.1 })
  assert.ok(Math.abs(混.E + 0.8) < 1e-9)
  assert.ok(Math.abs(混.S + 0.8) < 1e-9)
  assert.ok(Math.abs(混.P - 0.1) < 1e-9)

  // 写一条三轴全负：v0.2.3 增益 1.0006 → 负和 0.15+0.15+0.15009=0.45009，没超 1.0，不该被压
  重置()
  const p = 起插件()
  p.发(用户('心里堵'))
  p.发(回话(1, '我在。\n<!-- EMO: E- S- P- | q1=1 q2=0.5 | 堵 -->'))
  const 后 = 池()
  assert.ok(Math.abs(后.axes.E + 0.15) < 1e-9)
  assert.ok(Math.abs(后.axes.S + 0.15) < 1e-9)
  // v0.2.3：P 增益 1.0006，轴值 −0.15009
  assert.ok(Math.abs(后.axes.P + 0.15009) < 1e-4)
  assert.equal(后.prev_cell, 'E-S-P-')
  assert.ok(Math.abs(后.last_sums.缩前.负 - 0.45009) < 1e-4)
  assert.ok(Math.abs(后.last_sums.缩后.负 - 0.45009) < 1e-4)
})

test('用例 5：同轮重报以最新为准，不补差、不重扣', () => {
  重置()
  const p = 起插件()
  p.发(用户('他问我累不累'))
  p.发(回话(1, '还好，不累。\n<!-- EMO: E+ S+ P0 | q1=1 q2=0.5 | 撑着 -->'))
  assert.ok(Math.abs(池().axes.E - 0.15) < 1e-9)

  // 同一轮重报（@上次 已不参与计算）：替换，不再加一遍
  p.发(用户('他说那天他很难受'))
  p.发(回话(1, '我记得那天。\n<!-- EMO: E+ S+ P0 | q1=1 q2=0.5 | 那天 | @上次 -->'))
  const 后 = 池()
  assert.equal(后.events.length, 1, '同轮只留一条：兜底推轴更新自报那条，不新增')
  assert.equal(后.rev, 3, "写自报 + 兜底推轴各 +1 rev")
  assert.ok(Math.abs(后.axes.E - 0.15) < 1e-9, `应以最新为准 0.15，实际 ${后.axes.E}`)
  assert.equal(后.events[0].band, undefined)
  assert.ok(后.events[0].note.includes('他说那天他很难受'), '重报后注记换成最新 user 原文')
  assert.ok(日志().includes('同轮重报'))
})

test('用例 8：两个会话同时写，rev 递增、无静默覆盖', async () => {
  重置()
  const 脚本 = `
    (async () => {
      const { apply } = await import(process.env.POOL_URL)
      const ctx = {
    systemPrompt: { context() { return () => {} } },
        on(n, f) { if (n === 'session/event') this.f = f },
        effect(fn) { fn() },
        webServer: { register() { return () => {} } },
      }
      apply(ctx)
      ctx.f({ id: process.env.SID }, {
        type: 'assistant/message',
        data: { turn: Number(process.env.TURN), message: { content: [{ type: 'text', text: '在。\\n<!-- EMO: E+ S0 P0 | q1=1 q2=0.5 -->' }] } },
      })
    })().catch((e) => { console.error(e && e.message); process.exit(1) })
  `
  const 跑 = (sid, turn) =>
    new Promise((resolve, reject) => {
      const 子 = spawn(process.execPath, ['-e', 脚本], {
        env: { ...process.env, EMOTION_POOL_DIR: 目录, SID: sid, TURN: String(turn), POOL_URL: 'file:///' + 模块路径.replace(/\\/g, '/') },
        stdio: 'ignore',
      })
      子.on('exit', (码) => (码 === 0 ? resolve() : reject(new Error('子进程退出 ' + 码))))
    })

  await Promise.all([跑('session-aaaaaaaa-f40c-4fc3-ad69-f8338376753b', 1), 跑('session-dddddddd-0c89-438e-aa4e-aeaeb3d9c240', 2)])
  const 后 = 池()
  assert.equal(后.rev, 2, '两次写都要落，rev 应到 2')
  assert.equal(后.events.length, 2, '两个事件都在')
  assert.ok(Math.abs(后.axes.E - 0.30) < 1e-9, `两间各自计同向、互不递减：0.15 + 0.15 = 0.30，实际 ${后.axes.E}`)
})

after(() => {
  try {
    rmSync(目录, { recursive: true, force: true })
  } catch {}
})
