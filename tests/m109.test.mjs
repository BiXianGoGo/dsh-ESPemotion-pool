// S 轴经验账（2026-11-15）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-s经验-'))
process.env.EMOTION_POOL_DIR = 目录
const M = await import('../lib/index.js')
const 分片 = await import('../lib/store.js')
const 源 = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')

const 基池 = () => ({ rev: 0, updated: '2026-11-15T00:00:00+08:00', axes: { E: 0, S: 0, P: 0 }, spine: { S: 0 }, events: [], stats: {}, S经验: {} })
const 配 = { 启用: true, 双轨K: 1, 写入者: ['aaaaaaaa'], 装载会话: ['aaaaaaaa'], 刻度: 1, 日志: ['情绪池-日志.md', '情绪池-日志.jsonl'] }
const 存 = (池 = 基池()) => {
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(池, null, 2))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify(配, null, 2))
  for (const f of ['情绪池-日志.md','情绪池-日志.jsonl','情绪池-注入.json','情绪池-轮号.json','情绪池-命名.json']) { const p = join(目录, f); if (existsSync(p)) rmSync(p) }
}
const 读 = () => JSON.parse(readFileSync(join(目录, '情绪池.json'), 'utf8'))
const sid = 'session-aaaaaaaa-f40c-4fc3-ad69-f8338376753b'

test('S经验：无主题 → 0 且不入表', () => {
  存()
  const r = M.算S经验(sid, '', '结论')
  assert.equal(r.ΔS, 0)
  assert.equal(读().S经验.aaaaaaaa, undefined)
})

test('S经验：首次遇到新主题 → ΔS=0，只登记 命中1/翻车0', () => {
  存()
  const r = M.算S经验(sid, '插件报错', '把 zstd 帧循环解开了')
  assert.equal(r.ΔS, 0)
  const 条 = 读().S经验.aaaaaaaa['插件报错']
  assert.equal(条.命中, 1)
  assert.equal(条.翻车, 0)
  assert.equal(条.结论, '把 zstd 帧循环解开了')
})

test('S经验：第二次同结论 → +0.06', () => {
  存()
  M.算S经验(sid, '插件报错', 'A')
  assert.equal(M.算S经验(sid, '插件报错', 'A').ΔS, 0.06)
})

test('S经验：第三次同结论 → +0.048', () => {
  存()
  M.算S经验(sid, '插件报错', 'A')
  M.算S经验(sid, '插件报错', 'A')
  assert.equal(M.算S经验(sid, '插件报错', 'A').ΔS, 0.048)
})

test('S经验：结论不同 → 负，翻车 +1，结论更新', () => {
  存()
  M.算S经验(sid, '插件报错', 'A')
  const r = M.算S经验(sid, '插件报错', 'B')
  assert.equal(r.ΔS, -0.08)
  const 条 = 读().S经验.aaaaaaaa['插件报错']
  assert.equal(条.翻车, 1)
  assert.equal(条.结论, 'B')
})

test('S经验：隔 7 天衰减一半（+0.06 → +0.03）', () => {
  const 旧 = new Date(Date.now() - 7 * 86400000).toISOString()
  存({ ...基池(), S经验: { aaaaaaaa: { 插件报错: { 结论: 'A', t: 旧, 命中: 1, 翻车: 0 } } } })
  assert.ok(Math.abs(M.算S经验(sid, '插件报错', 'A').ΔS - 0.03) < 1e-9)
})

test('S经验：主题数超 300 删最旧', () => {
  const 表 = {}
  for (let i = 0; i < 300; i++) 表['题' + i] = { 结论: 'A', t: new Date(Date.now() - (1000 - i) * 60000).toISOString(), 命中: 1, 翻车: 0 }
  存({ ...基池(), S经验: { aaaaaaaa: 表 } })
  M.算S经验(sid, '新题', 'A')
  const 表2 = 读().S经验.aaaaaaaa
  assert.equal(Object.keys(表2).length, 300)
  assert.ok(表2['新题'])
  assert.ok(!表2['题0'], '最旧那条被删')
})

