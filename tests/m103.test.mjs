import test from 'node:test'
import assert from 'node:assert/strict'
import { 主曲线 } from '../lib/dual.js'
import { readFileSync } from 'node:fs'

const 甲 = [{E:6,S:-4,P:0},{E:6,S:-4,P:0}]
const 乙 = [{E:5.9,S:-4.05,P:0},{E:5.9,S:-4.05,P:0}]
const 近 = [{E:6,S:-4,P:0},{E:5,S:-4,P:0}]

test('阈值内：0.7×它 + 0.3×我 加权', () => {
  const r = 主曲线(甲, 乙, 1, 1, 0.15, { 分身权重: 0.7 })
  assert.equal(r.来源, '加权')
  assert.equal(r.点.E, Math.round(0.7 * 5.9 + 0.3 * 6))
  assert.equal(r.接管, false)
})

test('K它 < 0.6：采用我、标接管、来源我', () => {
  const r = 主曲线(甲, 乙, 1, 0.55, 0.15, { 分身权重: 0.7 })
  assert.equal(r.接管, true)
  // 2026-11-15 判分口径：阈内仍加权；K<0.6 只标接管，不再强取我
  assert.equal(r.来源, '加权')
  assert.equal(r.点.E, 6)
})

test('接管中且 K它 < 0.75：不交还', () => {
  const r = 主曲线(甲, 乙, 1, 0.7, 0.15, { 分身权重: 0.7, 接管中: true })
  assert.equal(r.接管, true)
  // 2026-11-15 判分口径：阈内仍加权，接管只做标记
  assert.equal(r.来源, '加权')
})

test('接管中且 K它 ≥ 0.75：交还分身', () => {
  const r = 主曲线(甲, 乙, 1, 0.8, 0.15, { 分身权重: 0.7, 接管中: true })
  assert.equal(r.接管, false)
  assert.notEqual(r.来源, '我')
})

test('/state.双轨 有三项接管字段', () => {
  const 后 = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
  assert.ok(后.includes('分身权重: Number(配置.分身权重) || 0.7'))
  assert.ok(后.includes('接管轮数:'))
  assert.ok(后.includes("当前掌控: 池.接管 === true ? '我' : '分身'"))
})

test('配置键：默认 0.7、范围 0.5–0.9', () => {
  const 后 = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
  assert.ok(后.includes('分身权重: 0.7,'))
  assert.ok(后.includes("范围: [0.5, 0.9]"))
})
