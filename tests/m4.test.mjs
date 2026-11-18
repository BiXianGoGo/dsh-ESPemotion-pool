// v0.9 注入：保底（≥5 轮或 ≥40 分钟，不受日限）+ 插队（跨格/主导轴 ≥0.15，日限 12）
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m4-'))
process.env.EMOTION_POOL_DIR = 目录
process.env.EP_LEGACY_INJECT = '1' // 旧【此刻】格式的回归用例

const 模块 = await import('../lib/index.js')

const 基础配置 = {
  启用: true,
  校验启用: true,
  校验每天上限: 50,
  校验只跑有自报的轮: true,
  提醒启用: true,
  每日衰减系数: 0.9,
  守恒上限: 1.0,
  写入者: ['c4b92d68'],
  注入启用: false,
  保底间隔分钟: 40,
  保底轮数: 5,
  刻度: 1,
  日志: ['情绪池-日志.md', '情绪池-日志.jsonl'],
}

const 今天 = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function 空池(事件 = []) {
  return {
    rev: 7,
    updated: '2026-11-08T21:40:00+08:00',
    axes: { E: 0, S: 0, P: 0 },
    spine: { S: 0 },
    prev_cell: 'E0S0P0',
    events: 事件,
    上轮波动: { 轮: 事件.reduce((m, e) => Math.max(m, Number(e.turn) || 0), 0), 有: true, t: new Date().toISOString() },
    stats: { selfreport_total: 0, missed_total: 0 },
  }
}

const 事件 = (turn, E, S, P, t = '2026-11-11T00:00:00+08:00') => ({ id: 'e-' + turn, t, turn, delta_raw: { E, S, P }, note: '' })

function 重置(改 = {}, 事件们 = [], 注入 = null) {
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(空池(事件们), null, 2))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify({ ...基础配置, ...改 }, null, 2))
  for (const f of ['情绪池-日志.md', '情绪池-日志.jsonl', '情绪池-注入.json', '情绪池-轮号.json', '情绪池-命名.json']) {
    const p = join(目录, f)
    if (existsSync(p)) rmSync(p)
  }
  if (注入) writeFileSync(join(目录, '情绪池-注入.json'), JSON.stringify(注入, null, 2))
  if (注入) {
    const 大 = 事件们.reduce((m, e) => Math.max(m, Number(e.turn) || 0), 0)
    writeFileSync(join(目录, '情绪池-轮号.json'), JSON.stringify({ 总: 大, 按会话: {}, 末: {}, 更新: null }, null, 2))
  }
}

const 日志 = () => (existsSync(join(目录, '情绪池-日志.md')) ? readFileSync(join(目录, '情绪池-日志.md'), 'utf8') : '')
const 池文本 = () => readFileSync(join(目录, '情绪池.json'), 'utf8')
const 注入状态 = () => JSON.parse(readFileSync(join(目录, '情绪池-注入.json'), 'utf8'))

function 起插件() {
  const 出口 = new Map()
  const ctx = {
    on() {},
    effect(fn) { fn(); return () => {} },
    webServer: { register: () => () => {} },
    systemPrompt: {
      context(参数) {
        出口.set(参数.name, 参数)
        return () => {}
      },
    },
  }
  模块.apply(ctx)
  return {
    注入() {
      const c = 出口.get('emotion-pool-注入')
      return c ? c.text() : ''
    },
  }
}

before(() => 重置())

test('注入默认关 → 不返回任何文本', () => {
  重置({}, [事件(1, 0.2, 0, 0)])
  const p = 起插件()
  assert.equal(p.注入(), '')
})

test('首次必注（保底），文本是坐标+判定，且不改池子', () => {
  重置({ 注入启用: true }, [事件(1, 0.2, 0, 0, new Date().toISOString())])
  const 前 = 池文本()
  const p = 起插件()
  const 行 = p.注入()
  assert.ok(行.startsWith('【此刻】E +0.20 S +0.00 P +0.00 ｜ '), 行)
  assert.equal(池文本(), 前)
  const 状 = 注入状态()
  assert.equal(状.上次轮, 1)
  assert.equal(状.保底, 1)
  assert.equal(状.注入, 1)
})

test('同一轮最多注一次', () => {
  重置({ 注入启用: true }, [事件(3, 0.2, 0, 0)])
  const p = 起插件()
  assert.ok(p.注入().startsWith('【此刻】'))
  assert.equal(p.注入(), '')
  assert.equal(p.注入(), '')
  assert.equal(注入状态().注入, 1)
})

test('值、格都不动，距上次 ≥40 分钟 → 仍保底注入', () => {
  重置({ 注入启用: true }, [事件(2, 0.2, 0, 0)], {
    今天: 今天(),
    判断: 0, 注入: 0, 保底: 0, 插队: 0, 次数: 0,
    昨日: { 判断: 0, 注入: 0, 保底: 0, 插队: 0 },
    上次轮: 1, 上次轴: { E: 0.2, S: 0, P: 0 }, 上次时间: new Date(Date.now() - 41 * 60000).toISOString(), 上次格: 'E+S0P0', 上次rev: 7,
  })
  const p = 起插件()
  const 行 = p.注入()
  assert.ok(行.startsWith('【此刻】'), 行)
  assert.equal(注入状态().保底, 1)
  assert.ok(日志().includes('注入（保底）'))
})

