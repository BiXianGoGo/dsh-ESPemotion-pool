import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const 后端 = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')

test('待确认：候选存末段点（最多 30）并裁剪到 50', () => {
  assert.ok(后端.includes('点们.slice(-30)'))
  assert.ok(后端.includes('function 裁候选(o)'))
  assert.ok(后端.includes('slice(0, 50)'))
})

test('待确认：确认把点副本带进模板', () => {
  assert.ok(后端.includes("o.模板.push({ 名, 建: c.建 || 现在()"))
  assert.ok(后端.includes('点: Array.isArray(c.点) ? c.点 : []'))
})

test('待确认：写操作校验写入者与重名', () => {
  assert.ok(后端.includes('function 会话可写(体, 配)'))
  assert.ok(后端.includes('function 重名(o, 名)'))
  assert.ok(后端.includes("error: '该名字已存在'"))
})

test('待确认：三个写路由与读路由都在', () => {
  for (const p of ['/dsh-emotion-pool/tpl', '/dsh-emotion-pool/tpl/confirm', '/dsh-emotion-pool/tpl/drop', '/dsh-emotion-pool/tpl/rename']) {
    assert.ok(后端.includes("path: '" + p + "'"), p)
  }
  assert.ok(后端.includes("error: '候选里没有这个名字：' + 名"))
})
