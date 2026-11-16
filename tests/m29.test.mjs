// v0.4 验收（8 条）：R1 溢出 / R2 未命名归并 / R3 缺定名 / R4 双轨缺依据
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m29-'))
process.env.EMOTION_POOL_DIR = 目录
const 模 = await import('../lib/index.js')

const 配置 = {
  启用: true, 校验启用: false, 校验每天上限: 50, 校验只跑有自报的轮: true, 提醒启用: false,
  每日衰减系数: 0.9, 守恒上限: 1.0, 写入者: ['aaaaaaaa'], 注入启用: false, 刺阈值: 0.25,
  结累计阈值: 0.45, 结急阈值: 0.2, 结急速率: 0.05,
  双轨校验: true, 一致阈值: 0.1, 报警阈值: 0.4, 报警冷却小时: 24,
  日志: ['情绪池-日志.md', '情绪池-日志.jsonl'],
}
const 会话 = 'session-aaaaaaaa-f40c-4fc3-ad69-f8338376753b'

function 起(池, 事件 = []) {
  const p = {
    rev: 0, updated: new Date().toISOString(), axes: { E: 0, S: 0, P: 0 },
    spine: { E: 0, S: 0, P: 0 }, overflow: { E: 0, S: 0, P: 0 }, prev_cell: 'E0S0P0',
    events: 事件, 结: [], stats: { selfreport_total: 0, missed_total: 0 },
    p_state: { 爽: { s: 1, a: 1, 最近: null }, 痛: { s: 1, a: 1, 最近: null } },
    streak: { aaaaaaaa: { E: { n: 0, dir: 0, t: 0 }, S: { n: 0, dir: 0, t: 0 }, P: { n: 0, dir: 0, t: 0 } } },
    ...池,
  }
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(p, null, 2))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify(配置, null, 2))
  const 路由 = new Map(); const 文本 = new Map()
  const ctx = {
    on() {}, effect(fn) { fn(); return () => {} },
    webServer: { register(o) { 路由.set(o.path, o.handler); return () => {} } },
    systemPrompt: { context: (o) => { 文本.set(o.name, o.text); return () => {} } },
    llm: { async *stream() { for (const ch of JSON.stringify({ E: 0.15, S: -0.15, P: 0, 依据: '像在陪', 回忆: false, 档位: null })) yield { type: 'text-delta', text: ch }; yield { type: 'finish', reason: { kind: 'stop' } } } },
    agents: { list: () => [{ options: { provider: 'fake', model: 'f' } }] },
  }
  模.apply(ctx)
  return { 路由, 文本, 池: () => JSON.parse(readFileSync(join(目录, '情绪池.json'), 'utf8')) }
}

async function 请求(路由, 路径, 体, 方法 = 'POST') {
  let 回 = ''; let 码 = 200
  const req = {
    method: 方法, socket: { remoteAddress: '127.0.0.1' }, url: 路径,
    async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(体 || {})) },
  }
  await 路由.get(路径)(req, {
    set statusCode(v) { 码 = v }, get statusCode() { return 码 }, setHeader() {}, writeHead() {}, end(s) { 回 = String(s) },
  })
  return { 码, 体: JSON.parse(回 || '{}') }
}

test('R1：顶格后溢出单独累加，向量 > 1，回落不动溢出', () => {
  const e = { id: 'a', t: new Date().toISOString(), delta_raw: { E: 0.84, S: 0, P: 0 }, note: '[他说累] 陪他', sid: 会话, turn: 1 }
  const { 路由, 池 } = 起({}, [e])
  return 请求(路由, '/dsh-emotion-pool/report', { E: 0.3, S: 0, P: 0, 注: '这段时间·悬着', 用户话: '今天有点累' }).then(async (r) => {
    assert.equal(r.码, 200)
    const p = 池()
    assert.equal(Number((p.溢出 && p.溢出.E && p.溢出.E.v) || 0), 0, '自报路径不记溢出')
    await 模.推轴(会话, { E: 9, S: 0, P: 0 }, 2, { ...配置, 吸附系数: 0.8 })
    const p2 = 池()
    assert.ok(p2.溢出.E.v > 0.05, JSON.stringify(p2.溢出))
    const 状态 = await 请求(路由, '/dsh-emotion-pool/state', {}, 'GET')
    assert.ok(状态.体.坐标向量.E.向量 > 1, JSON.stringify(状态.体.坐标向量))
    assert.match(状态.体.显示文本, /E\+ 1\.0000/)
    // 回落倍不改变 overflow
    p.回落 = { at: new Date(Date.now() - 12 * 3600 * 1000).toISOString(), 倍: 1 }
    writeFileSync(join(目录, '情绪池.json'), JSON.stringify(p, null, 2))
    const 再 = 池()
    assert.equal(再.溢出.E.v, p.溢出.E.v)
  })
})

test('R1：/reset 后溢出与事件一起归零', async () => {
  const { 路由, 池 } = 起({ overflow: { E: 0.4, S: 0, P: 0 } })
  const r = await 请求(路由, '/dsh-emotion-pool/reset', {})
  assert.equal(r.码, 200)
  const p = 池()
  assert.deepEqual(p.overflow, { E: 0, S: 0, P: 0 })
  assert.equal(p.events.length, 0)
})