test('S经验：两个会话各自一张表，互不串', () => {
  存()
  M.算S经验(sid, '插件报错', 'A')
  M.算S经验('cccccccc', '取名', 'B')
  const 池 = 读()
  assert.equal(池.S经验.aaaaaaaa['插件报错'].命中, 1)
  assert.equal(池.S经验['cccccccc']['取名'].命中, 1)
  assert.ok(!池.S经验['cccccccc']['插件报错'])
})

test('S经验：分片拆/合保留每会话的经验表', () => {
  const 池 = { ...基池(), S经验: { aaaaaaaa: { 插件报错: { 结论: 'A', t: '2026-11-15T00:00:00+08:00', 命中: 2, 翻车: 1 } } }, events: [{ sid, t: '2026-11-15T00:00:00+08:00', turn: 1, delta_raw: { E: 0.1, S: 0, P: 0 }, note: 'x' }] }
  const 拆 = 分片.拆池(池)
  assert.equal(拆.本表.aaaaaaaa.S经验['插件报错'].命中, 2)
  assert.ok(!拆.总表.S经验 || !拆.总表.S经验.aaaaaaaa)
})

test('S经验：规整池把坏表修成对象', () => {
  存({ ...基池(), S经验: { aaaaaaaa: '坏', 'cccccccc': { x: 'bad' } } })
  const 池 = M.规整池(读())
  assert.equal(typeof 池.S经验.aaaaaaaa, 'object')
  assert.ok(!池.S经验['cccccccc'].x)
})

test('S经验：提示词 JSON 要求主题与结论', () => {
  assert.ok(源.includes('"主题":"插件报错","结论":"把 zstd 帧循环解开了"'))
  assert.ok(源.includes('主题（4–8 字'))
})

test('S经验：解析保留主题，结论截 30 字', () => {
  assert.ok(源.includes("主题: String(o.主题 || '').trim().slice(0, 8)"))
  assert.ok(源.includes("结论: String(o.结论 || '').trim().slice(0, 30)"))
})

test('S经验：ΔS 在 推轴 前加到 S 波动点，不绕过吸附', () => {
  const 段 = 源.slice(源.indexOf('let S经验 = null'), 源.indexOf('const 波动 = 波动点(主.点, 阈)'))
  assert.ok(段.includes('主.点.S = Number(主.点.S) + Number(S经验.ΔS)'))
  assert.ok(源.includes('推轴(sid, 波动[波动.length - 1]'))
})

test('S经验：日志带 S经验 增量与主题', () => {
  assert.ok(源.includes("' ｜ S经验 '"))
  assert.ok(源.includes('S经验.主题'))
})

test('S经验：/state 按装载会话列，不合并', () => {
  assert.ok(源.includes('S经验: 装载名单(配置).map('))
  assert.ok(源.includes('会话: 短2, 主题数: Object.keys(表).length'))
})

test('S经验：/state 最近最多 5 条且按时间倒序', () => {
  const 段 = 源.slice(源.indexOf('S经验: 装载名单(配置).map('), 源.indexOf('确认问:', 源.indexOf('S经验: 装载名单(配置).map(')))
  assert.ok(段.includes('.slice(0, 5)'))
  assert.ok(段.includes('Date.parse(b.t)'))
})

test('S经验：常数 0.06 / 0.08 与下限 0.012 / 0.016 写死', () => {
  assert.ok(源.includes('0.06 * Math.pow(0.8, n - 2)'))
  assert.ok(源.includes('0.08 * Math.pow(0.8, n - 2)'))
  assert.ok(源.includes('Math.max(0.012'))
  assert.ok(源.includes('Math.max(0.016'))
})

test('S经验：无主题不影响主流程（返回 0 不抛）', () => {
  存()
  assert.doesNotThrow(() => M.算S经验(sid, undefined, undefined))
  assert.equal(读().S经验.aaaaaaaa, undefined)
})
