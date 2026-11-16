import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const 前端 = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')

test('v023E2：有数据也画 5 条网格（不只是空态）', () => {
  assert.ok(前端.includes("var 网2 = ''"))
  assert.ok(前端.includes("var 档们 = [高, 高 / 2, 0, 低 / 2, 低]"))
  assert.ok(前端.includes("var 零线 = Math.abs(去重[g3]) < 0.005"))
})
test('v023E2：刻度文字用不缩放的 overlay div', () => {
  assert.ok(前端.includes('class="ep-gwrap"'))
  assert.ok(前端.includes('class="ep-gticks"'))
  assert.ok(前端.includes('>+1.0</span><span>+0.5</span><span>0</span><span>−0.5</span><span>−1.0</span>'))
})
