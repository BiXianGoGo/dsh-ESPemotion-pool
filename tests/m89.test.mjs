import test from 'node:test'
import assert from 'node:assert/strict'
import { 算K } from '../lib/dual.js'

const 现 = Date.parse('2026-11-14T12:00:00Z')
const 天前 = (d) => new Date(现 - d * 86400000).toISOString()
const 条 = (d, 改 = {}) => ({ t: 天前(d), 被否: false, 不可靠: false, 中点: true, ...改 })
const 选项 = { 窗口天: 7, 半衰天: 3, 上限: 40 }

test('A 样例一：3 天前错 1（w0.5）+ 今天对 3（各 1.0）→ 有效样本 3.5、K 0.9143', () => {
  const r = 算K([条(3, { 被否: true, 中点: false }), 条(0), 条(0), 条(0)], 选项, 现)
  assert.equal(r.有效样本, 3.5)
  assert.ok(Math.abs(r.被否率 - 0.5 / 3.5) < 1e-9)
  assert.equal(r.K, 0.9143)
})

test('A 样例二：今天 6 条正确 + 8 天前错 1 → 窗口外、被否率 0、K 1.0', () => {
  const 表 = [条(8, { 被否: true, 中点: false })]
  for (let i = 0; i < 6; i++) 表.push(条(0))
  const r = 算K(表, 选项, 现)
  assert.equal(r.被否率, 0)
  assert.equal(r.样本, 6)
  assert.equal(r.K, 1.0)
})

test('冷启动：Σw = 2.9 → K 1.0（门槛 3）', () => {
  const 周 = (0.456).toFixed(6) * 1
  const r = 算K([条(0), 条(0), 条(Number(周))], 选项, 现)
  assert.ok(r.有效样本 < 3 && r.有效样本 > 2.8, String(r.有效样本))
  assert.equal(r.K, 1.0)
})

test('边界：Σw = 3.0 走公式，不再冷启动', () => {
  const r = 算K([条(0), 条(0), 条(0)], 选项, 现)
  assert.equal(r.有效样本, 3)
  assert.equal(r.K, 1.0)
})

test('边界：Σw = 3.0 且有 1 条被否 → K = 1-0.6×(1/3)', () => {
  const r = 算K([条(0, { 被否: true, 中点: false }), 条(0), 条(0)], 选项, 现)
  assert.equal(r.有效样本, 3)
  assert.equal(r.K, 0.8)
})

test('Σw = 2 仍冷启动 → K 1.0', () => {
  const r = 算K([条(0, { 被否: true, 中点: false }), 条(0, { 被否: true, 中点: false })], 选项, 现)
  assert.equal(r.有效样本, 2)
  assert.equal(r.K, 1.0)
})

test('最多 40 条：45 条今天的记录只取最近 40 条', () => {
  const 表 = []
  for (let i = 0; i < 45; i++) 表.push(条(0))
  const r = 算K(表, 选项, 现)
  assert.equal(r.样本, 40)
  assert.equal(r.有效样本, 40)
})

test('不可靠率也加权：3 天前不可靠 1（0.5）+ 今天对 3 → K 0.9571', () => {
  const r = 算K([条(3, { 不可靠: true, 中点: false }), 条(0), 条(0), 条(0)], 选项, 现)
  assert.ok(Math.abs(r.不可靠率 - 0.5 / 3.5) < 1e-9)
  assert.equal(r.K, 0.9571)
})

test('中点一致率按权重算', () => {
  const r = 算K([条(3, { 中点: true }), 条(0, { 中点: false }), 条(0, { 中点: false }), 条(0, { 中点: true })], 选项, 现)
  assert.ok(Math.abs(r.中点一致率 - 1.5 / 3.5) < 1e-9)
})

test('没有 t 的条目被丢弃，不参与权重', () => {
  const r = 算K([{ 被否: true }, 条(0), 条(0)], 选项, 现)
  assert.equal(r.样本, 2)
  assert.equal(r.被否, 0)
})

test('空表 → K 1.0、样本 0、有效样本 0', () => {
  const r = 算K([], 选项, 现)
  assert.equal(r.K, 1.0)
  assert.equal(r.样本, 0)
  assert.equal(r.有效样本, 0)
})

test('半衰 3 天：6 天前错 1（w0.25）+ 今天对 5 → 被否率 0.25/5.25、K 0.9714', () => {
  const 表 = [条(6, { 被否: true, 中点: false })]
  for (let i = 0; i < 5; i++) 表.push(条(0))
  const r = 算K(表, 选项, 现)
  assert.equal(r.有效样本, 5.25)
  assert.equal(r.K, 0.9714)
})

test('下限 0.5：今天 8 条全被否 → K 0.5', () => {
  const 表 = []
  for (let i = 0; i < 8; i++) 表.push(条(0, { 被否: true, 中点: false }))
  assert.equal(算K(表, 选项, 现).K, 0.5)
})

test('窗口天可调：1 天窗口把 3 天前的记录排除', () => {
  const r = 算K([条(3, { 被否: true, 中点: false }), 条(0), 条(0)], { ...选项, 窗口天: 1 }, 现)
  assert.equal(r.样本, 2)
  assert.equal(r.被否, 0)
})

test('上限可调：上限 2 只取最近 2 条', () => {
  const r = 算K([条(0, { 被否: true }), 条(0), 条(2)], { ...选项, 上限: 2 }, 现)
  assert.equal(r.样本, 2)
})
