import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const 前端 = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')

test('v024：图例 E/S/P 可点并写 localStorage 组线', () => {
  assert.ok(前端.includes('ep-glegend'))
  assert.ok(前端.includes("localStorage.setItem('组线'"))
  assert.ok(前端.includes('data-gl='))
})
test('v0.26：悬停按 x 反算最近点，全图可命中', () => {
  assert.ok(前端.includes('ep-gtip'))
  assert.ok(前端.includes('function 最近点(几何, vx, vy, 比W, 比H, 阈, 隐)'))
  assert.ok(前端.includes('ep-hdot'))
})
test('v024：底部说明行 轮/段/秒/三色', () => {
  assert.ok(前端.includes('ep-gcap'))
  assert.ok(前端.includes('E蓝 / S青 / P琥珀'))
})
test('v024：隐藏的线不画，图例保持三枚', () => {
  assert.ok(前端.includes("if (隐.indexOf(kk) >= 0) continue"))
  assert.ok(前端.includes('轴们.length; li0++'))
})
