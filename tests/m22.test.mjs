// 2026-11-09 03:05：结门槛 0.45（三步）；单条急通道 ≥0.20 且速率 ≥0.05/分钟；作废结不显示
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m22-'))
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
  结累计阈值: 0.45,
  结急阈值: 0.2,
  结急速率: 0.05,
  日志: ['情绪池-日志.md', '情绪池-日志.jsonl'],
}

const 会话id = 'session-c4b92d68-f40c-4fc3-ad69-f8338376753b'

function 起插件(事件 = [], 刺 = []) {
  const 池 = {
    rev: 0,
    updated: new Date().toISOString(),
    axes: { E: 0, S: 0, P: 0 },
    spine: { E: 0, S: 0, P: 0 },
    prev_cell: 'E0S0P0',
    events: 事件,
    结: 刺,
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
    systemPrompt: { context: () => () => {} },
    llm: {},
    agents: { list: () => [] },
  }
  模块.apply(ctx)
  return { 路由, 池: () => JSON.parse(readFileSync(join(目录, '情绪池.json'), 'utf8')) }
}

async function 报(路由, 体) {
  let 回 = ''
  let 码 = 200
  const req = {
    method: 'POST',
    socket: { remoteAddress: '127.0.0.1' },
    url: '/dsh-emotion-pool/report',
    async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(体)) },
  }
  await 路由.get('/dsh-emotion-pool/report')(req, {
    set statusCode(v) { 码 = v }, get statusCode() { return 码 }, setHeader() {}, writeHead() {}, end(s) { 回 = String(s) },
  })
  return { 码, 体: JSON.parse(回) }
}

async function 取(路由, path) {
  let 回 = ''
  await 路由.get('/dsh-emotion-pool/state')({ method: 'GET', url: path, socket: { remoteAddress: '127.0.0.1' } }, {
    set statusCode(v) {}, setHeader() {}, writeHead() {}, end(s) { 回 = String(s) },
  })
  return JSON.parse(回)
}

test('连续两次 0.15 不成结', async () => {
  const { 路由, 池 } = 起插件()
  await 报(路由, { E: 0.15, 轮: 'r1', 注: '第一次' })
  await 报(路由, { E: 0.15, 轮: 'r2', 注: '第二次' })
  assert.equal(池().结.length, 0)
})

test('第三次 0.15：累计 0.45 刚好成结，值 0', async () => {
  const { 路由, 池 } = 起插件()
  await 报(路由, { E: 0.15, 轮: 'r1' })
  await 报(路由, { E: 0.15, 轮: 'r2' })
  await 报(路由, { E: 0.15, 轮: 'r3' })
  const 刺 = 池().结
  assert.equal(刺.length, 1)
  assert.equal(刺[0].轴, 'E')
  assert.equal(刺[0].值, 0)
  assert.ok(刺[0].率 > 0, '速率要落盘')
})

test('急通道：单条 0.30、距上条 4 分钟（速率 0.075）→ 结 0.10', async () => {
  // 2026-11-19：原来用 5 分钟（率 0.06），离「急 ≥0.05」的档线太近；
  // 整套并发跑时机器的排队延迟会把秒级时间戳拖过线，偶发掉到「缓」。
  // 改成 4 分钟（率 0.075），离档线有 50% 余量，并给率留 ±0.01 容差。
  const 四分钟前 = new Date(Date.now() - 4 * 60000).toISOString()
  const 起 = 起插件([{ id: 'e-0001', t: 四分钟前, delta_raw: { E: 0, S: 0, P: 0 }, note: '旧事', sid: 'c4b92d68', turn: 'old' }])
  await 报(起.路由, { E: 0.30, 轮: 'r1', 注: '一下砸过来' })
  const 刺 = 起.池().结
  assert.equal(刺.length, 1)
  assert.equal(刺[0].值, 0.1)
  assert.ok(Math.abs(Number(刺[0].率) - 0.075) <= 0.01, '率 应约 0.075，实际 ' + 刺[0].率)
  assert.equal(刺[0].速, '急')
})

test('作废结：不计入列表与合计，但保留在文件里', async () => {
  const 旧 = { t: new Date().toISOString(), 轴: 'S', 值: 0.05, 率: 0.15, 速: '急', τ: 120, 注: '小结', sid: 会话id, turn: 'old', 作废: true }
  const 活 = { t: new Date().toISOString(), 轴: 'P', 值: 0.30, 率: 0.30, 速: '急', τ: 210, 注: '疼', sid: 会话id, turn: 'old2' }
  const { 路由, 池 } = 起插件([], [旧, 活])
  const s = await 取(路由, '/dsh-emotion-pool/state')
  assert.equal(s.结.length, 1)
  assert.equal(s.结[0].注, '疼')
  assert.equal(s.结合计.S, 0)
  assert.equal(池().结.length, 2)
})
