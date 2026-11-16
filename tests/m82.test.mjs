import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const W = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')

test('A2c：单点组最后一段画虚线 4 3', () => {
  assert.ok(W.includes('stroke-dasharray="4 3"'))
  assert.ok(W.includes('data-dash="'))
  assert.ok(W.includes('g.单点 && 点s.length >= 2'))
})

test('A2c：悬停最后一点提示单点段', () => {
  assert.ok(W.includes('单点段（本轮思考不足两段）'))
  assert.ok(W.includes("挂悬停(sv0, Number(card0.getAttribute("))
  assert.ok(W.includes(", !!g.单点)"))
})