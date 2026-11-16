// v0.8 B 验收：三页、两个列表各自折叠、作废/已归并无入口、第 2 页显示 q 缺省与缺q轮数
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const 此 = dirname(fileURLToPath(import.meta.url))
const 挂饰 = readFileSync(join(此, '..', 'assets', 'widget.js'), 'utf8')

test('顶部仍是两行：第一行名字，第二行三轴 + 刷新', () => {
  assert.match(挂饰, /class="ep-row1"><span class="ep-name">/)
  assert.match(挂饰, /class="ep-row2"><span class="ep-axes">/)
})

test('三个页面：三轴 / 本轮观测 / 事件', () => {
  assert.match(挂饰, /data-page="0"/)
  assert.match(挂饰, /data-page="1"/)
  assert.match(挂饰, /data-page="2"/)
  assert.match(挂饰, /function 换页\(n(?:, 手)?\)/)
  assert.match(挂饰, /本轮观测/)
})

test('两个列表各有一个折叠按钮，各管各的', () => {
  // 2026-11-15 22:5x：列表页整块下掉「结」，只剩事件折叠
  assert.equal(挂饰.includes('data-fold="结"'), false)
  assert.match(挂饰, /data-fold="事件"/)
  assert.match(挂饰, /data-fold="事件"/)
  assert.match(挂饰, /function 应用折叠\(kind\)/)
  assert.doesNotMatch(挂饰, /data-all="全部"/)
  assert.doesNotMatch(挂饰, /data-toggle/)
})

test('作废 / 已归并永远不给入口', () => {
  assert.doesNotMatch(挂饰, /显示作废/)
  assert.doesNotMatch(挂饰, /显示已归并/)
  assert.doesNotMatch(挂饰, /data-flag/)
  assert.doesNotMatch(挂饰, /含作废=/)
  assert.doesNotMatch(挂饰, /含并入=/)
})

test('第 2 页显示 q 缺省与缺q轮数、分身额度', () => {
  assert.match(挂饰, /吸附系数/)
  assert.match(挂饰, /段数/)
  assert.match(挂饰, /点来源/)
  assert.match(挂饰, /认知度/)
})
