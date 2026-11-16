// C 量纲归一（2026-11-16 策划间拍板）：
// 分身曲线 −9~+9 点 → ÷9 归一到 −1~+1，原始整数另存；比较/合成全吃归一值。
// 单轮轨（分身判 ±9、合成、轨Δ）保持不动；对齐率/反向两个阈按 ÷9 等比换算。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const 双 = new URL('../lib/dual.js', import.meta.url).href
const 源 = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')

test('C1 解析曲线JSON：±9 → ±1 归一，原始点数保留', async () => {
  const { 解析曲线JSON } = await import('../lib/index.js')
  const r = 解析曲线JSON('{"点":[{"E":9,"S":-9,"P":0,"依据":"很激动"},{"E":3,"S":0,"P":-3,"依据":"平静"}]}')
  assert.equal(r.length, 2)
  assert.deepEqual({ E: r[0].E, S: r[0].S, P: r[0].P }, { E: 1, S: -1, P: 0 })
  assert.equal(r[1].E, Number((3 / 9).toFixed(4)))
  assert.equal(r[1].P, Number((-3 / 9).toFixed(4)))
  assert.deepEqual(r[0].原始点数, { E: 9, S: -9, P: 0 })
  assert.deepEqual(r[1].原始点数, { E: 3, S: 0, P: -3 })
  assert.equal(r[0].依据, '很激动')
})

test('C2 偏移用归一值算：自报 ±0.2 遇上分身 9 点，偏移 0.8 而不是 7.2', async () => {
  const { 主曲线 } = await import(双)
  const 段点 = [{ E: 0.2, S: 0.2, P: 0.2 }, { E: 0.2, S: 0.2, P: 0.2 }]
  const 分身归一 = [{ E: 1, S: 1, P: 1 }, { E: 1, S: 1, P: 1 }]
  const 主 = 主曲线(段点, 分身归一, 1, 1, 0.15, {})
  assert.equal(主.偏移, 0.8)
  assert.equal(主.采用, '它')
  assert.equal(主.来源, '分身')
})

test('C3 对齐率与反向阈按 ÷9 换算（0.1111 / 0.0556），不再用点制 1 / 0.5', async () => {
  const { 比曲线, 主曲线, 归一相邻差阈, 归一反向阈 } = await import(双)
  assert.equal(归一相邻差阈, 1 / 9)
  assert.equal(归一反向阈, 0.5 / 9)
  // 相邻差 0.2（=1.8 点）应算「变了」，0.05（=0.45 点）不算。
  const A = [{ E: 0, S: 0, P: 0 }, { E: 1, S: 0, P: 0 }]
  const B = [{ E: 0, S: 0, P: 0 }, { E: 0.2, S: 0, P: 0 }]
  const 曲 = 比曲线(A, B, 0.15, 1, 1)
  assert.equal(曲.对齐率, 1)
  // 反向：末点 A=+0.6、B=−0.1（异号，B 幅 0.1 已过 0.0556）在 E、S 两轴应判反向；
  // B=−0.05（幅 0.05，低于 0.0556）不判。反向要求至少两轴（反轴.length >= 2）。
  const 反 = 主曲线([{ E: 0.6, S: 0.6, P: 0 }], [{ E: -0.1, S: -0.1, P: 0 }], 1, 1, 0.15, {})
  assert.equal(反.反向, true)
  const 不反 = 主曲线([{ E: 0.6, S: 0.6, P: 0 }], [{ E: -0.05, S: -0.05, P: 0 }], 1, 1, 0.15, {})
  assert.equal(不反.反向, false)
})

test('C4 640 复刻：归一后偏移 0.26、推轴不再吃夹断', async () => {
  const { 主曲线 } = await import(双)
  const A = [{ E: 0.4, S: 0.2, P: 0.1 }, { E: 0.2, S: 0.5, P: 0 }, { E: 0.45, S: 0.3, P: 0.1 }]
  const B = [{ E: 1, S: 3, P: 2 }, { E: -1, S: 0, P: 2 }, { E: 0, S: 2, P: 3 }].map((p) => ({ E: Number((p.E / 9).toFixed(4)), S: Number((p.S / 9).toFixed(4)), P: Number((p.P / 9).toFixed(4)) }))
  const 主 = 主曲线(A, B, 1, 1, 0.15, {})
  assert.equal(主.偏移, 0.2599)
  assert.equal(主.采用, '它')
  assert.equal(主.点[2].S, Number((2 / 9).toFixed(4)))
  assert.equal(主.点[2].P, Number((3 / 9).toFixed(4)))
})

test('C5 接线：解析曲线带原始点、主曲线带原始点、轨迹存主点原始', () => {
  assert.ok(源.includes('原始点数: 原'))
  assert.ok(源.includes('主.原始点数 = 看.点.map'))
  assert.ok(源.includes('主点原始: 主.原始点数 || null'))
  // 命名提醒记账不再 ×0.05（那条换算已改成 ÷9 同尺）。
  assert.ok(源.includes('Math.abs(均 - (Number(它点[k]) || 0) / 9)'))
  assert.ok(!源.includes('(Number(它点[k]) || 0) * 0.05'))
})
