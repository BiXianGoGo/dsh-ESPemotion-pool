import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const 后端 = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
const 前端 = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')

test('v0.25c：组点优先轨迹段点，按时间合并取最近 200 个', () => {
  assert.ok(后端.includes('const 轨点 = 列.slice(-600)'))
  assert.ok(后端.includes("let 来源 = 轨点.length ? '轨迹' : '空'"))
  assert.ok(后端.includes('列.sort((a, b) => (Date.parse(a.t) || 0) - (Date.parse(b.t) || 0))'))
})

test('v0.25c：没有轨迹才退自报事件', () => {
  assert.ok(后端.includes("if (点.length) 来源 = '自报'"))
  assert.ok(后端.includes('!e.merged_into && g.会话.includes(短会话(e.sid))'))
})

test('v0.25c：/state 组露点来源', () => {
  assert.ok(后端.includes('点来源: 来源'))
})

test('v0.25c：空态文案仍是「该组还没有思考轨迹」', () => {
  assert.ok(前端.includes('该组还没有思考轨迹'))
})
