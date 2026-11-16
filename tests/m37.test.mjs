// v0.6 验收（R1–R4 纯函数层）：溢出抑制 / 顶格不加 / 速率衰减 / 水位 / 六头 / 冷却 / 封顶 / 最高结轴
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as V06 from '../lib/v06.js'

const 小时 = 3600000
const 天 = 86400000

function 池() {
  return { 溢出: {}, 速率: {}, 峰值桶: {}, 六头: {}, 零点: { E: 0, S: 0, P: 0 }, 结: [] }
}

test('R1：溢出抑制对照——溢出 0 / 0.5 / 1.0 / 2.0 时增量乘 1 / 0.50 / 0.25 / 0.06', () => {
  const 对照 = [0, 0.5, 1.0, 2.0].map((o) => {
    const p = 池()
    if (o > 0) V06.溢出记(p, 'E', o)
    const eff = V06.有效溢出(p, 'E', 0, 0.15)
    return Number((0.15 * Math.exp(-1.4 * eff)).toFixed(4))
  })
  assert.ok(Math.abs(对照[0] - 0.15) < 1e-4, JSON.stringify(对照))
  assert.ok(Math.abs(对照[1] - 0.075) < 0.002, JSON.stringify(对照))
  assert.ok(Math.abs(对照[2] - 0.0375) < 0.002, JSON.stringify(对照))
  assert.ok(Math.abs(对照[3] - 0.009) < 0.003, JSON.stringify(对照))
})

test('R1：顶格不加——轴 0.99 再报 0.15，轴不超过 1、溢出 > 0', () => {
  const p = 池()
  const eff = V06.有效溢出(p, 'E', 0.99, 0.15)
  const 增 = 0.15 * Math.exp(-1.4 * eff)
  const x = Math.min(1, 0.99 + 增)
  assert.ok(x <= 1 + 1e-9)
  assert.ok(增 < 0.15)
  V06.溢出记(p, 'E', 0.99 + 增 - 1)
  assert.ok(V06.溢出现值(p, 'E') > 0)
})

test('R1：溢出 12 小时半衰', () => {
  const p = 池()
  V06.溢出记(p, 'E', 0.4)
  const now = Date.now()
  const 半 = V06.溢出现值(p, 'E', now + 12 * 小时)
  const 全 = V06.溢出现值(p, 'E', now)
  assert.ok(Math.abs(半 / 全 - 0.5) < 0.02, `${半}/${全}`)
})

test('R2：速率分档 τ 选（<0.05→12、<0.15→8、<0.30→5、否则 3）', () => {
  assert.equal(V06.τ选(0.01), 12)
  assert.equal(V06.τ选(0.1), 8)
  assert.equal(V06.τ选(0.2), 5)
  assert.equal(V06.τ选(0.5), 3)
})

test('R2：向水位衰减——3/6/9 小时依次更慢（软停靠）', () => {
  const p = 池()
  V06.记峰值(p, 'E', 1)
  const { T } = V06.水位(p, 'E', 1)
  assert.ok(Math.abs(T - 0.4) < 1e-9)
  const 三 = V06.推进(1, T, 3, 3 * 小时)
  const 六 = V06.推进(1, T, 3, 6 * 小时)
  const 九 = V06.推进(1, T, 3, 9 * 小时)
  assert.ok(三 > 六 && 六 > 九 && 九 > T, `${三}/${六}/${九}`)
  // 软停靠：不会一步掉到 T
  assert.ok(九 > T + 0.02)
})

test('R2：40% 停住（长时间后落在 T，不归零）', () => {
  const p = 池()
  V06.记峰值(p, 'E', 1)
  const { T } = V06.水位(p, 'E', 1)
  let x = 1
  for (let i = 0; i < 200; i += 1) x = V06.推进(x, T, 3, 1 * 小时)
  assert.ok(Math.abs(x - T) < 0.011, `x=${x} T=${T}`)
  assert.ok(x > 0.3)
})

test('R4：六头计数与 μ', () => {
  const p = 池()
  const now = Date.now()
  for (let i = 0; i < 5; i += 1) V06.记六头(p, 'E', 0.05, now)
  const { 计, μ } = V06.六头计(p, now)
  assert.equal(计['E+'], 5)
  assert.equal(计['E-'], 0)
  assert.ok(Math.abs(μ - 5 / 6) < 1e-9)
})

test('R4：冷却——第一次偏移后 6 小时内不重复', () => {
  const p = 池()
  const now = Date.now()
  for (let i = 0; i < 6; i += 1) V06.记六头(p, 'E', -0.05, now - i * 1000)
  const 结 = { E: -0.8, S: 0, P: 0 }
  const 配置 = {
  单次偏移: 0.01, 冷却: 6, 阈值倍数: 1.5, 封顶: 0.2 }
  const 一 = V06.判零点(p, 配置, 结, 'E', now)
  assert.ok(一.E && 一.E.方向 < 0, JSON.stringify(一))
  p.六头['E-'].上次z = new Date(now).toISOString()
  p.零点.E = -0.01
  const 二 = V06.判零点(p, 配置, 结, 'E', now + 60 * 1000)
  assert.ok(!二.E, JSON.stringify(二))
})

test('R4：封顶 0.20，无结时不偏移', () => {
  const p = 池()
  const now = Date.now()
  for (let i = 0; i < 10; i += 1) V06.记六头(p, 'E', 0.05, now)
  const 配置 = { 单次偏移: 0.01, 冷却: 0, 阈值倍数: 1.5, 封顶: 0.2 }
  const 无结 = V06.判零点(p, 配置, { E: 0, S: 0, P: 0 }, null, now)
  assert.ok(!无结.E, '无结不该偏移')
  p.零点.E = 0.2
  const 满 = V06.判零点(p, 配置, { E: 1, S: 0, P: 0 }, 'E', now)
  assert.ok(!满.E, '封顶后不该继续加')
})

test('R3：最高结轴按 Σ 绝对值取，τ 只压最高轴', () => {
  const 结 = V06.结坐标({
    刺: [
      { t: new Date().toISOString(), 轴: 'E', 值: 0.25 },
      { t: new Date().toISOString(), 轴: 'E', 值: 0.2 },
      { t: new Date().toISOString(), 轴: 'S', 值: -0.1 },
      { t: new Date(Date.now() - 8 * 天).toISOString(), 轴: 'S', 值: -0.5 },
    ],
  })
  assert.ok(Math.abs(结.E - 0.45) < 1e-9, JSON.stringify(结))
  assert.ok(Math.abs(结.S + 0.1) < 1e-9, JSON.stringify(结))
  assert.equal(V06.最高结轴(结), 'E')
  assert.ok(Math.abs(V06.τ加权(12, 结, 'E', 'E') - 12 / 1.45) < 1e-9)
  assert.equal(V06.τ加权(12, 结, 'S', 'E'), 12)
})
