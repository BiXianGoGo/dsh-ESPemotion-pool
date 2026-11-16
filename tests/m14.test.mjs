// 2026-11-09 01:30：两个真因——report 缺用户话要兜底前缀；同向连续自报递减
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m14-'))
process.env.EMOTION_POOL_DIR = 目录

const 模块 = await import('../lib/index.js')

const 配置 = {
  启用: true,
  双轨K: 1,
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
  let 收件 = null
  const 监听 = []
  const 路由 = new Map()
  const agent = {
    session: { id: 会话id },
    ctx: { on(名, fn) { if (名 === 'agent/inbox/inserted') 收件 = fn } },
  }
  const ctx = {
    on(_名, fn) { 监听.push(fn) },
    effect(fn) { fn(); return () => {} },
    webServer: { register(o) { 路由.set(o.path, o.handler); return () => {} } },
    systemPrompt: { context: () => () => {} },
    llm: {},
    agents: { list: () => [agent] },
  }
  模块.apply(ctx)
  const 发 = (ev) => { for (const fn of 监听) fn({ id: 会话id }, ev) }
  return {
    注入: (t) => 收件 && 收件({ message: { role: 'user', content: [{ type: 'text', text: t }] } }),
    回话: (轮, t) => 发({ type: 'assistant/message', data: { turn: 轮, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: t }] } } }),
    池: () => JSON.parse(readFileSync(join(目录, '情绪池.json'), 'utf8')),
    路由,
  }
}

async function 调(路由, path, 体) {
  let 回 = ''
  let 码 = 200
  const req = {
    method: 'POST', url: path, socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(体)) },
  }
  await 路由.get(path)(req, {
    set statusCode(v) { 码 = v }, get statusCode() { return 码 }, setHeader() {}, writeHead() {},
    end(s) { 回 = String(s) },
  })
  let 对 = {}
  try { 对 = JSON.parse(回) } catch (e) { 对 = { raw: 回 } }
  return { 码, 体: 对 }
}

test('report 没有用户话、也没有缓存：note 写 [无用户话]', async () => {
  const p = 起插件()
  const r = await 调(p.路由, '/dsh-emotion-pool/report', { E: 0.15, S: 0, P: 0, 注: '陪他说话' })
  assert.equal(r.码, 200)
  assert.equal(p.池().events[0].note, '[无用户话] 陪他说话')
})

test('report 没有用户话、但缓存里有：用缓存补前缀', async () => {
  const p = 起插件()
  p.注入('今天有点累，先睡了')
  const r = await 调(p.路由, '/dsh-emotion-pool/report', { E: 0.15, S: 0, P: 0, 注: '陪他说话' })
  assert.equal(r.码, 200)
  assert.equal(p.池().events[0].note, '[今天有点累，先睡了] 陪他说话')
})

test('同轴连续同向递减：S+ 0.15 / 0.09 / 0.06 / 0.03', () => {
  const p = 起插件()
  for (let i = 1; i <= 4; i += 1) {
    p.注入(`第 ${i} 次`)
    p.回话(i, '好。\n<!-- EMO: E0 S+ P0 | q1=1 q2=0.5 -->')
  }
  const es = p.池().events
  assert.equal(es.length, 4)
  assert.ok(Math.abs(es[0].delta_raw.S - 0.15) < 1e-9)
  assert.ok(Math.abs(es[1].delta_raw.S - 0.09) < 1e-9)
  assert.ok(Math.abs(es[2].delta_raw.S - 0.06) < 1e-9)
  assert.ok(Math.abs(es[3].delta_raw.S - 0.03) < 1e-9)
})

test('换方向或换轴会重新从 1.0 开始', () => {
  const p = 起插件()
  p.注入('一次')
  p.回话(1, '好。\n<!-- EMO: E0 S+ P0 | q1=1 q2=0.5 -->')
  p.注入('二次')
  p.回话(2, '好。\n<!-- EMO: E0 S- P0 | q1=1 q2=0.5 -->')
  p.注入('三次')
  p.回话(3, '好。\n<!-- EMO: E+ S0 P0 | q1=1 q2=0.5 -->')
  const es = p.池().events
  assert.ok(Math.abs(es[1].delta_raw.S + 0.15) < 1e-9, `S− 应重新满额，实际 ${es[1].delta_raw.S}`)
  assert.ok(Math.abs(es[2].delta_raw.E - 0.15) < 1e-9, `E+ 也重新满额，实际 ${es[2].delta_raw.E}`)
})
