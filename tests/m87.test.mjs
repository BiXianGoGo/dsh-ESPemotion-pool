import test from 'node:test'
import assert from 'node:assert/strict'
import * as v from '../lib/v06.js'

test('记六头：未知头忽略', () => {
  const 池 = {}
  v.记六头(池, 'X', 0.1)
  assert.deepEqual(池.六头, {})
})

test('应用零点：更新上次z 且按 0.01 步进', () => {
  const 池 = { 零点: { E: 0 }, 六头: { 'E+': { 累计: 1, 桶: [], 上次z: null } } }
  v.应用零点(池, { E: { 头: 'E+', 方向: 1 } }, Date.now())
  assert.equal(池.零点.E, 0.01)
  assert.ok(String(池.六头['E+'].上次z).startsWith('20'))
})
