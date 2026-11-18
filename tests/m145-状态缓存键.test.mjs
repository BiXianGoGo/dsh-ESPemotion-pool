import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { 状态键 } from '../lib/index.js'

test('m145 状态键：同 rev/装载/mtime 下不同池 → 键不同（2 秒缓存不串池）', () => {
  const 甲 = 状态键(7, '常用聊天组', ['8f689553'], 1700000000000, '常用聊天组')
  const 乙 = 状态键(7, '测试组', ['8f689553'], 1700000000000, '测试组')
  assert.notEqual(甲, 乙)
  assert.ok(甲.includes('pool:常用聊天组'))
  assert.ok(乙.includes('pool:测试组'))
})

test('m145 状态键：同一池同一 rev 稳定（缓存仍能命中）', () => {
  const a = 状态键(7, '测试组', ['8f689553'], 1700000000000, '测试组')
  const b = 状态键(7, '测试组', ['8f689553'], 1700000000000, '测试组')
  assert.equal(a, b)
})

test('m145 状态键：默认池与 ?pool=默认池 也不共用（询池参与键）', () => {
  const 默认 = 状态键(3, '常用聊天组', [], 1, '')
  const 显式 = 状态键(3, '常用聊天组', [], 1, '常用聊天组')
  assert.notEqual(默认, 显式)
})

test('m145 接线：/state 处理器使用 状态键()，且导出在模块顶层', () => {
  const 源 = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
  assert.ok(源.includes('const 键 = 状态键(池.rev, 当前池名, 装载名单(配置), 配m, 询池)'))
  assert.match(源, /export function 状态键\(rev, 当前池名, 装载, 配置mtime, 询池\)/)
  assert.ok(!源.includes("const 键 = String(池.rev || 0) + '|' + 当前池名"))
})
