import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const 前端 = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')

test('基础偏移：每行右侧数值下加「基 ±x.xx」小灰字（|基|<0.005 不显示）', () => {
  assert.ok(前端.includes('class="ep-base"'))
  assert.match(前端, /ep-base">基 /)
  assert.match(前端, /基值 >= 0 \? '\+' : '−'/)
  assert.ok(前端.includes('Math.abs(基值) >= 0.005'))
  assert.ok(前端.includes('data-base="'))
  assert.ok(前端.includes('g.零点 && g.零点[k]'))
  assert.ok(前端.includes('.ep-base{font-size:9.5px'))
})

test('基础偏移：不新增列、不加边框（只用 vwrap 两行）', () => {
  assert.ok(前端.includes('ep-gcard-vwrap'))
  assert.ok(!前端.includes('ep-base{.*border'))
  assert.ok(前端.includes('.ep-gcard-vwrap{flex:none;min-width:92px;display:flex;flex-direction:column;align-items:flex-end'))
})
