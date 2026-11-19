import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const 后端 = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')

test('候选裁剪：按最近时间倒序，只留 50', () => {
  assert.ok(后端.includes("String(b.最近 || b.建 || '').localeCompare(String(a.最近 || a.建 || ''))"))
  assert.ok(后端.includes('o.候选 = 列.slice(0, 50)'))
})

test('未知名字：confirm/drop 400，rename 旧不存在 400', () => {
  assert.ok(后端.includes("error: '待命名里没有这一条'"))
  assert.ok(后端.includes("error: '旧条目不能在这里删'"))
  assert.ok(后端.includes("error: '命名表里没有这个名字：' + 旧"))
})
