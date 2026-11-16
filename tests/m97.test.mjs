import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { 比曲线 } from '../lib/dual.js'

const 我 = [{ E: 1, S: 1, P: 1 }, { E: 5, S: 5, P: 5 }]
const 它 = [{ E: 0, S: 0, P: 0 }, { E: 0, S: 0, P: 0 }]

test('采用固定分身：K我 更高也采用它', () => {
  const r = 比曲线(我, 它, 0.15, 1, 0.6)
  assert.equal(r.采用, '它')
  assert.equal(r.点.E, 0)
})

test('采用固定分身：K它 低只标不可靠，仍采用它', () => {
  const r = 比曲线(我, 它, 0.15, 1, 0.3)
  assert.equal(r.采用, '它')
  assert.equal(r.不可靠, true)
})

test('阈值内仍取中点', () => {
  const r = 比曲线([{ E: 0.1, S: 0, P: 0 }], [{ E: 0.2, S: 0, P: 0 }], 0.15, 1, 1)
  assert.equal(r.采用, '中点')
  assert.equal(r.点.E, 0)
})

test('原因文案改为曲线取分身', () => {
  const 源 = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
  assert.ok(源.includes("'曲线取分身'"))
  assert.equal(源.includes("'曲线取高 K'"), false)
})
