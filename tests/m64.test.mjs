// v0.23 A1/A3：自报不推轴 / 波动点吸附 / 插队看波动点
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-a1-'))
process.env.EMOTION_POOL_DIR = 目录
process.env.EP_LEGACY_INJECT = '1' // 旧【此刻】格式的回归用例
const M = await import('../lib/index.js')

const 基础 = {
  启用: true, 自报推轴: false, 吸附系数: 0.4, 双轨K: 1,
  写入者: ['aaaaaaaa'], 注入启用: true, 注入日限: 24, 保底间隔分钟: 40, 保底轮数: 5,
  刻度: 1, 日志: ['情绪池-日志.md', '情绪池-日志.jsonl'],
}
const 空池 = () => ({
  rev: 0, updated: '2026-11-11T00:00:00+08:00', axes: { E: 0, S: 0, P: 0 },
  spine: { S: 0 }, prev_cell: 'E0S0P0', events: [], stats: { selfreport_total: 0, missed_total: 0 },
})
const 重置 = (改 = {}, 池 = 空池()) => {
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(池, null, 2))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify({ ...基础, ...改 }, null, 2))
  for (const f of ['情绪池-日志.md','情绪池-日志.jsonl','情绪池-注入.json','情绪池-轮号.json','情绪池-命名.json']) {
    const p = join(目录, f); if (existsSync(p)) rmSync(p)
  }
}
const 池 = () => JSON.parse(readFileSync(join(目录, '情绪池.json'), 'utf8'))
const 会话 = { id: 'session-aaaaaaaa-f40c-4fc3-ad69-f8338376753b' }
function 起插件() {
  const 监听 = []; const 路由 = []; const 槽 = []
  const ctx = {
    systemPrompt: { context(o) { 槽.push(o); return () => {} } },
    on(n, f) { if (n === 'session/event') 监听.push(f) },
    effect(fn) { fn(); return () => {} },
    webServer: { register(r) { 路由.push(r); return () => {} } },
    发(ev) { for (const fn of 监听) fn(会话, ev) },
  }
  M.apply(ctx)
  return { ...ctx, 路由, 注入() { for (const s of 槽) { const x = s.text && s.text(); if (x && String(x).startsWith('【此刻】')) return String(x) } return '' } }
}
const 调 = (路由, path, body) => new Promise((res) => {
  const r = 路由.find((x) => x.path === path)
  const 响应 = { status: 0, body: '', setHeader() {}, end(s) { this.body = s; res({ 码: this.status, body: this.body }) } }
  r.handler({ url: path, method: 'POST', socket: { remoteAddress: '127.0.0.1' }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)) } }, 响应)
})

before(() => 重置())

test('A1：默认自报只写事件；无轨迹时由兜底推轴（0 < E < 0.15）', () => {
  重置()
  const p = 起插件()
  p.发({ type: 'assistant/message', data: { turn: 1, message: { role: 'assistant', content: [{ type: 'text', text: '嗯。<!-- EMO: E+3 S0 P0 | 测试 -->' }] } } })
  const 存 = 池()
  assert.equal(存.events.length, 1)
  assert.equal(存.events[0].不推轴, true)
  assert.ok(存.axes.E > 0, '兜底应推轴')
  assert.ok(存.axes.E < 0.15, '兜底按 k 吸附，不等于原始 Δ')
})
test('A1：推轴按 k 吸附（0→P0.5，k=0.4 → 0.2）', () => {
  重置()
  M.推轴(会话.id, { E: 0.5, S: 0, P: 0 }, 1)
  const 存 = 池()
  assert.ok(Math.abs(存.axes.E - 0.2) < 1e-6, String(存.axes.E))
})

test('A1：吸附系数越界被夹到 0.2/0.8', () => {
  // §27.3 夹子（2026-11-16 A+D 单）：点 0.3 时 k=0.8 → 0.24、k=0.2 → 0.06，都落在 0.30 以内
  重置({ 吸附系数: 0.95 })
  M.推轴(会话.id, { E: 0.3, S: 0, P: 0 }, 1)
  assert.ok(Math.abs(池().axes.E - 0.24) < 1e-6)
  重置({ 吸附系数: 0.01 })
  M.推轴(会话.id, { E: 0.3, S: 0, P: 0 }, 1)
  assert.ok(Math.abs(池().axes.E - 0.06) < 1e-6)
})

test('A1：吸附不吸 spine（S: P0.7、spine0.2 → x0.2、轴0.4）', () => {
  const 初 = 空池(); 初.spine = { S: 0.2 }
  重置({}, 初)
  M.推轴(会话.id, { E: 0, S: 0.7, P: 0 }, 1)
  const 存 = 池()
  assert.ok(Math.abs(存.axes.S - 0.4) < 1e-6, String(存.axes.S))
  assert.equal(存.spine.S, 0.2)
})

test('A1：推轴写 上轮波动（轮/有/t）', () => {
  重置()
  M.推轴(会话.id, { E: 0.3, S: 0, P: 0 }, 7)
  const 波 = 池().上轮波动
  assert.equal(波.有, true)
  assert.equal(Number(波.轮), 7)
  assert.ok(波.t)
})

test('A1：删开关后推轴永远执行（没有「跳过」分支）', () => {
  重置({})
  const r = M.推轴(会话.id, { E: 0.5, S: 0, P: 0 }, 1)
  assert.equal(r.跳过, undefined)
  assert.ok(Math.abs(池().axes.E - 0.2) < 1e-6, String(池().axes.E))
})
test('A3：/state 露 吸附系数 / 今日插队挡下 / 本轮是否推轴', async () => {
  重置()
  M.推轴(会话.id, { E: 0.2, S: 0, P: 0 }, 1)
  const p = 起插件()
  const r = await 调(p.路由, '/dsh-emotion-pool/state', {})
  const o = JSON.parse(r.body)
  assert.equal(o.注入.吸附系数, 0.4)
  assert.equal(o.注入.今日插队挡下, 0)
  assert.equal(o.注入.本轮是否推轴, true)
})

