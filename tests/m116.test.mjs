process.env.EP_LEGACY_INJECT = '1'
// v0.2.3：卡片 P 行显示「敏感/适应」
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const 前端 = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')
test('P 轴行追加 敏感/适应 小字，取 敏感适应[爽/痛]', () => {
  assert.ok(前端.includes("k === 'P' && s.敏感适应"))
  assert.ok(前端.includes("s.敏感适应['爽']"))
  assert.ok(前端.includes('敏感 ') && 前端.includes(' / 适应 '))
  assert.ok(前端.includes('.ep-num .ep-of'))
})