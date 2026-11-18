// 2026-11-09 02:35：三个真 bug——软上限压成 0、结门槛改 30 分钟累计、user 正文取 data.content
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m20-'))
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

const 会话id = 'session-c4b92d68-f40c-4fc3-ad69-f8338376753b'

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
    监听,
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

test('A R1 抑制：S=1.0 时 S+0.15 仍写入 ~0.06（不归零）', async () => {
  const p = 起插件({ E: 0, S: 1.0, P: 0 })
  const r = await 调(p.路由, '/dsh-emotion-pool/report', { E: 0, S: 0.15, P: 0, 注: '顶格也要能记' })
  assert.equal(r.码, 200)
  const 池 = p.池()
  const v = 池.events[0].delta_raw.S
  assert.ok(v > 0.03 && v < 0.10, `实际增量 ${v}`)
  assert.ok(池.axes.S <= 1.0 + 1e-9)
})

test('B 结按 30 分钟累计：三次 0.15 不够 0.60，第四次才成结 0.0', async () => {
  const p = 起插件({ E: 0, S: 0, P: 0 })
  await 调(p.路由, '/dsh-emotion-pool/report', { E: 0, S: 0.15, P: 0 })
  await 调(p.路由, '/dsh-emotion-pool/report', { E: 0, S: 0.15, P: 0 })
  let 池 = p.池()
  assert.equal(池.结.length, 0, `两次不该成结：${JSON.stringify(池.结)}`)
  await 调(p.路由, '/dsh-emotion-pool/report', { E: 0, S: 0.15, P: 0 })
  await 调(p.路由, '/dsh-emotion-pool/report', { E: 0, S: 0.15, P: 0 })
  池 = p.池()
  assert.equal(池.结.length, 1, JSON.stringify(池.结))
  assert.ok(Math.abs(池.结[0].值) < 1e-9, `结值 ${池.结[0].值}`)
})

test('C user/message 的正文取 data.content，注记带出前 20 字', async () => {
  const p = 起插件({ E: 0, S: 0, P: 0 })
  const 会话 = { id: 会话id }
  // 模拟 QQ 唤醒：user/message 的形状是 data:{role,content}，没有 data.message
  for (const fn of p.监听) {
    fn(会话, { type: 'user/message', data: { id: 'u1', role: 'user', content: [{ type: 'text', text: '【QQ私聊】\n今天好累啊，想早点睡' }] } })
  }
  for (const fn of p.监听) {
    fn(会话, {
      type: 'assistant/message',
      data: { turn: 7, message: { content: [{ type: 'text', text: '那早点睡，我在。<!-- EMO: E0 S0 P0 | q1=1 q2=0.5 | 他累了 -->' }] } },
    })
  }
  const 池 = p.池()
  assert.equal(池.events.length, 1, JSON.stringify(池.events))
  assert.equal(池.events[0].note, '[今天好累啊，想早点睡] 他累了')
})