test('A3：没有波动点 → 格变了也不插队', () => {
  重置({}, Object.assign(空池(), { events: [{ id: 'e-1', t: new Date().toISOString(), turn: 1, delta_raw: { E: 0.1, S: 0, P: 0 }, note: '' }], prev_cell: 'E-S0P0' }))
  writeFileSync(join(目录, '情绪池-注入.json'), JSON.stringify({ 今天: new Date().toISOString().slice(0, 10), 判断: 0, 注入: 0, 保底: 0, 插队: 0, 上次轮: 0, 上次时间: new Date(Date.now() - 60000).toISOString(), 上次格: 'E-S0P0' }, null, 2))
  writeFileSync(join(目录, '情绪池-轮号.json'), JSON.stringify({ 总: 1, 按会话: {}, 末: {} }, null, 2))
  const p = 起插件()
  assert.equal(p.注入(), '')
})

test('A3：有波动点 + 日限用满 → 挡下并计数', async () => {
  const 初 = 空池()
  初.events = [{ id: 'e-1', t: new Date().toISOString(), turn: 1, delta_raw: { E: 0.1, S: 0, P: 0 }, note: '' }]
  初.上轮波动 = { 轮: 1, 有: true, t: new Date().toISOString() }
  初.prev_cell = 'E-S0P0'
  重置({}, 初)
  writeFileSync(join(目录, '情绪池-注入.json'), JSON.stringify({ 今天: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10), 判断: 0, 注入: 0, 保底: 0, 插队: 24, 上次轮: 0, 上次时间: new Date(Date.now() - 60000).toISOString(), 上次格: 'E-S0P0' }, null, 2))
  writeFileSync(join(目录, '情绪池-轮号.json'), JSON.stringify({ 总: 2, 按会话: {}, 末: {} }, null, 2))
  const p = 起插件()
  assert.equal(p.注入(), '')
  const o = JSON.parse(readFileSync(join(目录, '情绪池-注入.json'), 'utf8'))
  assert.equal(o.挡下, 1)
})

test('A1：推轴来源可由选项写入（兜底用「自报兜底」）', () => {
  重置()
  M.推轴(会话.id, { E: 0.5, S: 0, P: 0 }, 1, { 吸附系数: 0.4 }, { 系数: 1, 来源: '自报兜底' })
  const 存 = 池()
  assert.ok(Math.abs(存.axes.E - 0.2) < 1e-6, String(存.axes.E))
  assert.equal(存.推轴来源, '自报兜底')
})
test('A1：吸附后顶格仍夹 ±1，且溢出有记录', () => {
  重置()
  M.推轴(会话.id, { E: 9, S: 0, P: 0 }, 1)
  const 存 = 池()
  assert.ok(存.axes.E <= 1 + 1e-9)
  assert.ok((存.溢出 && 存.溢出.E && 存.溢出.E.v) > 0)
})

test('A1：推轴 rev 递增、日志留一行', () => {
  重置()
  const 前 = 池().rev
  M.推轴(会话.id, { E: 0.2, S: 0, P: 0 }, 1)
  assert.ok(池().rev > 前)
  assert.match(readFileSync(join(目录, '情绪池-日志.md'), 'utf8'), /推轴/)
})

test('A1：吸附系数缺省时按 0.4', () => {
  重置({ 吸附系数: undefined })
  M.推轴(会话.id, { E: 0.5, S: 0, P: 0 }, 1)
  assert.ok(Math.abs(池().axes.E - 0.2) < 1e-6)
})

test('A1：推轴改快照，同时留一条推轴事件（2026-11-16 起）', () => {
  重置()
  M.推轴(会话.id, { E: 0.3, S: 0, P: 0 }, 1)
  const p1 = 池()
  assert.equal(p1.events.length, 1)
  assert.equal(p1.events[0].类型, '推轴')
})

test('A1：波动点纯函数——全程平 → []', () => {
  assert.deepEqual(M.波动点([{ i: 1, E: 0, S: 0, P: 0 }, { i: 2, E: 0.01, S: 0, P: 0 }], 0.15), [])
})

test('A3：保底不受日限影响（上次 41 分钟、插队已满）', () => {
  const 初 = 空池()
  初.events = [{ id: 'e-1', t: new Date().toISOString(), turn: 1, delta_raw: { E: 0.1, S: 0, P: 0 }, note: '' }]
  重置({}, 初)
  writeFileSync(join(目录, '情绪池-注入.json'), JSON.stringify({ 今天: new Date().toISOString().slice(0, 10), 判断: 0, 注入: 0, 保底: 0, 插队: 99, 上次轮: 0, 上次时间: new Date(Date.now() - 41 * 60000).toISOString(), 上次格: 'E-S0P0' }, null, 2))
  writeFileSync(join(目录, '情绪池-轮号.json'), JSON.stringify({ 总: 1, 按会话: {}, 末: {} }, null, 2))
  const p = 起插件()
  assert.ok(p.注入().startsWith('【此刻】'))
})

test('A3：今日插队挡下 在 /state 里可读', async () => {
  重置()
  const p = 起插件()
  const r = await 调(p.路由, '/dsh-emotion-pool/state', {})
  assert.equal(JSON.parse(r.body).注入.今日插队挡下, 0)
})
