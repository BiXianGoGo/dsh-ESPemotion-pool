// 2026-11-09 01:43：软上限 0.85——写入前按已满度缩增量；刺按 Δ_实 判定；警告线 0.85/0.95
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m15-'))
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

const 会话id = 'session-aaaaaaaa-f40c-4fc3-ad69-f8338376753b'

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
  const 监听 = []
  const ctx = {
    on(_名, fn) { 监听.push(fn) },
    effect(fn) { fn(); return () => {} },
    webServer: { register(o) { 路由.set(o.path, o.handler); return () => {} } },
    systemPrompt: { context: () => () => {} },
    llm: {},
    agents: { list: () => [] },
  }
  模块.apply(ctx)
  return {
    路由,
    池: () => JSON.parse(readFileSync(join(目录, '情绪池.json'), 'utf8')),
  }
}

async function 调(路由, path, 体) {
  let 回 = ''
  let 码 = 200
  const req = {
    method: 体 ? 'POST' : 'GET', url: path, socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() { if (体) yield Buffer.from(JSON.stringify(体)) },
  }
  await 路由.get(path)(req, {
    set statusCode(v) { 码 = v }, get statusCode() { return 码 }, setHeader() {}, writeHead() {},
    end(s) { 回 = String(s) },
  })
  return { 码, 体: JSON.parse(回) }
}

test('软上限：0.84 加 0.15 → 约 0.99，不超 1', async () => {
  const p = 起插件({ E: 0.84, S: 0, P: 0 })
  const r = await 调(p.路由, '/dsh-emotion-pool/report', { E: 0.15, S: 0, P: 0, 注: '加一点' })
  assert.equal(r.码, 200)
  const 池 = p.池()
  assert.ok(Math.abs(池.events[0].delta_raw.E - 0.15) < 1e-9)
  assert.ok(池.axes.E > 0.98 && 池.axes.E <= 1.0, `实际 ${池.axes.E}`)
})

test('R1 溢出抑制：0.95 加 0.15 → 增量被压到 0.05~0.15、轴≤1、溢出>0', async () => {
  const p = 起插件({ E: 0.95, S: 0, P: 0 })
  const r = await 调(p.路由, '/dsh-emotion-pool/report', { E: 0.15, S: 0, P: 0, 注: '再加一点' })
  assert.equal(r.码, 200)
  const 池 = p.池()
  const 增 = 池.events[0].delta_raw.E
  assert.ok(增 > 0.05 && 增 < 0.15, "实际增量 " + 增)
  // 0.2 起溢出统一在推轴时记：自报本身不记溢出
  assert.equal(池.溢出.E.v, 0, '自报路径不记溢出')
  await 模块.推轴(会话id, { E: 1.0, S: 0, P: 0 }, 2, { ...配置, 吸附系数: 1 })
  const 池2 = p.池()
  assert.ok(池2.溢出.E.v > 0, '推轴顶格后应有溢出')
  assert.ok(池2.axes.E <= 1.0 + 1e-9, "实际 " + 池2.axes.E)
  assert.ok(池2.axes.E > 0.99, "实际 " + 池2.axes.E)
  assert.ok(池.axes.E > 0.99, `实际 ${池.axes.E}`)
})

test('结按 Δ_冲 判定：0.90 加 0.30，轴只进 ~0.18，冲 0.30 → 结 0.05', async () => {
  const p = 起插件({ E: 0.90, S: 0, P: 0 })
  const r = await 调(p.路由, '/dsh-emotion-pool/report', { E: 0.30, S: 0, P: 0 })
  assert.equal(r.码, 200)
  const 池 = p.池()
  assert.ok(Math.abs(池.events[0].delta_raw.E - 0.179549) < 1e-3, `实际 ${池.events[0].delta_raw.E}`)
  assert.equal(池.结.length, 1)
  assert.ok(Math.abs(池.结[0].值 - 0.05) < 1e-9, `结值 ${池.结[0].值}`)
  assert.equal(池.结[0].速, '急')
  assert.ok(池.axes.E <= 1.0 + 1e-9, `结不该重复进轴值：${池.axes.E}`)
})

test('警告线：0.86 报接近上限，0.96 报已到上限', async () => {
  const a = 起插件({ E: 0.86, S: 0, P: 0 })
  const ra = await 调(a.路由, '/dsh-emotion-pool/state')
  assert.ok(ra.体.警告.some((x) => /接近上限/.test(x)), JSON.stringify(ra.体.警告))
  const b = 起插件({ E: 0.96, S: 0, P: 0 })
  const rb = await 调(b.路由, '/dsh-emotion-pool/state')
  assert.ok(rb.体.警告.some((x) => /已到上限/.test(x)), JSON.stringify(rb.体.警告))
})