test('距上次 39 分钟、值格都不动 → 不注', () => {
  重置({ 注入启用: true }, [事件(2, 0.2, 0, 0)], {
    今天: 今天(),
    判断: 0, 注入: 0, 保底: 0, 插队: 0, 次数: 0,
    昨日: { 判断: 0, 注入: 0, 保底: 0, 插队: 0 },
    上次轮: 1, 上次轴: { E: 0.2, S: 0, P: 0 }, 上次时间: new Date(Date.now() - 39 * 60000).toISOString(), 上次格: 'E+S0P0', 上次rev: 7,
  })
  const 存 = JSON.parse(readFileSync(join(目录, '情绪池.json'), 'utf8'))
  存.上轮波动 = { 有: false }
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(存, null, 2))
  const p = 起插件()
  assert.equal(p.注入(), '')
  assert.equal(注入状态().注入, 0)
})

test('距上次 ≥5 轮 → 保底注入', () => {
  重置({ 注入启用: true }, [事件(6, 0.2, 0, 0)], {
    今天: 今天(),
    判断: 0, 注入: 0, 保底: 0, 插队: 0, 次数: 0,
    昨日: { 判断: 0, 注入: 0, 保底: 0, 插队: 0 },
    上次轮: 1, 上次轴: { E: 0.2, S: 0, P: 0 }, 上次时间: new Date(Date.now() - 60000).toISOString(), 上次格: 'E+S0P0', 上次rev: 7,
  })
  assert.ok(起插件().注入().startsWith('【此刻】'))
})

test('跨格 → 插队注入，受日限 12', () => {
  重置({ 注入启用: true }, [事件(2, 0.2, 0, 0)], {
    今天: 今天(),
    判断: 0, 注入: 0, 保底: 0, 插队: 0, 次数: 0,
    昨日: { 判断: 0, 注入: 0, 保底: 0, 插队: 0 },
    上次轮: 1, 上次轴: { E: 0, S: 0, P: 0 }, 上次时间: new Date(Date.now() - 60000).toISOString(), 上次格: 'E-S0P0', 上次rev: 7,
  })
  const p = 起插件()
  assert.ok(p.注入().startsWith('【此刻】'))
  assert.equal(注入状态().插队, 1)
  assert.ok(日志().includes('注入（插队）'))
})

test('日限 12 只挡插队，保底仍可注', () => {
  重置({ 注入启用: true }, [事件(2, 0.2, 0, 0)], {
    今天: 今天(),
    判断: 5, 注入: 5, 保底: 0, 插队: 24, 次数: 24,
    昨日: { 判断: 0, 注入: 0, 保底: 0, 插队: 0 },
    上次轮: 1, 上次轴: { E: 0, S: 0, P: 0 }, 上次时间: new Date(Date.now() - 60000).toISOString(), 上次格: 'E-S0P0', 上次rev: 7,
  })
  const p = 起插件()
  assert.equal(p.注入(), '') // 插队被日限挡住
  assert.ok(日志().includes('插队跳过'))
  // 同状态、但距上次 6 轮 → 保底不受日限
  重置({ 注入启用: true }, [事件(8, 0.2, 0, 0)], {
    今天: 今天(),
    判断: 5, 注入: 5, 保底: 0, 插队: 12, 次数: 12,
    昨日: { 判断: 0, 注入: 0, 保底: 0, 插队: 0 },
    上次轮: 1, 上次轴: { E: 0, S: 0, P: 0 }, 上次时间: new Date(Date.now() - 60000).toISOString(), 上次格: 'E-S0P0', 上次rev: 7,
  })
  assert.ok(起插件().注入().startsWith('【此刻】'))
})

test('命中命名 → 竖线后是名字；未命中 → 未落在命名区间 + 日志', () => {
  重置({ 注入启用: true }, [事件(1, 0.2, 0, 0, new Date().toISOString())])
  writeFileSync(join(目录, '情绪池-命名.json'), JSON.stringify({
    名字: [{ 名: '测试名', 注: '测试', 类: '当下', 互斥: [], E: [0, 0.6], S: [-0.2, 0.2], P: [-0.2, 0.2], 出处: 'test', 建: '2026-11-11' }],
  }))
  const p = 起插件()
  assert.ok(p.注入().endsWith('｜ 测试名'))

  重置({ 注入启用: true }, [事件(1, 0.2, 0.9, 0)])
  const q = 起插件()
  assert.ok(q.注入().endsWith('｜ 未落在命名区间'))
  assert.ok(日志().includes('注入未命名'))
})

test('老状态文件（只有今天/次数/上次格）自愈并放行一次', () => {
  重置({ 注入启用: true }, [事件(1, 0.2, 0, 0)], { 今天: 今天(), 次数: 3, 上次格: 'E+S0P0' })
  const p = 起插件()
  assert.ok(p.注入().startsWith('【此刻】'))
  assert.equal(注入状态().上次轮, 1)
})

test('跨天：今日计数归档进昨日再清零', () => {
  重置({ 注入启用: true }, [事件(1, 0.2, 0, 0)], {
    今天: '2000-01-01',
    判断: 9, 注入: 4, 保底: 2, 插队: 2, 次数: 2,
    昨日: { 判断: 0, 注入: 0, 保底: 0, 插队: 0 },
    上次轮: 0, 上次轴: { E: 0, S: 0, P: 0 }, 上次时间: '2000-01-01T00:00:00.000Z', 上次格: 'E0S0P0', 上次rev: 1,
  })
  assert.ok(起插件().注入().startsWith('【此刻】'))
  const 状 = 注入状态()
  assert.deepEqual(状.昨日, { 判断: 9, 注入: 4, 保底: 2, 插队: 2 })
  assert.equal(状.判断, 1)
  assert.equal(状.注入, 1)
})
