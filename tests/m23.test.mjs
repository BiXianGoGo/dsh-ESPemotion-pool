// 2026-11-09 03:20：结分两类——「冲」（累计 0.45 / 急通道）与「久」（同格停留 20 分钟）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m23-'))
process.env.EMOTION_POOL_DIR = 目录
const 模块 = await import('../lib/index.js')

const 配置 = {
  启用: true, 校验启用: false, 校验每天上限: 50, 校验只跑有自报的轮: true,
  提醒启用: false, 每日衰减系数: 0.9, 守恒上限: 1.0, 写入者: ['aaaaaaaa'],
  注入启用: false,
  刻度: 1, 刺阈值: 0.25, 结累计阈值: 0.45, 结急阈值: 0.2, 结急速率: 0.05,
  日志: ['情绪池-日志.md', '情绪池-日志.jsonl'],
}
const 会话id = 'session-aaaaaaaa-f40c-4fc3-ad69-f8338376753b'
const 分钟前 = (n) => new Date(Date.now() - n * 60000).toISOString()

function 起插件(事件 = [], 刺 = [], 格计时 = null, prev = 'E0S0P0') {
  const 池 = {
    rev: 0, updated: new Date().toISOString(), axes: { E: 0, S: 0, P: 0 },
    spine: { E: 0, S: 0, P: 0 }, prev_cell: prev, events: 事件, 刺, 格计时,
    stats: { selfreport_total: 0, missed_total: 0 },
    p_state: { 爽: { s: 1, a: 1, 最近: null }, 痛: { s: 1, a: 1, 最近: null } },
  }
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(池, null, 2))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify(配置, null, 2))
  const 路由 = new Map()
  const ctx = {
    on() {}, effect(fn) { fn(); return () => {} },
    webServer: { register(o) { 路由.set(o.path, o.handler); return () => {} } },
    systemPrompt: { context: () => () => {} },
    llm: {}, agents: { list: () => [] },
  }
  模块.apply(ctx)
  return { 路由, 池: () => JSON.parse(readFileSync(join(目录, '情绪池.json'), 'utf8')) }
}
async function 报(路由, 体) {
  let 回 = ''
  let 码 = 200
  const req = { method: 'POST', socket: { remoteAddress: '127.0.0.1' }, url: '/dsh-emotion-pool/report',
    async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(体)) } }
  await 路由.get('/dsh-emotion-pool/report')(req, { set statusCode(v) { 码 = v }, get statusCode() { return 码 }, setHeader() {}, writeHead() {}, end(s) { 回 = String(s) } })
  return { 码, 体: JSON.parse(回) }
}

test('三次 0.15 → 冲结（类型 冲）', async () => {
  const { 路由, 池 } = 起插件()
  await 报(路由, { E: 0.15, 用户话: '累' })
  await 报(路由, { E: 0.15, 用户话: '累' })
  assert.equal(池().结.length, 0)
  await 报(路由, { E: 0.15, 用户话: '累' })
  const 刺 = 池().结
  assert.equal(刺.length, 1)
  assert.equal(刺[0].类型, '冲')
})

test('单条 0.25、距上条 4 分钟（率 0.0625）→ 冲结 0.05', async () => {
  const 事件 = [{ id: 'e-0001', t: 分钟前(4), delta_raw: { E: 0.05, S: 0, P: 0 }, note: '上一条', sid: 会话id, turn: 1 }]
  const { 路由, 池 } = 起插件(事件)
  await 报(路由, { E: 0.25, 用户话: '一下子' })
  const 刺 = 池().结
  assert.equal(刺.length, 1)
  assert.equal(刺[0].类型, '冲')
  assert.ok(Math.abs(刺[0].值 - 0.05) < 1e-6, `结值 ${刺[0].值}`)
})

test('同一格停 21 分钟 → 久结一条', async () => {
  const 事件 = [{ id: 'e-0001', t: 分钟前(60), delta_raw: { E: 0.15, S: 0, P: 0 }, note: '进了 E+', sid: 会话id, turn: 1 }]
  const 格计时 = { cell: 'E+S0P0', since: 分钟前(21), 轴值: { E: 0.15, S: 0, P: 0 } }
  const { 路由, 池 } = 起插件(事件, [], 格计时, 'E+S0P0')
  await 报(路由, { E: 0.10, 用户话: '还在这' })
  const 刺 = 池().结
  const 久 = 刺.filter((c) => c.类型 === '久')
  assert.equal(久.length, 1, JSON.stringify(刺))
  assert.ok(Math.abs(久[0].值) >= 0.05)
  assert.ok(Date.parse(池().格计时.since) > Date.now() - 60000, 'since 应重置为现在')
})

test('离开该格 → 计时重置，不补久结', async () => {
  const 格计时 = { cell: 'E0S0P0', since: 分钟前(25), 轴值: { E: 0, S: 0, P: 0 } }
  const { 路由, 池 } = 起插件([], [], 格计时, 'E0S0P0')
  await 报(路由, { S: 0.10, 用户话: '换了口气' })
  const p = 池()
  assert.equal((p.结 || []).filter((c) => c.类型 === '久').length, 0)
  assert.notEqual(p.格计时.cell, 'E0S0P0')
  assert.ok(Date.parse(p.格计时.since) > Date.now() - 60000, '换格后 since 应为现在')
})