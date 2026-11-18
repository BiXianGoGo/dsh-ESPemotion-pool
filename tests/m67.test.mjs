import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const 根 = join(process.env.TEMP || 'C:/temp', 'ep-m67-' + process.pid)
mkdirSync(根, { recursive: true })
process.env.EMOTION_POOL_DIR = 根
writeFileSync(join(根, '情绪池.json'), JSON.stringify({ rev: 1, axes: { E: 0, S: 0, P: 0 }, spine: { S: 0 }, prev_cell: 'E0S0P0', events: [], 快照启用: true, 会话快照: { c4b92d68: { E: { x: 0.2, t: new Date().toISOString(), τ: 12 }, S: { x: 0.1, t: new Date().toISOString(), τ: 12 } }, '6a169bce': { E: { x: -0.1, t: new Date().toISOString(), τ: 12 } } }, 双轨: { K: {}, 信誉: {} }, 零点: { E: 0, S: 0, P: 0 }, stats: { selfreport_total: 0, missed_total: 0 } }, null, 2))
writeFileSync(join(根, '情绪池配置.json'), JSON.stringify({ 写入者: ['c4b92d68'], 组: [{ 名: '常用聊天组', 会话: ['c4b92d68'] }, { 名: '测试组', 会话: ['6a169bce'] }] }, null, 2))
const 模 = await import(pathToFileURL(join(process.cwd(), 'lib', 'index.js')).href)

test('组名单：默认两组、会话去重', () => {
  const g = 模.组名单({ 组: [{ 名: 'A', 会话: ['c4b92d68', 'c4b92d68', 'bad'] }, { 名: 'B', 会话: ['c4b92d68'] }, { 名: 'C', 会话: [] }] })
  // 2026-11-16 策划间口径：空组也保留（空池页签排最后）；B 的会话被去重后也变成空组
  assert.equal(g.length, 3)
  assert.deepEqual(g[0], { 名: 'A', 会话: ['c4b92d68'] })
  assert.deepEqual(g[1], { 名: 'B', 会话: [] })
  assert.deepEqual(g[2], { 名: 'C', 会话: [] })
})

test('装载名单：有组时取组的并集，忽略装载会话', () => {
  assert.deepEqual(模.装载名单({ 组: [{ 名: 'A', 会话: ['c4b92d68'] }], 装载会话: ['6a169bce'] }), ['c4b92d68'])
  assert.equal(模.装载来源({ 组: [{ 名: 'A', 会话: ['c4b92d68'] }] }), '组')
  assert.equal(模.装载来源({ 装载会话: ['6a169bce'] }), '装载会话')
  assert.equal(模.装载来源({}), '全部')
})

test('组现值 = 组内快照和 + spine，组间互不混', () => {
  const 池 = 模.读池()
  const a = 模.组现值(池, { 会话: ['c4b92d68'] })
  const b = 模.组现值(池, { 会话: ['6a169bce'] })
  assert.ok(a.合.E > 0.15 && a.合.E < 0.25)
  assert.ok(b.合.E < 0)
  assert.notEqual(a.轴.E, b.轴.E)
})

test('允许装载：组外会话不装载', () => {
  const 配 = { 组: [{ 名: 'A', 会话: ['c4b92d68'] }] }
  assert.equal(模.允许装载(配, 'session-c4b92d68-1111'), true)
  assert.equal(模.允许装载(配, 'session-6a169bce-2222'), false)
})

test('改会话组：挪进组、挪出组、空组名等于不装载', () => {
  const r1 = 模.改会话组('6a169bce', '常用聊天组')
  assert.equal(r1.ok, true)
  assert.ok(r1.组[0].会话.includes('6a169bce'))
  const r2 = 模.改会话组('6a169bce', '')
  assert.equal(r2.ok, true)
  assert.equal(r2.组.some((g) => g.会话.includes('6a169bce')), false)
  const r3 = 模.改会话组('bad', '常用聊天组')
  assert.equal(r3.ok, false)
})
