import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const w = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')

test('悬停：屏幕像素里找最近的折点（水平+垂直），阈 10px', () => {
  assert.ok(w.includes('function 最近点(几何, vx, vy, 比W, 比H, 阈, 隐)'))
  assert.ok(w.includes('x: 左 + i * 步, 屏x: 左 + i * 步 - 偏'))
  assert.ok(w.includes('y: 位(p[ax])'))
  assert.ok(w.includes('var 命 = 最近点(geo, vx, vy, 比W, 比H, 10, 隐线())'))
  assert.ok(w.includes('if (!命 || 像素 > 10)'))
  assert.ok(w.includes('data-i="'))
})

test('悬停：显示时间/段/为谁/整句原话，三轴读数并高亮选中线', () => {
  assert.ok(w.includes('p.原话'))
  assert.ok(w.includes("读.push(k2 === 轴选 ? '<b>'"))
  assert.ok(w.includes("ls2[q2].setAttribute('stroke-width', on ? '2' : '1.2')"))
  assert.ok(w.includes('window.__ep最近点 = 最近点'))
})
