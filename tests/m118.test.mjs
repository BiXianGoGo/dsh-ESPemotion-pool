import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const W = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')
const L = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')

test('列表页：结整块下掉，只留事件，且没有 ep-spikes 容器', () => {
  assert.equal(W.includes('data-fold="结"'), false)
  assert.equal(W.includes('class="ep-spikes ep-list"'), false)
  assert.ok(W.includes('data-fold="事件"'))
  assert.ok(W.includes('id="事件会话"'))
})

test('列表页：会话签 + 每条事件的段号/为谁', () => {
  assert.ok(W.includes('function 画会话签()'))
  assert.ok(W.includes('data-sess="'))
  assert.ok(W.includes("if (kind === '事件' && 列表会话) 址 += '&sid='"))
  assert.ok(W.includes('class="ep-seg"'))
  assert.ok(W.includes('e.为谁'))
})

test('/list：按 sid 过滤，返回 段数/为谁', () => {
  assert.ok(L.includes("const 要会话 = 地址.searchParams.get('sid') || ''"))
  assert.ok(L.includes('if (要会话 && 短会话(e.sid) !== 要会话) return false'))
  assert.ok(L.includes('段数: 轨 && 轨.分段 ? 轨.分段.length : null'))
  assert.ok(L.includes('为谁: (轨 && 轨.为谁) || null'))
})
