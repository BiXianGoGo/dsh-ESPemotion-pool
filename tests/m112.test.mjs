// 分段命名 0.2.2（2026-11-15）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { 转折提示, 签名 } from '../lib/tpl.js'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-分段-'))
process.env.EMOTION_POOL_DIR = 目录
const M = await import('../lib/index.js')
const 源 = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
const 它点 = (组) => { const 点 = 组[0].点; const 出 = {}; for (const k of ['E','S','P']) { let 和 = 0; for (let i = 1; i < 点.length; i++) 和 += (Number(点[i][k]) || 0) - (Number(点[i-1][k]) || 0); 出[k] = Math.round((和 / (点.length - 1)) / 0.05) } return 出 }

const 配 = { 启用: true, 写入者: ['aaaaaaaa'], 装载会话: ['aaaaaaaa'], 刻度: 1, 一致阈值: 0.15, 日志: ['情绪池-日志.md', '情绪池-日志.jsonl'] }
const 存 = () => {
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify({ rev: 0, axes: { E: 0, S: 0, P: 0 }, spine: { S: 0 }, events: [], stats: {} }))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify(配))
  for (const f of ['情绪池-注入.json', '情绪池-命名.json', '情绪池-日志.md', '情绪池-日志.jsonl']) { const p = join(目录, f); if (existsSync(p)) rmSync(p) }
}

test('转折提示：逐轴反向给出提示，单调不给', () => {
  assert.deepEqual(转折提示([{ E: 0.1 }, { E: 0.5 }, { E: 0.1 }]), [3])
  assert.deepEqual(转折提示([{ E: 0.1 }, { E: 0.3 }, { E: 0.5 }]), [])
  assert.deepEqual(转折提示([{ E: 0.1 }]), [])
})

test('切分段：合法分段照用，覆盖连续且带签名', () => {
  const 点s = [{ E: 0.1, S: 0 }, { E: 0.3, S: 0 }, { E: 0.2, S: 0 }, { E: -0.1, S: 0 }]
  const 组 = M.切分段(点s, [{ 起: 1, 止: 2, 名: '往上' }, { 起: 3, 止: 4, 名: '回落' }])
  assert.equal(组.length, 2)
  assert.deepEqual([组[0].起, 组[0].止, 组[0].段数], [1, 2, 2])
  assert.deepEqual([组[1].起, 组[1].止], [3, 4])
  assert.equal(组[0].名, '往上')
  assert.equal(组[0].签名.段数, 1)
  assert.ok(组[0].签名.均值 && typeof 组[0].签名.均值.E === 'number')
})

test('切分段：非法分段（重叠/没覆盖完）回退到几何提示', () => {
  const 点s = [{ E: 0.1 }, { E: 0.5 }, { E: 0.1 }]
  const 组 = M.切分段(点s, [{ 起: 1, 止: 2, 名: 'x' }, { 起: 2, 止: 3, 名: 'y' }])
  assert.ok(组.length >= 1)
  assert.equal(组[组.length - 1].止, 3)
  assert.equal(组[0].起, 1)
})

test('提示词：分身/双轨都没有计次，分身有「为谁」与用户原话', () => {
  assert.ok(!源.includes('"计次"'))
  assert.ok(源.includes('为谁'))
  assert.ok(源.includes('索取／要求／占有'))
})

test('命名提醒：未命名 + 双轨一致 → 入注入待办 + 候选(源分段)；同形 24h 只提醒一次', () => {
  存()
  const 点s = [{ E: 0.1 }, { E: 0.3 }, { E: 0.2 }]
  const 组 = M.切分段(点s, [{ 起: 1, 止: 3, 名: '' }])
  assert.equal(M.命名提醒记账('aaaaaaaa', 7, 组, {}, 配, 它点(组)), 1)
  const 注 = JSON.parse(readFileSync(join(目录, '情绪池-注入.json'), 'utf8'))
  assert.equal(注.命名.待.length, 1)
  assert.equal(注.命名.待[0].起, 1)
  const 模 = JSON.parse(readFileSync(join(目录, '情绪模板.json'), 'utf8'))
  assert.equal(模.候选.length, 1)
  assert.equal(模.候选[0].源, '分段')
  assert.equal(M.命名提醒记账('aaaaaaaa', 8, 组, {}, 配, 它点(组)), 0)
})

test('命名提醒：不一致（偏移超阈）不提醒', () => {
  存()
  const 点s = [{ E: 0.1 }, { E: 0.3 }]
  const 组 = M.切分段(点s, [{ 起: 1, 止: 2, 名: '' }])
  assert.equal(M.命名提醒记账('aaaaaaaa', 9, 组, {}, 配, { E: 9, S: 0, P: 0 }), 0)
})