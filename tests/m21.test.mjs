// 2026-11-09 02:46：去守恒（单轴夹）、6 小时回落、调试窗口实时刷新
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m21-'))
process.env.EMOTION_POOL_DIR = 目录

const 模块 = await import('../lib/index.js')
const 包根 = join(dirname(fileURLToPath(import.meta.url)), '..')

const 配置 = {
  启用: true,
  校验启用: false,
  校验每天上限: 50,
  校验只跑有自报的轮: true,
  提醒启用: false,
  每日衰减系数: 0.9,
  守恒上限: 1.0,
  写入者: ['c4b92d68'],
  注入启用: false,
  刻度: 1,
  刺阈值: 0.25,
  日志: ['情绪池-日志.md', '情绪池-日志.jsonl'],
}

const 会话id = 'session-c4b92d68-f40c-4fc3-ad69-f8338376753b'

function 起插件(池) {
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(池, null, 2))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify(配置, null, 2))
  const 路由 = new Map()
  const ctx = {
    on() {},
    effect(fn) { fn(); return () => {} },
    webServer: { register(o) { 路由.set(o.path, o.handler); return () => {} } },
    systemPrompt: { context: () => () => {} },
    llm: {},
    agents: { list: () => [] },
  }
  模块.apply(ctx)
  return 路由
}

async function 取(路由, path) {
  let 回 = ''
  await 路由.get(path)({ method: 'GET', url: path, socket: { remoteAddress: '127.0.0.1' } }, {
    set statusCode(v) {}, setHeader() {}, writeHead() {}, end(s) { 回 = String(s) },
  })
  return JSON.parse(回)
}

test('去守恒：单轴各自夹 ±1，正面总量不再压回 1.0', () => {
  assert.deepEqual(模块.守恒({ E: 0.9, S: 0.9, P: 0 }), { E: 0.9, S: 0.9, P: 0 })
  assert.deepEqual(模块.守恒({ E: 1.4, S: -1.2, P: 0.3 }), { E: 1, S: -1, P: 0.3 })
})

test('回落：每 6 小时无事件，倍率 ×0.98，spine 不打折', async () => {
  const 现 = new Date()
  const 前13小时 = new Date(现.getTime() - 13 * 3600 * 1000).toISOString()
  const 池 = {
    rev: 1, updated: 现.toISOString(),
    axes: { E: 0, S: 0, P: 0 }, spine: { S: 0 },
    prev_cell: 'E0S0P0',
    events: [{ id: 'e-0001', t: 前13小时, delta_raw: { E: 0.15, S: 0, P: 0 }, note: '旧事', sid: 会话id, turn: 1 }],
    结: [], stats: { selfreport_total: 1, missed_total: 0 },
    回落: { at: 前13小时, 倍: 1 },
  }
  const 路由 = 起插件(池)
  const s = await 取(路由, '/dsh-emotion-pool/state')
  assert.ok(Math.abs(s.回落.倍 - Math.pow(0.98, 2)) < 1e-9, `倍 ${s.回落.倍}`)
  assert.ok(Math.abs(s.回落.小时 - 13) < 0.1, `小时 ${s.回落.小时}`)
})

test('调试窗口：/state 现读池、面板每 5 秒重拉列表', async () => {
  const 现 = new Date().toISOString()
  const 池 = {
    rev: 2, updated: 现,
    axes: { E: 0, S: 0, P: 0 }, spine: { S: 0 }, prev_cell: 'E0S0P0',
    events: [{ id: 'e-0001', t: 现, delta_raw: { E: 0, S: 0.15, P: 0 }, note: 'x', sid: 会话id, turn: 1 }],
    结: [], stats: { selfreport_total: 1, missed_total: 0 },
  }
  const 路由 = 起插件(池)
  const 一 = await 取(路由, '/dsh-emotion-pool/state')
  assert.equal(一.events, 1)
  // 直接改池文件，模拟另一次写入；/state 下一次请求应看到 2 条
  池.events.push({ id: 'e-0002', t: 现, delta_raw: { E: 0.15, S: 0, P: 0 }, note: 'y', sid: 会话id, turn: 2 })
  池.rev = 3
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(池, null, 2))
  const 二 = await 取(路由, '/dsh-emotion-pool/state')
  assert.equal(二.events, 2)
  // 面板脚本里必须把列表也放进 5 秒刷新
  const panel = await new Promise((resolve) => {
    let 回 = ''
    路由.get('/dsh-emotion-pool/panel')({ url: '/dsh-emotion-pool/panel', socket: { remoteAddress: '127.0.0.1' } }, {
      set statusCode(v) {}, setHeader() {}, writeHead() {}, end(s) { 回 = String(s); resolve(回) },
    })
  })
  assert.ok(panel.includes("载('结', false); 载('事件', false); }, 5000)"), '面板 5 秒刷新里要重拉列表')
  const widget = readFileSync(join(包根, 'assets', 'widget.js'), 'utf8')
  assert.ok(widget.includes("载('结', false); 载('事件', false)"), '挂饰展开时也要重拉列表')
})
