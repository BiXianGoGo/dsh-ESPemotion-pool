import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtempSync, writeFileSync as wf } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as 模 from '../lib/index.js'

const 后 = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')

test('五个圆点都能切页：总页数按实际页数算，不写死 4', () => {
  assert.ok(后.includes("Math.max(1, 卡.querySelectorAll('.ep-page').length)"))
  assert.ok(!后.includes("? 1 : 4"))
})

test('/state 顶层回显存储模式', () => {
  assert.ok(后.includes("存储模式: String(配置.存储模式 || '旧')") === false) // 在 lib，不在前端
  const lib = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
  assert.ok(lib.includes("存储模式: String(配置.存储模式 || '旧')"))
  assert.ok(lib.includes('分片: 配置.存储模式 ===')) 
})

test('分片概况现读目录：会话数/总表大小/最近写', () => {
  const d = mkdtempSync(join(tmpdir(), 'ep-glance-'))
  wf(join(d, '总.json'), '{"rev":1}', 'utf8')
  wf(join(d, 'aaaa.json'), '{"rev":2}', 'utf8')
  wf(join(d, 'bbbb.json'), '{"rev":3}', 'utf8')
  const o = 模.分片概况(d)
  assert.equal(o.会话数, 2)
  assert.ok(o.总表大小 > 0)
  assert.ok(o.最近写 && o.最近写.length >= 10)
})
test('旧模式不分片：null', () => {
  assert.ok(readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8').includes("配置.存储模式 === '分片' ? 分片概况() : null"))
})