test('R2：同 cell 相似 note 的 4 条未命名事件合成 1 个区间，原件保留', () => {
  const t = Date.now()
  const 事件 = [0, 1, 2, 3].map((i) => ({
    id: 'u' + i, t: new Date(t + i * 20 * 60000).toISOString(),
    delta_raw: { E: 0, S: 0.15, P: 0 }, note: '[他说累] 陪着他 ' + i,
    cell: 'E0S+ P0', 定名: '未命名', sid: 会话, turn: i + 1,
  }))
  const { 池 } = 起({}, 事件)
  模.归并未命名()
  const p = 池()
  const 区间 = p.events.filter((e) => e.类型 === '区间')
  assert.equal(区间.length, 1)
  assert.equal(区间[0].合并数, 4)
  assert.equal(p.events.filter((e) => e.merged_into).length, 4)
  const 轴 = 模.现值(p).轴
  assert.ok(Math.abs(轴.S - 0.6) < 1e-6, String(轴.S))
})

test('R2：不同 cell 或跨 48 小时不合并', () => {
  const t = Date.now()
  const 事件 = [
    { id: 'x1', t: new Date(t).toISOString(), delta_raw: { E: 0.15, S: 0, P: 0 }, note: '[他说累] 陪着他', cell: 'E+S0P0', 定名: '未命名' },
    { id: 'x2', t: new Date(t + 60000).toISOString(), delta_raw: { E: 0.15, S: 0, P: 0 }, note: '[他说累] 陪着他', cell: 'E0S0P0', 定名: '未命名' },
    { id: 'x3', t: new Date(t).toISOString(), delta_raw: { E: 0, S: 0.15, P: 0 }, note: '[他说累] 陪着他', cell: 'E0S+P0', 定名: '未命名' },
    { id: 'x4', t: new Date(t + 49 * 3600000).toISOString(), delta_raw: { E: 0, S: 0.15, P: 0 }, note: '[他说累] 陪着他', cell: 'E0S+P0', 定名: '未命名' },
  ]
  const { 池 } = 起({}, 事件)
  模.归并未命名()
  assert.equal(池().events.filter((e) => e.类型 === '区间').length, 0)
})

test('R3：缺定名记违规 + 下一轮提醒（只给一次）', async () => {
  const { 路由, 文本 } = 起({})
  const r = await 请求(路由, '/dsh-emotion-pool/report', { E: 0, S: 0.15, P: 0, 注: '普通两句话', 用户话: '嗯' })
  assert.equal(r.码, 200)
  assert.equal(模.读定名状态().连续, 1)
  assert.ok(existsSync(join(目录, '情绪池-违规.jsonl')))
  const 提 = 文本.get('emotion-pool-定名')
  const 一 = 提()
  assert.match(一, /没写定名/)
  assert.equal(提(), '')
})

test('R3：连续 3 次缺定名，计数到 3（报警路径不抛）', async () => {
  const { 路由 } = 起({})
  for (let i = 0; i < 3; i++) {
    await 请求(路由, '/dsh-emotion-pool/report', { E: 0, S: 0.15, P: 0, 注: '普通两句话', 轮: 100 + i })
  }
  assert.ok(模.读定名状态().连续 >= 3, String(模.读定名状态().连续))
})

test('R4：双轨依据没有 [..] 时产提醒并计数，不静默跳过', async () => {
  const { 文本 } = 起({})
  const 前 = 模.双轨统计().缺依据次数
  const r = await 模.跑双轨({ llm: { async *stream() { for (const ch of JSON.stringify({ E: 0.15, S: 0, P: 0, 依据: '陪他', 回忆: false, 档位: null })) yield { type: 'text-delta', text: ch }; yield { type: 'finish', reason: { kind: 'stop' } } } }, agents: { list: () => [{ options: { provider: 'fake', model: 'f' } }] } }, { id: 会话 }, 501, '嗯', { E: 0.15, S: 0, P: 0 }, '陪他', '今天有点累')
  assert.equal(r.缺依据, true)
  assert.ok(模.双轨统计().缺依据次数 > 前, String(模.双轨统计().缺依据次数))
  assert.match(文本.get('emotion-pool-依据')(), /没有可指认的引用句/)
})

test('R4：依据带 [..] 时不算缺依据', async () => {
  const r = await 模.跑双轨({ llm: { async *stream() { for (const ch of JSON.stringify({ E: 0.15, S: 0, P: 0, 依据: '像在陪', 回忆: false, 档位: null })) yield { type: 'text-delta', text: ch }; yield { type: 'finish', reason: { kind: 'stop' } } } }, agents: { list: () => [{ options: { provider: 'fake', model: 'f' } }] } }, { id: 会话 }, 502, '嗯', { E: 0.15, S: 0, P: 0 }, '[他说有点累] 陪他', '今天有点累')
  assert.equal(r.缺依据, false)
})
