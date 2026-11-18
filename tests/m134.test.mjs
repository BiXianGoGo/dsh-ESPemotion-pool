import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { 说明书全文, 取说明书节 } from '../lib/index.js'

function 假池() {
  return { rev: 1, events: [], axes: { E: 0.1, S: 0, P: 0 }, spine: {}, 上轮波动: { sid: null } }
}

test('说明书取节：sec 0..10 都取得到，11 取不到', () => {
  const 文 = 说明书全文(假池(), {})
  for (let n = 0; n <= 10; n++) {
    const 节 = 取说明书节(文, n)
    assert.ok(节, '第 ' + n + ' 节取不到')
    assert.ok(节.startsWith('## ' + n + '.'), '第 ' + n + ' 节开头不对：' + String(节).slice(0, 30))
  }
  assert.equal(取说明书节(文, 11), null)
  assert.equal(取说明书节(文, -1), null)
  assert.equal(取说明书节(文, 1.5), null)
  assert.equal(取说明书节('', 0), null)
})

test('说明书路由用统一的取节函数，且 404 走 JSON', () => {
  const src = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
  assert.ok(src.includes('取说明书节(文, n)'))
  assert.ok(src.includes("return 回(404, { ok: false, error: '没有第 ' + sec + ' 节' })"))
})
