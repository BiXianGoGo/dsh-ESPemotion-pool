// v1 对外接口（5 条）：/v1/state /v1/report（来源+只认聊天间）/403 日志 /v1/schema /v1/stream 首帧
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m36-'))
process.env.EMOTION_POOL_DIR = 目录
const 模 = await import('../lib/index.js')

const 配置 = {
  启用: true, 校验启用: false, 校验每天上限: 50, 校验只跑有自报的轮: true, 提醒启用: false,
  每日衰减系数: 0.9, 守恒上限: 1.0, 写入者: ['c4b92d68'], 注入启用: false, 刺阈值: 0.25,
  结累计阈值: 0.45, 结急阈值: 0.2, 结急速率: 0.05, 双轨校验: false,
  日志: ['情绪池-日志.md', '情绪池-日志.jsonl'], 刻度: 10,
}
const 会话 = 'session-c4b92d68-f40c-4fc3-ad69-f8338376753b'

function 起() {
  const p = {
    rev: 0, updated: new Date().toISOString(), axes: { E: 0, S: 0, P: 0 },
    spine: { E: 0, S: 0, P: 0 }, overflow: { E: 0, S: 0, P: 0 }, prev_cell: 'E0S0P0',
    events: [], 结: [], stats: { selfreport_total: 0, missed_total: 0 },
    p_state: { 爽: { s: 1, a: 1, 最近: null }, 痛: { s: 1, a: 1, 最近: null } },
    streak: { c4b92d68: { E: { n: 0, dir: 0, t: 0 }, S: { n: 0, dir: 0, t: 0 }, P: { n: 0, dir: 0, t: 0 } } },
  }
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(p, null, 2))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify(配置, null, 2))
  const 路由 = new Map()
  const ctx = {
    on() {}, effect(fn) { fn(); return () => {} },
    webServer: { register(o) { 路由.set(o.path, o.handler); return () => {} } },
    systemPrompt: { context: () => () => {} },
    llm: { async *stream() { yield { type: 'finish', reason: { kind: 'stop' } } } },
    agents: { list: () => [{ options: { provider: 'fake', model: 'f' } }] },
  }
  模.apply(ctx)
  return { 路由, 池: () => JSON.parse(readFileSync(join(目录, '情绪池.json'), 'utf8')) }
}

async function 请求(路由, 路径, 体, 方法 = 'POST') {
  let 回 = ''; let 码 = 200
  const req = {
    method: 方法, socket: { remoteAddress: '127.0.0.1' }, url: 路径, on() {},
    async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(体 || {})) },
  }
  await 路由.get(路径)(req, {
    set statusCode(v) { 码 = v }, get statusCode() { return 码 }, setHeader() {}, writeHead() {},
    write(s) { 回 += String(s) }, end(s) { if (s != null) 回 += String(s) }, on() {},
  })
  return { 码, 体: JSON.parse(回 || '{}'), 原文: 回 }
}

test('/v1/state：与 /state 同结构，多一个 版本=v1', async () => {
  const { 路由 } = 起()
  const r = await 请求(路由, '/dsh-emotion-pool/v1/state', {}, 'GET')
  assert.equal(r.码, 200)
  assert.equal(r.体.版本, 'v1')
  assert.equal(r.体.ok, true)
  assert.equal(typeof r.体.axes.E, 'number')
  assert.equal(r.体.刻度, 10)
  assert.ok(r.体.cell)
})

test('/v1/report：带 来源 与聊天间会话，事件里记 来源', async () => {
  const { 路由, 池 } = 起()
  const r = await 请求(路由, '/dsh-emotion-pool/v1/report', { E: 1, S: 0, P: 0, 注: '这段时间·悬着', 来源: 'dsh-voice', 会话: 会话, 用户话: '今天有点累' })
  assert.equal(r.码, 200)
  assert.equal(r.体.ok, true)
  const p = 池()
  assert.equal(p.events.length, 1)
  assert.equal(p.events[0].来源, 'dsh-voice')
  assert.equal(p.events[0].sid, 会话)
  assert.ok(Math.abs(p.events[0].delta_raw.E - 0.1) < 1e-9)
})

test('/v1/report：非聊天间来源 → 403，日志记 外部写入被拒', async () => {
  const { 路由 } = 起()
  const r = await 请求(路由, '/dsh-emotion-pool/v1/report', { E: 1, S: 0, P: 0, 来源: 'someone', 会话: 'session-3be73c36-aaaa' })
  assert.equal(r.码, 403)
  assert.equal(r.体.ok, false)
  const 日志 = readFileSync(join(目录, '情绪池-日志.md'), 'utf8')
  assert.match(日志, /外部写入被拒/)
})

test('/v1/report：缺 来源 → 400', async () => {
  const { 路由 } = 起()
  const r = await 请求(路由, '/dsh-emotion-pool/v1/report', { E: 1, S: 0, P: 0, 会话: 会话 })
  assert.equal(r.码, 400)
  assert.match(String(r.体.error), /来源/)
})

test('/v1/schema：能 JSON.parse，含关键字段；/v1/stream 首帧是 state', async () => {
  const { 路由 } = 起()
  const sc = await 请求(路由, '/dsh-emotion-pool/v1/schema', {}, 'GET')
  assert.equal(sc.码, 200)
  const 模版 = await import('../lib/index.js')
  assert.equal(typeof 模版.现值, 'function')
  assert.equal(sc.体.title, '鲸汐ESP /v1/state')
  assert.ok(sc.体.properties.axes)
  assert.ok(sc.体.properties.结)
  assert.ok(sc.体.properties.双轨)
  // stream：捕获写入的文本
  let 流文 = ''
  const req = { method: 'GET', socket: { remoteAddress: '127.0.0.1' }, url: '/dsh-emotion-pool/v1/stream', on() {} }
  const res = { statusCode: 200, setHeader() {}, writeHead() {}, write(s) { 流文 += String(s) }, on() {} }
  await 路由.get('/dsh-emotion-pool/v1/stream')(req, res)
  assert.match(流文, /^event: state\ndata: /)
  const 首帧 = JSON.parse(流文.split('data: ')[1].split('\n')[0])
  assert.equal(首帧.版本, 'v1')
  assert.equal(首帧.ok, true)
})
