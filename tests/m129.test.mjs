import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const w = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')

test('画图把几何存到 svg.__geo，悬停只读它', () => {
  assert.ok(w.includes('svgEl.__geo = geo0'))
  assert.ok(w.includes('组图[选].geo = geo0'))
  const i = w.indexOf('function 挂悬停')
  const j = w.indexOf('\n  function 画组', i + 10)
  const h = w.slice(i, j)
  assert.ok(h.includes('sv.__geo') || h.includes('几何()'))
  assert.ok(h.includes('function 取几何()'))
  assert.ok(!h.includes('偏0'))
  assert.ok(!h.includes('/ 30'))
  assert.ok(!h.includes('* 6'))
})

test('最近点随 __geo.偏移 改变（换掉 geo 就换点）', () => {
  assert.ok(w.includes('x: 左 + i * 步, 屏x: 左 + i * 步 - 偏'))
  assert.ok(w.includes('var geo = 取几何()'))
})
