import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { 认知度, 四支, 主曲线, 合成 } from '../lib/dual.js'

const 源 = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')

test('判分口径：两套提示词都有三问原文', () => {
  for (const 句 of [
    '问1：这一轮我是在向他要（向他者索取／要求／占有），还是在让（自我让渡／自我贬低／对他人的崇拜）？',
    '问2：这一轮的语境有没有让我对"当下是什么情况"判断出现偏差（含对他人遭遇的判断有坏影响）？',
    '问3：这一轮的结果是不是我想要的（顺势／被认可鼓励／正反馈为正；需要找补／想转移回避／负反馈为负）？'
  ]) {
    const n = 源.split(句).length - 1
    assert.ok(n >= 2, '两套提示词各一次：' + 句)
  }
})

test('判分口径：JSON 多三问，v0.2.2 起「计次」删除、改「为谁」', () => {
  assert.ok(源.includes('"三问":{"要":"…","动摇":"…","结果":"…"}'))
  assert.ok(!源.includes('"计次"'))
  assert.equal(源.split('期许按 0.5 权重').length - 1, 0)
  assert.ok(源.includes('"为谁":"为他"'))
})

test('判分口径：认知度平时夹 1.0，仅确信且自信 ×1.5', () => {
  assert.equal(认知度(2, 1, 1), 1.5)
  assert.equal(认知度(1, 1, 1), 1.5)
  assert.equal(认知度(0.9, 1, 1), 1.0)
  assert.equal(认知度(1, 0.8, 1), 1.0)
  assert.equal(认知度(1, 1, 0.8), 1.0)
  assert.equal(认知度(0.95, 0.9, 0.9), 1.5)
  const d = readFileSync(new URL('../lib/dual.js', import.meta.url), 'utf8')
  assert.ok(d.includes('<0.5 不确信不自信'))
  assert.ok(d.includes('0.5~1 确信但不自信'))
  assert.ok(d.includes('>1 确信且自信'))
  assert.ok(d.includes('Math.min(1.5'))
})

test('判分口径：四支的边界', () => {
  assert.equal(四支(0.49, 1.0), '它')
  assert.equal(四支(1.0, 0.49), '我')
  assert.equal(四支(0.5, 0.9), '它')
  assert.equal(四支(0.9, 0.5), '我')
  assert.equal(四支(1.1, 1.2), '它')
  assert.equal(四支(1.2, 1.1), '我')
  assert.equal(四支(0.4, 0.3), '我')
  assert.equal(四支(0.3, 0.4), '它')
  assert.equal(四支(1, 1), '它')
})

test('判分口径：主曲线超阈按认知度四支，低认知那轨让位', () => {
  const 甲 = [{E:6,S:-4,P:0},{E:6,S:-4,P:0}]
  const 乙 = [{E:-6,S:4,P:0},{E:-6,S:4,P:0}]
  const a = 主曲线(甲, 乙, 1, 1, 0.15, { 分身权重: 0.7, 认我: 1.2, 认它: 0.3 })
  assert.equal(a.来源, '我')
  const b = 主曲线(甲, 乙, 1, 1, 0.15, { 分身权重: 0.7, 认我: 0.3, 认它: 1.2 })
  assert.equal(b.来源, '分身')
  const c = 主曲线(甲, 乙, 1, 1, 0.15, { 分身权重: 0.7, 认我: 0.8, 认它: 1.2 })
  assert.equal(c.来源, '分身')
})

test('判分口径：合成超阈不再「一律取分身」，按认知度四支', () => {
  const 我 = { 点数: { E: 5, S: 5, P: 5 }, 裁决度: 0.9, 认知度: 1.2 }
  const 它 = { 点数: { E: -5, S: -5, P: -5 }, 裁决度: 0.9, 认知度: 0.3 }
  assert.equal(合成(我, 它).采用, '我')
  const 我2 = { 点数: { E: 5, S: 5, P: 5 }, 裁决度: 0.9, 认知度: 0.3 }
  const 它2 = { 点数: { E: -5, S: -5, P: -5 }, 裁决度: 0.9, 认知度: 1.2 }
  assert.equal(合成(我2, 它2).采用, '它')
})

test('判分口径：主曲线与合成不再「超阈一律取分身」', () => {
  const d = readFileSync(new URL('../lib/dual.js', import.meta.url), 'utf8')
  const 主 = d.slice(d.indexOf('export function 主曲线'))
  assert.ok(主.includes('四支(认我, 认它)'))
  const 合 = d.slice(d.indexOf('export function 合成'), d.indexOf('export function 比曲线'))
  assert.ok(合.includes('四支(认我, 认它)'))
})

test('判分口径：第三档（>1）只有全信可达', () => {
  assert.ok(认知度(1, 1, 1) > 1, 'K/q1/q2 全高 → >1')
  assert.ok(Math.abs(认知度(0.95, 0.9, 0.9) - 1.5) < 1e-9, '刚好三条件 → 1.5')
  assert.ok(认知度(0.9, 0.9, 0.9) <= 1, '不满足就 ≤1')
  assert.ok(认知度(0.9, 1, 1) <= 1)
  assert.ok(认知度(1, 0.8, 1) <= 1)
})
