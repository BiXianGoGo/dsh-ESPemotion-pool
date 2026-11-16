// 命名提醒升级为强制（2026-11-15 补丁）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { 签名, 相似度 } from '../lib/tpl.js'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-强制命名-'))
process.env.EMOTION_POOL_DIR = 目录
const M = await import('../lib/index.js')
const 源 = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
const { 同形 } = M
const 配 = { 启用: true, 写入者: ['aaaaaaaa'], 装载会话: ['aaaaaaaa'], 刻度: 1, 一致阈值: 0.15, 日志: ['情绪池-日志.md', '情绪池-日志.jsonl'] }
const 存 = () => {
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify({ rev: 0, axes: { E: 0, S: 0, P: 0 }, spine: { S: 0 }, events: [], stats: {} }))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify(配))
  for (const f of ['情绪池-注入.json', '情绪池-命名.json']) { const p = join(目录, f); if (existsSync(p)) rmSync(p) }
}
const 读注 = () => JSON.parse(readFileSync(join(目录, '情绪池-注入.json'), 'utf8'))
const 它点 = (组) => { const 点 = 组[0].点; const 出 = {}; for (const k of ['E','S','P']) { let 和 = 0; for (let i = 1; i < 点.length; i++) 和 += (Number(点[i][k]) || 0) - (Number(点[i-1][k]) || 0); 出[k] = Math.round((和 / (点.length - 1)) / 0.05) } return 出 }

const 形 = (n) => [
  [{ E: 0.1 }, { E: 0.4 }, { E: 0.2 }],
  [{ E: 0.4 }, { E: 0.1 }, { E: 0.3 }],
  [{ E: 0.1 }, { E: -0.2 }, { E: -0.1 }],
  [{ E: 0.2 }, { E: 0.3 }, { E: 0.5 }],
][(n - 1) % 4]

test('同形第 3 次升强制，次数字段累加', () => {
  存()
  const 组 = M.切分段(形(1), [{ 起: 1, 止: 3, 名: '' }])
  M.命名提醒记账('aaaaaaaa', 1, 组, {}, 配, 它点(组))
  M.命名提醒记账('aaaaaaaa', 2, 组, {}, 配, 它点(组))
  assert.equal(读注().命名.待.length, 1)
  M.命名提醒记账('aaaaaaaa', 3, 组, {}, 配, 它点(组))
  const 待 = 读注().命名.待
  assert.equal(待.length, 1)
  assert.equal(待[0].强制, true)
  assert.ok(待[0].次 >= 3)
})

test('同时最多 3 条：按次数排序，第 4 条起排队', () => {
  存()
  const pre = { 待: [1, 2, 3, 4].map((n) => ({ 名: '未命名（第' + n + '–' + n + '段）', 注: 'x', 起: n, 止: n, 次: n, 签: null, t: new Date().toISOString() })), 已: [] }
  writeFileSync(join(目录, '情绪池-注入.json'), JSON.stringify({ 命名: pre }))
  const 组 = M.切分段(形(1), [{ 起: 1, 止: 3, 名: '' }])
  M.命名提醒记账('aaaaaaaa', 30, 组, {}, 配, 它点(组))
  const 待 = 读注().命名.待
  assert.ok(待.length >= 4)
  assert.equal(待.filter((x) => !x.排队).length, 3)
  const 前4次 = 待.slice(0, 4).map((x) => x.次)
  assert.deepEqual(前4次, [4, 3, 2, 1])
  assert.ok(待.slice(3).every((x) => x.排队 === true))
})

test('确认/丢弃后清理：待与已都删掉', () => {
  存()
  const 组 = M.切分段(形(2), [{ 起: 1, 止: 3, 名: '' }])
  M.命名提醒记账('aaaaaaaa', 20, 组, {}, 配, 它点(组))
  const 名 = 读注().命名.待[0].名
  M.清理命名提醒(名)
  assert.equal(读注().命名.待.length, 0)
  assert.equal(读注().命名.已.length, 0)
})

test('强制 6 小时一次：取注入源码含 6 小时与【必须命名】', () => {
  assert.ok(源.includes('6 * 3600 * 1000'))
  assert.ok(源.includes('【必须命名】'))
  assert.ok(源.includes('清理命名提醒'))
})

test('同形去重：段数 ≤3 按逐段角度差（每轴 ≤25°）', () => {
  const A = 签名([{ E: 0 }, { E: 0 }, { E: 1 }])
  const B = 签名([{ E: 0 }, { E: 0 }, { E: 1 }])
  assert.equal(同形(A, B), true)
  const C = 签名([{ E: 1 }, { E: 0 }, { E: 1 }])
  assert.equal(同形(A, C), false)
})

test('同形去重：段数 ≥4 仍用相似度 ≥0.95', () => {
  const P = [{ E: 0 }, { E: 0.5 }, { E: 1 }, { E: 1.5 }, { E: 2 }]
  const Q = [{ E: 0.1 }, { E: 0.6 }, { E: 1.1 }, { E: 1.6 }, { E: 2.1 }]
  const A = 签名(P), B = 签名(Q)
  assert.equal(同形(A, B), 相似度(A, B).分 >= 0.95)
})
