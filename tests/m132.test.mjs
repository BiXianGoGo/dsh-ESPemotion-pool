import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const lib = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')

test('0.2.4 注入自述：四行结构 + 末句 + 三个开关', () => {
  assert.ok(lib.includes('【情绪】现在是「'))
  assert.ok(lib.includes('上一轮是「'))
  assert.ok(lib.includes('为什么：'))
  assert.ok(lib.includes('这是你自己经系统判出的情绪，按它来，不要否认、也不要改写。'))
  assert.ok(lib.includes('配置.情绪自述开关 === true'))
  assert.ok(lib.includes('配置.说明书指路开关 !== false'))
  assert.ok(lib.includes('说明书路径(配置)'))
  assert.ok(lib.includes("o.上次名 = 名 || '未命名'"))
  assert.ok(lib.includes('const 前名 = String(o.上次名'))
})

test('0.2.4 说明书：目录 + 九节 + 版本头 + 动态行号', () => {
  assert.ok(lib.includes('export function 说明书全文(池, 配置)'))
  assert.ok(lib.includes("'## 0. 目录'"))
  assert.ok(lib.includes('<!-- 版本 '))
  assert.ok(lib.includes('目录.push'))
  assert.ok(lib.includes('最近 20 个推轴点'))
  assert.ok(lib.includes('最近 5 条事件'))
})

test('0.2.4 说明书接口：本机 GET + ?sec=N', () => {
  assert.ok(lib.includes("path: '/dsh-emotion-pool/manual'"))
  assert.ok(lib.includes("searchParams.get('sec')"))
  assert.ok(lib.includes("'text/markdown; charset=utf-8'"))
  assert.ok(lib.includes('n < 0 || n > 9'))
})
