import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as 模 from '../lib/index.js'

const 后端 = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')

function 池() {
  return {
    组零点: { A: { E: 0.1, S: 0, P: 0 }, B: { E: -0.1, S: 0, P: 0 } },
    组六头: { A: {}, B: {} },
    会话快照: {}, spine: { E: 0, S: 0, P: 0 }, 快照启用: true, 零点: { E: 0, S: 0, P: 0 },
  }
}

test('组零点：组份各自独立，不共享对象', () => {
  const p = {}
  const a = 模.组份(p, 'A')
  const b = 模.组份(p, 'B')
  a.零点.E = 0.2
  assert.equal(b.零点.E, 0)
  assert.equal(p.组零点.A.E, 0.2)
})

test('组归名：命中组 / 不在组里给 null', () => {
  const 配置 = { 组: [{ 名: '常用', 会话: ['aaaaaaaa'] }, { 名: '测试', 会话: ['cccccccc'] }] }
  assert.equal(模.组归名('session-aaaaaaaa-xxxx', 配置), '常用')
  assert.equal(模.组归名('deadbeef', 配置), null)
})

test('组现值：各用各的零点', () => {
  const p = 池()
  const A = 模.组现值(p, { 名: 'A', 会话: [] })
  const B = 模.组现值(p, { 名: 'B', 会话: [] })
  assert.equal(Number(A.轴.E.toFixed(4)), 0.1)
  assert.equal(Number(B.轴.E.toFixed(4)), -0.1)
})

test('组现值：不混别的组的快照', () => {
  const p = 池()
  p.会话快照 = { aaaaaaaa: { E: { x: 0.5, t: new Date().toISOString(), τ: 12 } } }
  const A = 模.组现值(p, { 名: 'A', 会话: ['aaaaaaaa'] })
  const B = 模.组现值(p, { 名: 'B', 会话: [] })
  assert.ok(A.合.E > 0.4)
  assert.equal(B.合.E, 0)
})

test('迁移：只做一次、归事件最多的组', () => {
  assert.ok(后端.includes('零点迁移'))
  assert.ok(后端.includes('数.sort((a, b) => b.n - a.n)'))
  assert.ok(后端.includes('旧零点'))
})

test('顶层：axes 是各组之和、未归组计数、说明文案', () => {
  assert.ok(后端.includes('各组(快照+组零点)之和，再加一次 spine'))
  assert.ok(后端.includes('未归组: (() => { try { return 未归池().length }'))
  assert.ok(后端.includes('未归池: (() => { try { return 未归池() }'))
  assert.ok(后端.includes('for (const g of 组名单(配置)) {'))
})