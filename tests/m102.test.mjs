import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const 前 = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')

test('模板行有展开指示，点开后变收起', () => {
  assert.ok(前.includes('class="ep-tplar"'))
  assert.ok(前.includes('▸ 展开'))
  assert.ok(前.includes('▾ 收起'))
})

test('迷你曲线三轴可分辨：E 实线、S 虚线、P 点线', () => {
  assert.ok(前.includes("var 线型 = ['', '4 2', '1 2']"))
  assert.ok(前.includes('stroke-dasharray="'))
  assert.ok(前.includes('线型[a]'))
})