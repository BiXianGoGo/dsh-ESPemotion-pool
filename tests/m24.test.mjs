// 2026-11-09 03:45：挂饰位置夹取（贴顶/贴左/贴右都不出可视区）、拖动条只认头部
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const 根 = join(dirname(fileURLToPath(import.meta.url)), '..')
const 源码 = readFileSync(join(根, 'assets', 'widget.js'), 'utf8')

function 取夹位置() {
  const 起 = 源码.indexOf('function 夹位置(')
  assert.ok(起 >= 0, '找不到 夹位置')
  let 深 = 0
  let 止 = 起
  for (let i = 源码.indexOf('{', 起); i < 源码.length; i++) {
    if (源码[i] === '{') 深++
    else if (源码[i] === '}') { 深--; if (深 === 0) { 止 = i + 1; break } }
  }
  const 源 = 源码.slice(起, 止)
  return new Function(源 + '\nreturn 夹位置')()
}

test('贴顶：y=0 也留在可视区（top ≥ 6）', () => {
  const 夹 = 取夹位置()
  const 位 = 夹(100, 0, 1200, 800, 200, 40)
  assert.equal(位.top, 6)
  assert.equal(位.left, 100)
})

test('贴左/贴右：不越界', () => {
  const 夹 = 取夹位置()
  const 左 = 夹(-80, 200, 1200, 800, 200, 40)
  assert.equal(左.left, 6)
  const 右 = 夹(1300, 200, 1200, 800, 200, 40)
  assert.equal(右.left, 1200 - 200 - 6)
})

test('贴底：不越界；小窗口也不会出现负数', () => {
  const 夹 = 取夹位置()
  const 底 = 夹(100, 9999, 1200, 800, 200, 40)
  assert.equal(底.top, 800 - 40 - 6)
  const 小 = 夹(0, 0, 100, 20, 200, 40)
  assert.ok(小.left >= 6 && 小.top >= 6)
})

test('拖动只从头部开始，窗口 resize 会重新夹', () => {
  assert.ok(/closest\('\.ep-head'\)/.test(源码), '拖动应只认 .ep-head')
  assert.ok(/addEventListener\('resize'/.test(源码), '应有 resize 重新夹')
  assert.ok(/data-pos/.test(源码), '应记录夹后位置')
  assert.ok(/cursor:move/.test(源码), '头部应有拖动光标')
})