// m149：0.2.7 收尾——种子冷启动 / R² 只吃 n>=4 / 混合公式
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { 算门槛, 校准, 读种子, 种子轮数, 种子文件名 } from '../lib/calib.js'

const 真种子 = 'E:/whale-home/memory'

function 造曲线(v) {
  return { 曲线: { E: v, S: v, P: v } }
}

test('S1 算门槛：R²/斜率只吃 n>=4（2 点直线不再把趋势门顶满）', () => {
  const 行 = []
  // 300 条 2 点直线：R² 恒 1
  for (let i = 0; i < 300; i++) 行.push(造曲线([0, 1]))
  // 300 条 4 点锯齿：R² 低
  for (let i = 0; i < 300; i++) 行.push(造曲线([0, 1, 0, 1]))
  const 门 = 算门槛(行)
  assert.equal(门.先验, false)
  assert.ok(门.趋势 < 0.99, '趋势门应只由 n>=4 的曲线决定，实际 ' + 门.趋势)
  assert.equal(门.r2样本, undefined)
  // 基线/跳变仍全取：单步中位全是 1、跳变全是 1
  assert.equal(门.基线, 1)
  assert.equal(门.跳变, 1)
})

test('S2 读种子：真文件 500 条、只有 id/轴、值在 [-1,1]', (t) => {
  const p = 真种子 + '/' + 种子文件名
  if (!existsSync(p)) return t.skip('没有种子文件')
  const 原 = JSON.parse(readFileSync(p, 'utf8'))
  assert.equal(原.n0, 种子轮数)
  assert.equal(原.曲线.length, 500)
  for (const c of 原.曲线.slice(0, 50)) {
    assert.deepEqual(Object.keys(c).sort(), ['id', '轴'])
    for (const k of ['E', 'S', 'P']) {
      assert.ok(Array.isArray(c.轴[k]) && c.轴[k].length >= 2)
      for (const v of c.轴[k]) assert.ok(v >= -1 && v <= 1)
    }
  }
  const 文 = JSON.stringify(原)
  for (const 词 of ['sid', '原话', '依据', '名字', 'whale-home']) assert.equal(文.includes(词), false, '种子不应含 ' + 词)
  const 种 = 读种子(真种子)
  assert.equal(种.曲线.length, 500)
  assert.equal(种.n0, 500)
})

test('S3 无本池样本时：门槛/权重/基线全来自种子；混合比 0', (t) => {
  if (!existsSync(真种子 + '/' + 种子文件名)) return t.skip('没有种子文件')
  const 种 = 读种子(真种子)
  const r = 校准([], { 种子: 种 })
  assert.equal(r.种子数, 500)
  assert.equal(r.混合比, 0)
  assert.equal(r.门槛.种子, true)
  assert.equal(r.门槛.先验, false)
  assert.equal(r.门槛.基线, 0.2)
  assert.equal(r.门槛.趋势, 0.4066)
  assert.equal(r.门槛.跳变, 0.6)
  assert.equal(r.门槛.斜率门, 0.02)
  const 和 = r.权重.角 + r.权重.数 + r.权重.距
  assert.ok(Math.abs(和 - 1) < 0.005, '权重应归一，实际和 ' + 和)
  assert.ok(r.相似度基线 > 0 && r.相似度基线 < 1)
})

test('S4 混合公式：n=500 时 混合比 0.5，值落在两者之间', (t) => {
  if (!existsSync(真种子 + '/' + 种子文件名)) return t.skip('没有种子文件')
  const 种 = 读种子(真种子)
  const 行 = []
  for (let i = 0; i < 500; i++) 行.push(造曲线([0, 1, 0, 1]))
  const 自带 = 校准(行)
  const 混合 = 校准(行, { 种子: 种 })
  assert.equal(混合.混合比, 0.5)
  const 中 = (a, b) => Math.min(a, b) <= (a + b) / 2 + 1e-9 && (a + b) / 2 <= Math.max(a, b) + 1e-9
  assert.ok(中(自带.门槛.趋势, 混合.门槛.趋势) && 混合.门槛.趋势 !== 自带.门槛.趋势, '趋势应被种子拉向中间')
  // 本池无种子且样本不足 → 先验兜底（种子缺失时的老路径还在）
  const 少 = 校准(行.slice(0, 5))
  assert.equal(少.门槛.先验, true)
})

test('S5 种子缺失：读种子返回 null，校准回落先验', () => {
  assert.equal(读种子('C:/__no_such_home__'), null)
  const r = 校准([造曲线([0, 1, 0, 1])], { 种子: null })
  assert.equal(r.门槛.先验, true)
  assert.equal(r.种子数, 0)
  assert.equal(r.混合比, 1)
})
