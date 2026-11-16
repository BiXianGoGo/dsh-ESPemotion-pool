import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { 校验设置 } from '../lib/index.js'

const 前端 = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')

test('第一页最近 200 点宽路径，滚轮只平移不缩放', () => {
  assert.ok(前端.includes('全点.slice(-200)'))
  assert.ok(前端.includes('e.deltaY > 0 ? 3 : -3'))
  assert.ok(前端.includes('视宽 / 30'))
})

test('会话名配置：默认两个映射、对象校验、设置页可改', () => {
  const r = 校验设置('会话名', { 'bbbbbbbb': '聊天间', 'cccccccc': '测试组' })
  assert.equal(r.值['bbbbbbbb'], '聊天间')
  assert.ok(校验设置('会话名', { bad: 'x' }).错误)
  assert.ok(前端.includes("window.__epNames"))
  assert.ok(前端.includes('data-jsave'))
})

test('事件页页签与会话名映射', () => {
  assert.ok(前端.includes('转义(观名(x.值 || x.名 || \'\'))'))
})

test('观测页折叠：原生 details/summary，默认第一组开', () => {
  assert.ok(前端.includes('<details class="ep-ogroup"'))
  assert.ok(前端.includes('<summary class="ep-oh ep-obs-head" data-og="'))
  assert.ok(前端.includes('判定: true'))
  assert.ok(前端.includes('ep-obs-fold-cleared'))
})

test('数据源：选会话下拉（datalist/可清空）+ 组名标签', () => {
  assert.ok(前端.includes('data-psel='))
  assert.ok(前端.includes('class="ep-psel" multiple'))
  assert.ok(前端.includes('池名（可改）'))
  assert.ok(前端.includes('data-pnew="1"'))
  assert.ok(前端.includes('有会话名'))
})

