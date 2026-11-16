import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const W = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')

test('刻度：负数用 U+2212、四舍五入到 -0.0 归 0', () => {
  assert.ok(W.includes('function 刻值(v)'))
  assert.ok(W.includes("Math.round(Number(v) * 10) / 10"))
  assert.ok(W.includes("if (!isFinite(r) || Math.abs(r) < 0.05) return '0'"))
  assert.ok(W.includes("(r > 0 ? '+' : '−')"))
})

test('刻度：画组与轨迹刻度的两处都用同一个 刻值()', () => {
  assert.equal(W.includes('刻值(反)'), true)
  assert.ok(W.includes('return 刻值(v)'))
  assert.ok(!W.includes("(tv > 0 ? '+' : '−') + Math.abs(tv).toFixed(1)"))
})