import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const w = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')

test('滚轮 handler 只剩三件事：算偏移、写 transform、写变量', () => {
  const i = w.indexOf("卡.addEventListener('wheel'")
  const j = w.indexOf('}, { passive: false })', i)
  const h = w.slice(i, j)
  assert.ok(h.includes("translate(' + (-偏)"))
  assert.ok(!h.includes('getBoundingClientRect'))
  assert.ok(!h.includes('querySelector'))
  assert.ok(!h.includes('innerHTML'))
  assert.ok(!h.includes('.style.'))
})

test('合成层 + 真机埋点 + 三处动画', () => {
  assert.ok(w.includes('.ep-pan{will-change:transform}'))
  assert.ok(w.includes("kind: 'wheel'"))
  assert.ok(w.includes('发轮性能(window.__epWheelMs.slice(-10))'))
  assert.ok(w.includes("'.ep-green,.ep-blu{transition:width .3s ease,left .3s ease}'"))
  assert.ok(w.includes('滑(pad, 旧偏0, 偏, 300)'))
  assert.ok(w.includes('epFade .15s'))
})
