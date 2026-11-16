import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const 前端 = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')

// 2026-11-16 18:3x（策划间第 3 项，18:4x 更正）：绿条从「基点」画到「当前值」，
// 黄点保留、固定在 位(基点)；行上 data-base 记基点，动画与渲染读同一个值。
test('v023G：组内三轴条有三层节点（黄基点/蓝段/绿填充）+ 行上 data-base', () => {
  assert.ok(前端.includes('data-base="'))
  assert.ok(前端.includes('class="ep-gzero"'))
  assert.ok(前端.includes('class="ep-blu"'))
  assert.ok(前端.includes('class="ep-green ep-gcard-fill'))
  assert.ok(前端.includes('.ep-gzero{position:absolute'))
  assert.ok(前端.includes('.ep-blu{position:absolute'))
})

test('v023G：黄点子位在基点，绿条从基点长到值并走动画', () => {
  assert.ok(前端.includes('组前点[gi] = 点s.length >= 2'))
  assert.ok(前端.includes("zd.style.left = (50 + (Number(row.getAttribute('data-base')) || 0) * 50) + '%'"))
  assert.ok(前端.includes("var b = Number(row.getAttribute('data-base')) || 0"))
  assert.ok(前端.includes('走动画(kk2, row, 从v, 到v)'))
  assert.ok(前端.includes('window.__g动画 = (window.__g动画 || 0) + 1'))
  assert.ok(前端.includes('.ep-gcard-row[data-k=') || 前端.includes('data-k="'))
})
