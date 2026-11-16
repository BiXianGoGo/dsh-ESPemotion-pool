import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const 前端 = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')

test('v026-2：条动画从上次显示值起跑，没有旧值直接置位', () => {
  assert.ok(前端.includes('上次条显 = {}'))
  assert.ok(前端.includes('var 从v = 旧组[kk2] != null ? 旧组[kk2] : 到v'))
  assert.ok(前端.includes('旧组[kk2] == null || Math.abs(到v - 从v) < 0.001'))
  assert.ok(前端.includes('上次条显[选] = 旧组; 旧组[kk2] = 到v'))
})

test('v0.26：悬停按 x 反算最近点（全图可命中）', () => {
  assert.ok(前端.includes('function 最近点(几何, vx, vy, 比W, 比H, 阈, 隐)'))
  assert.ok(前端.includes("sv.addEventListener('mousemove'"))
})

test('v0.26：白点坐标与线一致（x 从 34 起，y 用 lo/hi）', () => {
  assert.ok(前端.includes("c.setAttribute('cx', String(命.x))"))
  assert.ok(前端.includes("c.setAttribute('cy', String(命.y))"))
})
