import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const 前端 = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')

test('滚轮：根上委托到 .ep-gwrap，只平移不缩放', () => {
  assert.ok(前端.includes("e.target.closest('.ep-gwrap')"))
  assert.ok(前端.includes('e.deltaY > 0 ? 3 : -3'))
  assert.ok(!前端.includes("sv.addEventListener('wheel'"))
})
