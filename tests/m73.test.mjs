import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const 前端 = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')
test('v0.26 悬停三行：时间·全文注 / 第 n 段 / 三值', () => {
  assert.ok(前端.includes("时钟(p.t) + (注 ? ' · ' + 注 : '')"))
  assert.ok(前端.includes(`'<div class="ep-hseg">'`))
  assert.ok(前端.includes("读.push(k2 === 轴选 ? '<b>'"))
})
test('v0.26 注释不截断、浮层最宽卡片-24、右缘左翻', () => {
  assert.ok(!前端.includes('注.length > 20'))
  assert.ok(前端.includes("d0.width - 24"))
  assert.ok(前端.includes('lx + bw > d0.width - 8'))
})
