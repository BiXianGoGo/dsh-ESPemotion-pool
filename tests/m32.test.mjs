// v0.5.1：刷新按钮与脚本重载、注记折叠、空池显示
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const 此 = dirname(fileURLToPath(import.meta.url))
const 挂饰 = readFileSync(join(此, '..', 'assets', 'widget.js'), 'utf8')

test('B：头部有 ↻ 刷新按钮，且点击不冒泡', () => {
  assert.match(挂饰, /ep-refresh/)
  assert.match(挂饰, /↻/)
  assert.match(挂饰, /closest\('\.ep-refresh'\)/)
})

test('B：刷新会重拉脚本（no-store + ?reload=）并重建', () => {
  assert.match(挂饰, /widget\.js\?reload=/)
  assert.match(挂饰, /cache: 'no-store'/)
  assert.match(挂饰, /new Function\(t\)/)
  assert.match(挂饰, /拆\(\)/)
})

test('B：刷新前存现场，重建后恢复开合/滚动/分页', () => {
  assert.match(挂饰, /function 快照\(/)
  assert.match(挂饰, /function 恢复\(/)
  assert.match(挂饰, /window\.__epRestore/)
  assert.match(挂饰, /scrollTop = 快\./)
  assert.match(挂饰, /classList\.toggle\('open', !!快\.open\)/)
  assert.match(挂饰, /载\('结', false, 快\.结\.len/)
  assert.match(挂饰, /载\('事件', false, 快\.事件\.len/)
})

test('C：注记默认 2 行截断，展开由容器类控制', () => {
  assert.match(挂饰, /-webkit-line-clamp:2/)
  assert.match(挂饰, /\.ep-list\.ep-all \.ep-n/)
})

test('C：结与事件各有一个折叠按钮，各管各的', () => {
  // 2026-11-15 22:5x：列表页整块下掉「结」，只剩事件折叠
  assert.equal(挂饰.includes('data-fold="结"'), false)
  assert.match(挂饰, /data-fold="事件"/)
  assert.match(挂饰, /data-fold="事件"/)
  assert.match(挂饰, /function 应用折叠\(kind\)/)
  assert.match(挂饰, /kind === '结' \? 展开结 : 展开事件/)
  assert.doesNotMatch(挂饰, /data-all="全部"/)
})

test('空池显示「暂无记录」，不显示名字与 0 值', () => {
  assert.match(挂饰, /暂无记录/)
  assert.match(挂饰, /function 置空显示/)
  assert.match(挂饰, /Number\(s\.events\) > 0/)
  assert.match(挂饰, /ep-empty/)
})

test('刻度：三轴数字按归一化值两位小数显示，不再带分母', () => {
  assert.match(挂饰, /s\.刻度/)
  assert.match(挂饰, /var 显文 = \(v >= 0 \? '\+' : '−'\)/)
  assert.match(挂饰, /Math\.abs\(v\)\.toFixed\(小\)/)
  assert.equal(/\/ ' \+ 刻度/.test(挂饰), false)
})
