// 2026-11-09：正文不再写 EMO 行，改走 POST /dsh-emotion-pool/report
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m11-'))
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
  写入者: ['c4b92d68'],
  注入启用: false,
  刻度: 1,
  刺阈值: 0.25,
  日志: ['情绪池-日志.md', '情绪池-日志.jsonl'],
}

function 空池() {
  return {
    rev: 0,
    updated: new Date().toISOString(),
    axes: { E: 0, S: 0, P: 0 },
    spine: { S: 0 },
    prev_cell: 'E0S0P0',
    events: [],
    结: [],
    stats: { selfreport_total: 0, missed_total: 0 },
    p_state: { 爽: { s: 1, a: 1, 最近: null }, 痛: { s: 1, a: 1, 最近: null } },
  }
}

function 起插件() {
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(空池(), null, 2))
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
  return {
    路由,
    池: () => JSON.parse(readFileSync(join(目录, '情绪池.json'), 'utf8')),
  }
}

async function 调(路由, path, 体, 地址 = '127.0.0.1') {
  let 回 = ''
  const req = {
    method: 体 ? 'POST' : 'GET',
    socket: { remoteAddress: 地址 },
    async *[Symbol.asyncIterator]() { if (体) yield JSON.stringify(体) },
  }
  let 码 = 200
  await 路由.get(path)(req, { set statusCode(v) { 码 = v }, get statusCode() { return 码 }, setHeader() {}, end(s) { 回 = String(s) } })
  return { 码, 体: JSON.parse(回) }
}

test('report：合法自报入库，返回 rev / 命名 / 显示文本', async () => {
  const p = 起插件()
  const r = await 调(p.路由, '/dsh-emotion-pool/report', { E: 0.15, S: -0.15, P: 0, 注: '陪他说话' })
  assert.equal(r.码, 200)
  assert.equal(r.体.ok, true)
  assert.equal(r.体.rev, 1)
  assert.ok(String(r.体.命名).length > 0)
  assert.ok(String(r.体.显示文本).includes('E+ 0.1500'), r.体.显示文本)
  const 池 = p.池()
  assert.equal(池.events.length, 1)
  assert.equal(池.events[0].delta_raw.E, 0.15)
  assert.equal(池.events[0].note, '[无用户话] 陪他说话')
})

test('report：|Δ|>0.30 直接拒，不进池', async () => {
  const p = 起插件()
  const r = await 调(p.路由, '/dsh-emotion-pool/report', { E: 0.31 })
  assert.equal(r.码, 400)
  assert.equal(p.池().events.length, 0)
})

test('report：不认识的键直接拒（不静默忽略）', async () => {
  const p = 起插件()
  const r = await 调(p.路由, '/dsh-emotion-pool/report', { E: 0.1, letters: 'ESP' })
  assert.equal(r.码, 400)
  assert.ok(String(r.体.error).includes('letters'))
})

test('report：非本机 403', async () => {
  const p = 起插件()
  const r = await 调(p.路由, '/dsh-emotion-pool/report', { E: 0.1 }, '8.8.8.8')
  assert.equal(r.码, 403)
  assert.equal(p.池().events.length, 0)
})

test('report：结随自报一起进池（|Δ_冲|>阈的部分单独存，且不由 Δ_实 决定）', async () => {
  const p = 起插件()
  const r = await 调(p.路由, '/dsh-emotion-pool/report', { P: -0.3, 注: '疼' })
  assert.equal(r.体.ok, true)
  const 池 = p.池()
  assert.equal(池.结.length, 1)
  assert.equal(池.结[0].轴, 'P')
  // 冲 = −0.3×增益 1.0006 ≈ −0.30018；结值 = 冲 − 0.25 ≈ −0.05018
  assert.ok(Math.abs(池.结[0].值 + 0.05018) < 0.01, `结值 ${池.结[0].值}`)
  assert.equal(池.结[0].速, '急')
})
