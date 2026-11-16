// 2026-11-09 01:58：结按「冲击强度 Δ_冲 + 速率」判定，不受软上限/夹/递减影响；结不重复计入轴值
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m17-'))
process.env.EMOTION_POOL_DIR = 目录

const 模块 = await import('../lib/index.js')

const 配置 = {
  启用: true,
  校验启用: false,
  校验每天上限: 50,
  校验只跑有自报的轮: true,
  提醒启用: false,
  每日衰减系数: 0.9,
  守恒上限: 1.0,
  写入者: ['aaaaaaaa'],
  注入启用: false,
  刻度: 1,
  刺阈值: 0.25,
  日志: ['情绪池-日志.md', '情绪池-日志.jsonl'],
}

function 起插件(种子) {
  const 池 = {
    rev: 0,
    updated: new Date().toISOString(),
    axes: { ...种子 },
    spine: { ...种子 },
    prev_cell: 'E0S0P0',
    events: [],
    结: [],
    stats: { selfreport_total: 0, missed_total: 0 },
    p_state: { 爽: { s: 1, a: 1, 最近: null }, 痛: { s: 1, a: 1, 最近: null } },
  }
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(池, null, 2))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify(配置, null, 2))
  const 路由 = new Map()
  const ctx = {
    on() {},
    effect(fn) { fn(); return () => {} },
    webServer: { register(o) { 路由.set(o.path, o.handler); return () => {} } },
    systemPrompt: { context: () => () => {} }, llm: {}, agents: { list: () => [] },
  }
  模块.apply(ctx)
  return { 路由, 池: () => JSON.parse(readFileSync(join(目录, '情绪池.json'), 'utf8')) }
}

async function 调(路由, path, 体) {
  let 回 = ''
  let 码 = 200
  const req = {
    method: 体 === undefined ? 'GET' : 'POST',
    socket: { remoteAddress: '127.0.0.1' }, url: path,
    async *[Symbol.asyncIterator]() { if (体 !== undefined) yield Buffer.from(JSON.stringify(体)) },
  }
  await 路由.get('/dsh-emotion-pool' + path)(req, { set statusCode(v) { 码 = v }, get statusCode() { return 码 }, setHeader() {}, writeHead() {}, end(s) { 回 = String(s) } })
  return { 码, 体: JSON.parse(回) }
}

test('结：轴 0.95 时 Δ_冲 0.30 仍照结（Δ_冲 0.30 走急通道 → 结 0.10），轴值只进 Δ_实', async () => {
  const p = 起插件({ E: 0.95, S: 0, P: 0 })
  const r = await 调(p.路由, '/report', { E: 0.30, S: 0, P: 0, 轮: 'r1' })
  assert.equal(r.码, 200)
  const 池 = p.池()
  assert.equal(池.结.length, 1)
  assert.ok(Math.abs(池.结[0].值 - 0.05) < 1e-9, `结值 ${池.结[0].值}`)
  assert.ok(池.events[0].delta_raw.E > 0 && 池.events[0].delta_raw.E < 0.15, `Δ_实 ${池.events[0].delta_raw.E}`)
  assert.ok(池.axes.E <= 1.0 + 1e-9)
})

test('结不重复计入轴值：0.50 + Δ_冲 0.30 → 轴只到 0.80', async () => {
  const p = 起插件({ E: 0.5, S: 0, P: 0 })
  await 调(p.路由, '/report', { E: 0.30, S: 0, P: 0, 轮: 'r2' })
  const 池 = p.池()
  assert.equal(池.结.length, 1)
  assert.ok(Math.abs(池.axes.E - 0.8) < 1e-6, `axes.E ${池.axes.E}`)
})

test('冲不看递减：同向第二报 实 0.18，但冲击仍是 0.30、照结 0.05', async () => {
  const p = 起插件({ E: 0, S: 0, P: 0 })
  await 调(p.路由, '/report', { E: 0.30, S: 0, P: 0, 轮: 'a1' })
  await 调(p.路由, '/report', { E: 0.30, S: 0, P: 0, 轮: 'a2' })
  const 池 = p.池()
  assert.equal(池.结.length, 2)
  assert.ok(Math.abs(池.结[0].值 - 0.05) < 1e-9)
  assert.ok(Math.abs(池.结[1].值 - 0.05) < 1e-9)
  assert.ok(Math.abs(池.events[1].delta_raw.E - 0.18) < 1e-6, `第二次 Δ_实 ${池.events[1].delta_raw.E}`)
})

test('速率档：≥0.05 急、0.01~0.05 快、<0.01 缓', () => {
  assert.equal(模块.速率档(0.06), '急')
  assert.equal(模块.速率档(0.02), '快')
  assert.equal(模块.速率档(0.005), '缓')
  assert.equal(模块.速率档(null), null)
})

test('/state 的结带 率/速', async () => {
  const p = 起插件({ E: 0.95, S: 0, P: 0 })
  await 调(p.路由, '/report', { E: 0.30, S: 0, P: 0, 轮: 'r3' })
  const s = await 调(p.路由, '/state')
  assert.equal(s.体.结.length, 1)
  assert.equal(typeof s.体.结[0].率, 'number')
  assert.equal(s.体.结[0].速, '急')
})
