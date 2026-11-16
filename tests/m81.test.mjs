import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as 双 from '../lib/dual.js'

const 后端 = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
const p = (t, E, S = 0, P = 0) => ({ t, E, S, P })

test('A2b：单轨标记与点回传', () => {
  const A = [p(1, 0.3), p(2, 0.5)]
  const r = 双.主曲线(A, [], 1, 1)
  assert.equal(r.单轨, true)
  assert.deepEqual(r.点, A)
})

test('A2b：完全一致 → 偏移 0、不分歧', () => {
  const A = [p(1, 0.2, 0.1, -0.1)], B = [p(1, 0.2, 0.1, -0.1)]
  const r = 双.主曲线(A, B, 1, 1, 0.15)
  assert.equal(r.偏移, 0)
  assert.equal(r.分歧, false)
})

test('A2b：只有一轴反向不算反向', () => {
  const A = [p(1, 0.8, 0.8, 0)], B = [p(1, -0.8, 0.8, 0)]
  assert.equal(双.主曲线(A, B).反向, false)
})

test('A2b：两轴反向但幅度小不算', () => {
  const A = [p(1, 0.3, 0.3, 0)], B = [p(1, -0.3, -0.3, 0)]
  assert.equal(双.主曲线(A, B).反向, false)
})

test('A2b：主点取它点', () => {
  const A = [p(1, 0.2)], B = [p(1, 0.9)]
  assert.equal(双.主曲线(A, B).点[0].E, 0.9)
})

test('A2b：偏移正好等于阈值 → 不分歧', () => {
  const A = [p(1, 0, 0, 0)], B = [p(1, 0.15, 0, 0)]
  assert.equal(双.主曲线(A, B, 1, 1, 0.15).分歧, false)
})

test('A2b：偏移保留四位小数', () => {
  const A = [p(1, 0, 0, 0)], B = [p(1, 0.12345, 0, 0)]
  const r = 双.主曲线(A, B)
  assert.equal(String(r.偏移).split('.')[1].length <= 4, true)
})

test('A2b：空数组也安全', () => {
  const r = 双.主曲线([], [], 1, 1)
  assert.equal(r.来源, '单轨')
})

test('A2b：确认问计数与日限写在后端', () => {
  assert.ok(后端.includes('池y.确认问 = 计'))
  assert.ok(后端.includes('读配置().确认问日限'))
})

test('A2b：轨迹体记主点来源与系数', () => {
  assert.ok(后端.includes('主来源'))
  assert.ok(后端.includes('系数:'))
})