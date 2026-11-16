process.env.EP_LEGACY_INJECT = '1'
﻿import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const 源 = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
const 包 = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

test('版本：lib 与 package.json 都是 0.2.5', () => {
  assert.ok(源.includes("export const 版本 = '0.2.5'"))
  assert.equal(包.version, '0.2.5')
})

test('/state 缓存：键含 池 rev、当前池名、pool 参数、装载会话、配置 mtime', () => {
  assert.ok(源.includes('const 键 = 状态键(池.rev, 当前池名, 装载名单(配置), 配m, 询池)'))
  assert.ok(源.includes('export function 状态键(rev, 当前池名, 装载, 配置mtime, 询池)'))
  assert.ok(源.includes("'pool:' + String(询池 || '')"))
  assert.ok(源.includes('statSync(CONFIG_PATH).mtimeMs'))
  assert.ok(源.includes('状态缓存.键 === 键'))
})

test('/state 缓存：2 秒窗口，命中直接返回', () => {
  assert.ok(源.includes('if (状态缓存 && 状态缓存.键 === 键 && Date.now() - 状态缓存.at < 2000) {'))
})

test('/state 缓存：写完回填缓存，并禁浏览器缓存', () => {
  assert.ok(源.includes('状态缓存 = { 键, at: Date.now(), 体 }'))
  assert.ok(源.includes("res.setHeader('cache-control', 'no-store')"))
})

