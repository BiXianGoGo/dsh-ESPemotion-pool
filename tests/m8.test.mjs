// 2026-11-09 00:50 四件：刺 / 命名回落 / /set 手动记录 / 注入默认开
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m8-'))
process.env.EMOTION_POOL_DIR = 目录

const 模块 = await import('../lib/index.js')

const 基础配置 = {  启用: true,
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

const 会话 = { id: 'session-aaaaaaaa-f40c-4fc3-ad69-f8338376753b' }

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

function 重置(命名 = null) {
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(空池(), null, 2))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify(基础配置, null, 2))
  if (命名) writeFileSync(join(目录, '情绪池-命名.json'), JSON.stringify(命名, null, 2))
  for (const f of ['情绪池-日志.md', '情绪池-日志.jsonl', '情绪池-手动记录.md']) {
    const p = join(目录, f)
    if (existsSync(p)) rmSync(p)
  }
}

const 池 = () => JSON.parse(readFileSync(join(目录, '情绪池.json'), 'utf8'))

function 起插件() {
  const 监听 = []
  const 路由 = new Map()
  const ctx = {
    on(_名, fn) { 监听.push(fn) },
    effect(fn) { fn(); return () => {} },
    webServer: { register(o) { 路由.set(o.path, o.handler); return () => {} } },
    systemPrompt: { context: () => () => {} },
    llm: {},
    agents: { list: () => [] },
  }
  模块.apply(ctx)
  const 发 = (ev) => { for (const fn of 监听) fn(会话, ev) }
  return {
    路由,
    用户: (t) => 发({ type: 'user/message', data: { message: { role: 'user', content: [{ type: 'text', text: t }] } } }),
    回话: (轮, t) => 发({ type: 'assistant/message', data: { turn: 轮, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: t }] } } }),
  }
}

async function 调(路由, path, 体 = null, 地址 = '127.0.0.1') {
  let 回 = ''
  const req = {
    method: 体 ? 'POST' : 'GET',
    socket: { remoteAddress: 地址 },
    async *[Symbol.asyncIterator]() { if (体) yield JSON.stringify(体) },
  }
  await 路由.get(path)(req, { statusCode: 200, setHeader() {}, end(s) { 回 = String(s) } })
  return JSON.parse(回)
}

before(() => 重置())

test('v0.2.3：Δ_冲>0.25 时超出部分单独记一条，轴值只按 Δ_实 进', async () => {
  重置()
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify({ ...空池(), P敏感迁移: { at: new Date().toISOString() }, p_state: { 痛: { s: 1.5, a: 0.75, 最近: new Date().toISOString() }, 爽: { s: 1, a: 1, 最近: null } } }, null, 2))
  const p = 起插件()
  const r = await 调(p.路由, '/dsh-emotion-pool/report', { P: -0.3, 注: '疼' })
  assert.equal(r.ok, true)
  const 后 = 池()
  // 轴值夹到 −0.30（Δ_实）
  assert.ok(Math.abs(后.events[0].delta_raw.P + 0.3) < 1e-9, `Δ_实 ${后.events[0].delta_raw.P}`)
  assert.equal(后.结.length, 1)
  assert.equal(后.结[0].轴, 'P')
  // 冲 = −0.3×1.2996 ≈ −0.38988；结值 = 冲 − 0.25 ≈ −0.13988
  assert.ok(Math.abs(后.结[0].值 + 0.13988) < 0.003, `结值 ${后.结[0].值}`)
  assert.equal(后.结[0].速, '急')
  // 结不重复计入轴值：轴值只来自 Δ_实（夹到 −0.30）
  assert.ok(Math.abs(后.axes.P + 0.3) < 1e-6, `axes.P ${后.axes.P}`)
})

test('命名：无区间命中回落 27 格基础名，并带一句注', async () => {
  重置()
  const p = 起插件()
  const s = await 调(p.路由, '/dsh-emotion-pool/state')
  assert.equal(s.命名来源, '基础名')
  assert.equal(s.命名, s.格名)
  assert.ok(String(s.命名注).includes('还没有区间名'))
})

test('命名：有区间命中时优先区间名', async () => {
  重置({ version: 1, 名字: [{ 名: '空', 注: '什么都没抓住的那种轻', E: [-0.5, 0.5], S: [-0.5, 0.5], P: [-0.5, 0.5] }] })
  const p = 起插件()
  const s = await 调(p.路由, '/dsh-emotion-pool/state')
  assert.equal(s.命名来源, '区间')
  assert.equal(s.命名, '空')
  assert.equal(s.命名注, '什么都没抓住的那种轻')
})

test('/set：本机可改 spine，写进手动记录；非本机 403', async () => {
  重置()
  const p = 起插件()
  const r = await 调(p.路由, '/dsh-emotion-pool/set', { spine: { S: -0.2 }, 原因: '他说头有点晕' })
  assert.equal(r.ok, true)
  assert.equal(r.spine.S, -0.2)
  assert.equal(池().spine.S, -0.2)
  const 记录 = readFileSync(join(目录, '情绪池-手动记录.md'), 'utf8')
  assert.ok(记录.includes('spine.S: 0.000 → -0.200'))
  assert.ok(记录.includes('他说头有点晕'))

  const 拒 = await 调(p.路由, '/dsh-emotion-pool/set', { spine: { S: 0 } }, '8.8.8.8')
  assert.equal(拒.ok, false)
  assert.equal(池().spine.S, -0.2)
})

test('注入：默认配置里注入启用为 true（插件默认值）', async () => {
  const 源码 = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
  assert.ok(/注入启用:\s*true/.test(源码))
})
