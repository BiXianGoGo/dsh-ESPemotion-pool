import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), 'v16-'))
process.env.EMOTION_POOL_DIR = 目录
const 模 = await import('../lib/index.js')

const 注入路径 = join(目录, '情绪池-注入.json')
const 轮号路径 = join(目录, '情绪池-轮号.json')
const 重置 = () => { for (const f of [注入路径, 轮号路径]) { try { unlinkSync(f) } catch {} } }
const 写注入原文 = (o) => writeFileSync(注入路径, JSON.stringify(o, null, 2))
const 读注入原文 = () => JSON.parse(readFileSync(注入路径, 'utf8'))
const 读轮原文 = () => JSON.parse(readFileSync(轮号路径, 'utf8'))

test('互踩回归：记 20 轮、中间穿插 读注入→写注入，总不被盖小', () => {
  重置()
  写注入原文({ 今天: 'x', 判断: 0, 注入: 0, 保底: 0, 插队: 0, 上次轮: 0, 上次轴: {}, 上次时间: null, 上次格: '' })
  for (let i = 1; i <= 20; i += 1) {
    模.记一轮('session-aaaaaaaa-aaaa', i)
    const 注 = 读注入原文()
    注.判断 = (注.判断 || 0) + 3
    写注入原文(注)
  }
  assert.equal(读轮原文().总, 20)
  assert.equal(模.读轮号().总, 20)
})

test('同一 sid + turn 调两次只 +1；不同会话同 turn 各记各的', () => {
  重置()
  写轮号File({ 总: 5, 按会话: {}, 末: {}, 更新: null })
  function 写轮号File(o) { writeFileSync(轮号路径, JSON.stringify(o)) }
  模.记一轮('session-aaaa-1', 7)
  模.记一轮('session-aaaa-1', 7)
  assert.equal(模.读轮号().总, 6)
  模.记一轮('session-bbbb-2', 7)
  assert.equal(模.读轮号().总, 7)
  assert.equal(Object.keys(模.读轮号().按会话).length, 2)
})

test('轮号文件不存在：当前轮 回退事件表最大 turn，不抛', () => {
  重置()
  assert.equal(模.当前轮({ events: [{ turn: 3 }, { turn: 42 }, { turn: 9 }] }), 42)
})

test('迁移：注入.json 里的 轮 搬进轮号文件，第二次不再搬；搬完注入文件无 轮', () => {
  重置()
  写注入原文({ 今天: 'x', 上次轮: 9, 轮: { 总: 100, 按会话: { aaaa: 100 }, 末: { aaaa: 100 } } })
  const r1 = 模.迁移轮号({ events: [{ turn: 3 }] })
  assert.equal(r1.搬了, true)
  assert.equal(读轮原文().总, 100)
  assert.equal(读注入原文().轮, undefined)
  const r2 = 模.迁移轮号({ events: [] })
  assert.equal(r2.搬了, false)
})

test('轮号文件写坏：备份 .bad-*、按种子重建、不把文件写成空', () => {
  重置()
  writeFileSync(轮号路径, '{"总": 3, 坏')
  const r = 模.读轮号({ events: [{ turn: 10 }] })
  assert.equal(r.总, 10)
  assert.ok(readdirSync(目录).some((f) => f.startsWith('情绪池-轮号.json.bad-')))
  assert.equal(JSON.parse(readFileSync(轮号路径, 'utf8')).总, 10)
})

test('/state.注入.轮总 等于轮号文件里的 总', () => {
  重置()
  写轮号File({ 总: 77, 按会话: {}, 末: {}, 更新: null })
  function 写轮号File(o) { writeFileSync(轮号路径, JSON.stringify(o)) }
  assert.equal(模.当前轮({ events: [] }), 77)
})