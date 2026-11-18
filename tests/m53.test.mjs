import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m53-'))
process.env.EMOTION_POOL_DIR = 目录
const M = await import('../lib/index.js?m53=' + Date.now())

const 配 = (o = {}) => writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify({ 启用: true, 写入者: ['aaaaaaaa'], 刻度: 1, 日志: ['情绪池-日志.md'], ...o }, null, 2))
const 池 = () => writeFileSync(join(目录, '情绪池.json'), JSON.stringify({
  rev: 0, updated: new Date().toISOString(), axes: { E: 0, S: 0, P: 0 }, spine: { E: 0, S: 0, P: 0 },
  prev_cell: 'E0S0P0', events: [], 结: [], streak: {}, 结窗: {}, stats: { selfreport_total: 0, missed_total: 0 },
  p_state: { 爽: { s: 1, a: 1, 最近: null }, 痛: { s: 1, a: 1, 最近: null } },
}, null, 2))

function ctx(出们 = []) {
  const 调 = []
  const 会话 = { id: 'session-aaaaaaaa-1111', agent: { session: { id: 'session-aaaaaaaa-1111', requestHeader: () => ({ config: { provider: 'p1', model: 'm1' } }) } } }
  const c = {
    on() {}, effect(fn) { fn(); return () => {} },
    webServer: { register() { return () => {} } },
    systemPrompt: { context: () => () => {} },
    agents: { list: () => [] },
    llm: {
      async *stream(o) {
        调.push(o)
        const t = 出们.length ? 出们.shift() : ''
        yield { type: 'text-delta', text: t }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    },
  }
  M.apply(c)
  return { c, 调, 会话 }
}

const 点 = (E, S, P, 注 = '在替他找理由', 依据 = '顺着趋势', 预判 = 'E+ S0 P-') => ({ i: 1, E, S, P, 注, 依据, 预判 })
const 好JSON = (E, S, P) => JSON.stringify({ 点: [点(E, S, P)] })
const 计 = () => JSON.parse(readFileSync(join(目录, '情绪池-轨迹计数.json'), 'utf8'))

test('波动：同向累计到阈值 → 1 个点，落点取结束坐标', () => {
  const 段 = [点(0, 0, 0), 点(0.05, 0, 0), 点(0.1, 0, 0), 点(0.2, 0, 0)]
  const w = M.波动点(段, 0.15)
  assert.equal(w.length, 1)
  assert.equal(w[0].E, 0.2)
})

test('波动：中途反转 → 在反转那点结束', () => {
  const 段 = [点(0, 0, 0), 点(0.1, 0, 0), 点(0.2, 0, 0), 点(0.12, 0, 0)]
  const w = M.波动点(段, 0.15)
  assert.equal(w.length, 1)
  assert.equal(w[0].E, 0.12)
})

test('波动：全程平 → 0 个点', () => {
  const 段 = [点(0, 0, 0), 点(0.02, 0, 0), 点(0.01, 0, 0), 点(0.02, 0, 0)]
  assert.deepEqual(M.波动点(段, 0.15), [])
})

test('波动：回落到起点 0.05 以内也算结束', () => {
  const 段 = [点(0, 0, 0), 点(0.2, 0, 0), 点(0.03, 0, 0)]
  const w = M.波动点(段, 0.15)
  assert.equal(w.length, 1)
  assert.equal(w[0].E, 0.03)
})

test('波动点结构含 注/依据/预判/起止/t', () => {
  const w = M.波动点([点(0, 0, 0), 点(0.2, 0.1, -0.1)], 0.15)
  assert.equal(w.length, 1)
  for (const k of ['t', '起', '止', 'E', 'S', 'P', '注', '依据', '预判']) assert.ok(k in w[0], k)
  assert.ok(w[0].注.length >= 3)
})

test('波动：另两轴写结束时的真实坐标，不填 0', () => {
  const w = M.波动点([点(0, 0, 0), 点(0.2, 0.3, -0.4)], 0.15)
  assert.equal(w[0].S, 0.3)
  assert.equal(w[0].P, -0.4)
})

test('波动阈值可调：0.3 不触发、0.1 触发', () => {
  const 段 = [点(0, 0, 0), 点(0.2, 0, 0)]
  assert.equal(M.波动点(段, 0.3).length, 0)
  assert.equal(M.波动点(段, 0.1).length, 1)
})

test('打点走配置里的打点模型（不是会话模型）', async () => {
  配({ 打点模型: { provider: 'p2', model: 'm2' } })
  池()
  const { c, 调, 会话 } = ctx([好JSON(0.2, 0, 0)])
  const r = await M.跑轨迹(c, 会话, 'session-aaaaaaaa-1111', 21, '这一段足够长可以打点')
  assert.equal(调[0].provider, 'p2')
  assert.equal(调[0].model, 'm2')
  assert.equal(r.打点模型, '配置')
})

test('没配打点模型 → 回退会话模型，轮记录标「会话」', async () => {
  配({})
  池()
  const { c, 调, 会话 } = ctx([好JSON(0.2, 0, 0)])
  const r = await M.跑轨迹(c, 会话, 'session-aaaaaaaa-1111', 22, '这一段足够长可以打点')
  assert.equal(调[0].provider, 'p1')
  assert.equal(r.打点模型, '会话')
  assert.equal(计().轮.at(-1).打点模型, '会话')
})

test('打点输入不含自报点数/旧轨迹/K/q', async () => {
  配({})
  池()
  const { c, 调, 会话 } = ctx([好JSON(0.2, 0, 0)])
  await M.跑轨迹(c, 会话, 'session-aaaaaaaa-1111', 23, '这一段足够长可以打点', 3, '他有点累', '我陪着')
  const 文 = 调[0].messages[0].content[0].text
  assert.ok(文.includes('上一轮对话摘要'))
  assert.ok(文.includes('当前坐标与趋势'))
  for (const 禁 of ['自报', '旧轨迹', 'K=', 'q1=', 'q2=']) assert.ok(!文.includes(禁), 禁)
})

test('两次 JSON 坏 → 失败，轮记录带原因', async () => {
  配({})
  池()
  const { c, 会话 } = ctx(['不是 json', '还不是 json'])
  const r = await M.跑轨迹(c, 会话, 'session-aaaaaaaa-1111', 24, '这一段足够长可以打点')
  assert.equal(r.失败, true)
  assert.equal(计().轮.at(-1).原因, 'JSON坏')
})

test('两次注太短 → 失败，原因写「注太短」', async () => {
  配({})
  池()
  const 短 = JSON.stringify({ 点: [点(0.2, 0, 0, '略')] })
  const { c, 会话 } = ctx([短, 短])
  const r = await M.跑轨迹(c, 会话, 'session-aaaaaaaa-1111', 25, '这一段足够长可以打点')
  assert.equal(r.失败, true)
  assert.equal(计().轮.at(-1).原因, '注太短')
})

test('设置三键：合法值落盘、未知键保留', () => {
  配({ 恢复备份: true })
  assert.equal(M.校验设置('动画时长', 1200).值, 1200)
  assert.equal(M.校验设置('缓动强度', 2.5).值, 2.5)
  assert.equal(M.校验设置('蓝收缩时长', 1000).值, 1000)
  M.写设置('动画时长', 900)
  const o = JSON.parse(readFileSync(join(目录, '情绪池配置.json'), 'utf8'))
  assert.equal(o.动画时长, 900)
  assert.equal(o.恢复备份, true)
})

test('设置三键：越界拒绝', () => {
  assert.ok(M.校验设置('动画时长', 2001).错误)
  assert.ok(M.校验设置('缓动强度', 0.5).错误)
  assert.ok(M.校验设置('蓝收缩时长', -1).错误)
})

test('版本：导出与 package.json 一致，且为 0.2.7', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(M.版本, '0.2.7')
  assert.equal(pkg.version, M.版本)
})

test('轨迹摘要带 版本/波动/打点模型，跑一轮后波动可读', async () => {
  配({})
  池()
  const { c, 会话 } = ctx([好JSON(0.2, 0.1, -0.1)])
  await M.跑轨迹(c, 会话, 'session-aaaaaaaa-1111', 26, '这一段足够长可以打点')
  const 摘 = M.轨迹摘要()
  assert.equal(摘.版本, '0.2.7')
  assert.equal(摘.打点模型, '会话')
  assert.ok(Array.isArray(摘.波动))
})

test('卡片源码：第一页三层 + 版本显示', () => {
  const src = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')
  for (const t of ['ep-green', 'ep-blu', 'ep-zdot', 'requestAnimationFrame', 's.版本']) assert.ok(src.includes(t), t)
})
