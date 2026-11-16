import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const w = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')

test('跟最新：默认贴右自动跟随，用偏移判断并在新数据到后回到最右', () => {
  assert.ok(w.includes('if (组跟[gi] !== false) 偏 = 最大偏'))
  assert.ok(w.includes('if (偏 >= 最大偏 - 1) 组跟[gi] = true'))
  assert.ok(w.includes('组跟[gi2] = 偏 >= 最大 - 1'))
})

test('跟最新：离开后出提示，End 或点提示回最新', () => {
  assert.ok(w.includes('已离开最新 · 按 End 回最新'))
  assert.ok(w.includes("if (e.key === 'End') { e.preventDefault(); 回最新(); return }"))
  assert.ok(w.includes('跟徽.addEventListener'))
  assert.ok(w.includes('板.setAttribute'))
})
