import test from 'node:test'
import assert from 'node:assert/strict'
import * as v from '../lib/v06.js'

const 天 = 24 * 3600 * 1000
const 现在 = Date.now()

test('记六头：同一天累加，累计与桶同步', () => {
  const 池 = {}
  v.记六头(池, 'E', 0.1, 现在)
  v.记六头(池, 'E', 0.1, 现在 + 1000)
  const h = 池.六头['E+']
  assert.equal(h.累计, 2)
  assert.equal(h.桶.length, 1)
  assert.equal(h.桶[0].n, 2)
  assert.equal(h.桶[0].d, v.日键(现在))
})

test('记六头：跨天分成两个日桶', () => {
  const 池 = {}
  v.记六头(池, 'S', 0.1, 现在)
  v.记六头(池, 'S', 0.1, 现在 + 天)
  const h = 池.六头['S+']
  assert.equal(h.累计, 2)
  assert.equal(h.桶.length, 2)
})

test('记六头：超过 90 天的日桶被裁掉', () => {
  const 池 = { 六头: { 'P+': { 累计: 9, 桶: [{ d: v.日键(现在 - 91 * 天), n: 9 }], 上次z: null } } }
  v.记六头(池, 'P', 0.1, 现在)
  const h = 池.六头['P+']
  assert.equal(h.桶.length, 1)
  assert.equal(h.桶[0].n, 1)
  assert.equal(h.累计, 10)
})

test('六头计：近7天与累计分开，μ 用近7天均值', () => {
  const 池 = { 六头: {
    'E+': { 累计: 7, 桶: [{ d: v.日键(现在), n: 2 }, { d: v.日键(现在 - 8 * 天), n: 5 }] },
    'E-': { 累计: 0, 桶: [] },
  } }
  const o = v.六头计(池, 现在)
  assert.equal(o.计['E+'], 2)
  assert.equal(o.累计['E+'], 7)
  assert.ok(Math.abs(o.μ - 2 / 6) < 1e-9)
})

test('判零点：同向占比 < 0.6 不触发', () => {
  const 池 = { 零点: { E: 0 }, 六头: {
    'E+': { 累计: 6, 桶: [{ d: v.日键(现在), n: 4 }] },
    'E-': { 累计: 0, 桶: [{ d: v.日键(现在), n: 4 }] },
  } }
  const 出 = v.判零点(池, { 单次偏移: 0.01, 冷却: 0, 阈值倍数: 1.5, 封顶: 0.2 }, { E: 0.2 }, 'E', 现在)
  assert.equal(出.E, undefined)
})

test('判零点：近7天达 max(3,1.5μ) 且占比 ≥ 0.6 才触发', () => {
  const 池 = { 零点: { E: 0 }, 六头: {
    'E+': { 累计: 5, 桶: [{ d: v.日键(现在), n: 5 }] },
    'E-': { 累计: 0, 桶: [{ d: v.日键(现在), n: 1 }] },
  } }
  const 出 = v.判零点(池, { 单次偏移: 0.01, 冷却: 0, 阈值倍数: 1.5, 封顶: 0.2 }, { E: 0.2 }, 'E', 现在)
  assert.equal(出.E.头, 'E+')
})
