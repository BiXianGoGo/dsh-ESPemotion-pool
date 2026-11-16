import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const W = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')
const L = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')

test('刻度：上下对称取整，标签由 y 坐标反推（同一套位()）', () => {
  assert.ok(W.includes('极 = Math.ceil(极 * 10) / 10'))
  assert.ok(W.includes('return { lo: -极, hi: 极 }'))
  assert.ok(W.includes('var 反 = 高 - (yv - 4) / (H - 8) * (高 - 低)'))
  assert.ok(W.includes("刻值(反)"))
  assert.ok(W.includes("top:' + (yv / H * 100)"))
})

test('滚轮：200 点宽路径，只平移 transform（2026-11-16 口径）', () => {
  assert.ok(L.includes('列.slice(-600)'))
  assert.ok(W.includes('全点.slice(-200)'))
  assert.ok(W.includes('视宽 / 30'))
  assert.ok(W.includes('曲宽'))
  assert.ok(W.includes("组.setAttribute('transform'") || W.includes("板.setAttribute('transform'"))
  assert.ok(W.includes('图.曲宽 - 图.视宽'))
  assert.ok(!W.includes('Math.min(大, 窗 + 步)'))
})

