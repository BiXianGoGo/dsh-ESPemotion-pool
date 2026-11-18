// v0.8 A：新自报格式、点数×认知度、两轨合成、K、分身额度、提醒隔离
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m38-'))
process.env.EMOTION_POOL_DIR = 目录
const 模 = await import('../lib/index.js')
const 双 = await import('../lib/dual.js')

const 配置 = {
  启用: true,
  校验启用: false,
  双轨重做: true,
  双轨阈值: 0.15,
  分身每批: 300,
  提醒启用: true,
  守恒上限: 1,
  写入者: ['c4b92d68'],
  注入启用: false,
  刻度: 1,
  日志: ['情绪池-日志.md', '情绪池-日志.jsonl'],
}
const 会话 = 'session-c4b92d68-f40c-4fc3-ad69-f8338376753b'

function 删除锁() { try { rmSync(join(目录, '情绪池.json.lock')) } catch {} }

function 重置() {
  删除锁()
  try { 删除锁() } catch {}
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify({ rev: 0, axes: { E: 0, S: 0, P: 0 }, spine: { S: 0 }, prev_cell: 'E0S0P0', events: [], stats: { selfreport_total: 0, missed_total: 0 } }, null, 2))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify(配置, null, 2))
  for (const f of ['情绪池-提醒.json', '情绪池-日志.md', '情绪池-日志.jsonl', '情绪池-分身额度.json']) {
    try { writeFileSync(join(目录, f), '') } catch {}
  }
}
重置()

test('新格式：点数 / q1 / q2 / 分析', () => {
  const r = 模.解析自报('好。<!-- EMO: E+2 S-1 P0 | q1=0.8 q2=0.6 | 分析: 他累了，我跟着悬 -->')
  assert.equal(r.ok, true)
  assert.deepEqual(r.点数, { E: 2, S: -1, P: 0 })
  assert.equal(r.q1, 0.8)
  assert.equal(r.q2, 0.6)
  assert.equal(r.分析, '他累了，我跟着悬')
  assert.equal(r.新格式, true)
})

test('旧格式兼容：E+ / S- 按 ±3 点，delta 仍是旧 0.15（不破坏老测试）', () => {
  const r = 模.解析自报('<!-- EMO: E+ S- P0 | 注释 -->')
  assert.deepEqual(r.点数, { E: 3, S: -3, P: 0 })
  assert.equal(r.新格式, false)
  assert.equal(r.delta.E, 0.15)
  assert.equal(r.delta.S, -0.15)
})

test('点数夹 ±9；q 缺省为 null（认知度按 0.7/0.7 兜底）', () => {
  const r = 模.解析自报('<!-- EMO: E+99 S0 P0 -->')
  assert.equal(r.点数.E, 9)
  assert.equal(r.q1, null)
  assert.equal(r.q2, null)
  assert.ok(Math.abs(双.认知度(1, null, null) - 0.7 * 1.12) < 1e-9)
})

test('认知度 = K × q1 × (0.7 + 0.6q2)', () => {
  const v = 双.认知度(1, 0.8, 0.6)
  assert.ok(Math.abs(v - 0.8 * 1.06) < 1e-9, String(v))
})

test('中点：三轴差都 ≤0.15 时逐轴取中点', () => {
  const 我 = { 点数: { E: 2, S: 0, P: 0 }, 认知度: 0.8 }
  const 它 = { 点数: { E: 3, S: 0, P: 0 }, 认知度: 0.8 }
  const r = 双.合成(我, 它)
  assert.equal(r.采用, '中点')
  assert.ok(Math.abs(r.delta.E - 0.1) < 1e-9, String(r.delta.E))
})

test('超区间四类：一方<0.5 / 双方≥0.5 / 有≥1 / 双低不可靠', () => {
  const 造 = (点, 认) => ({ 点数: { E: 点, S: 0, P: 0 }, 认知度: 认 })
  let r = 双.合成(造(2, 0.3), 造(9, 0.8))
  assert.equal(r.采用, '它')
  assert.ok(Math.abs(r.delta.E - 9 * 0.05 * 0.8) < 1e-9)

  r = 双.合成(造(5, 0.6), 造(9, 0.9))
  assert.equal(r.采用, '它')

  r = 双.合成(造(5, 1.0), 造(9, 1.1))
  assert.equal(r.采用, '它')
  assert.ok(Math.abs(r.delta.E - 9 * 0.05 * 1.1) < 1e-9)

  r = 双.合成(造(2, 0.2), 造(9, 0.4))
  assert.equal(r.不可靠, true)
  assert.equal(r.采用, '它')
  assert.ok(Math.abs(r.delta.E - 9 * 0.05 * 0.4) < 1e-9)
})

test('K：不足 5 轮固定 1.0；20 轮按被否/不可靠只压不抬，夹 0.5~1.0', () => {
  assert.equal(双.算K([{ 中点: true }, { 中点: true }]).K, 1.0)
  const 轮 = []
  for (let i = 0; i < 20; i++) 轮.push({ 中点: i < 10, 不可靠: i < 2 })
  const r = 双.算K(轮)
  assert.ok(Math.abs(r.K - (1 - 0.3 * 0.1)) < 1e-9, String(r.K))
  const 被否轮 = []
  for (let i = 0; i < 20; i++) 被否轮.push({ 被否: i < 10 })
  assert.ok(Math.abs(双.算K(被否轮).K - (1 - 0.6 * 0.5)) < 1e-9)
})

test('分身额度：一批 300，用完自动开下一批，累计不清零', () => {
  writeFileSync(join(目录, '情绪池-分身额度.json'), JSON.stringify({ 批: 1, 已用: 299, 本批上限: 300, 累计: 299 }))
  let r = 模.用分身额度()
  assert.deepEqual({ 批: r.批, 已用: r.已用, 累计: r.累计 }, { 批: 1, 已用: 300, 累计: 300 })
  r = 模.用分身额度()
  assert.deepEqual({ 批: r.批, 已用: r.已用, 累计: r.累计 }, { 批: 2, 已用: 1, 累计: 301 })
})

test('提醒隔离：A 间挂的提醒，B 间取不到；A 间取一次就消', () => {
  模.挂提醒(配置, 'A', 1, 'E+3', '差 0.2')
  模.放提醒闸('A')
  assert.equal(模.取提醒(配置, 'B'), '')
  const 文 = 模.取提醒(配置, 'A')
  assert.ok(文.includes('语气和自报对不上'), 文)
  assert.equal(模.取提醒(配置, 'A'), '')
})

test('单轨：分身失败时按我的轨迹写入，事件标 单轨:true', async () => {
  重置()
  const 解 = 模.解析自报('<!-- EMO: E+2 S-1 P0 | q1=0.8 q2=0.6 -->')
  const ctx = { llm: { async *stream() { throw new Error('boom') } }, agents: { list: () => [] } }
  await 模.跑本轮(ctx, { id: 会话 }, 会话, 7, '回复'.repeat(400), 解, '今天有点累')
  const 池 = JSON.parse(readFileSync(join(目录, '情绪池.json'), 'utf8'))
  const e = 池.events[池.events.length - 1]
  assert.equal(e.单轨, true)
  const 认 = 双.认知度(1.0, 0.8, 0.6)
  assert.ok(Math.abs(e.delta_raw.E - 2 * 0.05 * 认) < 1e-6, JSON.stringify(e.delta_raw))
  assert.ok(池.双轨 && 池.双轨.最近 && 池.双轨.最近.采用 === '单轨')
})
