import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { 解析自报, 设置清单, 空模板 } from '../lib/index.js'

const 源 = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')

test('B：自报支持 曲线= 名', () => {
  const r = 解析自报('<!-- EMO: E+1 S0 P0 | 曲线=温柔的靠近 | 陪着他 -->')
  assert.equal(r.ok, true)
  assert.equal(r.曲线, '温柔的靠近')
})

test('B：没有曲线字段时为空串', () => {
  const r = 解析自报('<!-- EMO: E+1 S0 P0 | 陪着他 -->')
  assert.equal(r.曲线, '')
})

test('B：默认配置有模板两键', () => {
  assert.ok(源.includes('模板相似门槛: 0.8'))
  assert.ok(源.includes('模板量级门: 0.3'))
})

test('B：设置清单含两键与范围', () => {
  const a = 设置清单().find((x) => x.键 === '模板相似门槛')
  const b = 设置清单().find((x) => x.键 === '模板量级门')
  assert.deepEqual(a.范围, [0.5, 0.95])
  assert.deepEqual(b.范围, [0.1, 0.6])
})

test('B：/state 顶层有 模板 三项', () => {
  assert.ok(源.includes('模板: (() => {'))
  assert.ok(源.includes('总: (o.模板 || []).length'))
  assert.ok(源.includes('候选: (o.候选 || []).length'))
  assert.ok(源.includes('最近: 池.模板最近 || null'))
})

test('B：跑轨迹里做判定并写事件定名', () => {
  assert.ok(源.includes('定名 = 定名波动(sid, turn, 主.点, 波动, 读配置())'))
  assert.ok(源.includes('e.定名 = 定名'))
  assert.ok(源.includes('波动, 定名, 打点模型'))
})

test('B：命中时次数+1 并更新模板', () => {
  assert.ok(源.includes('t.次数 = (Number(t.次数) || 0) + 1'))
  assert.ok(源.includes('模板更新(t.签名 || t, 签, 0.3)'))
})

test('B：空模板结构', () => {
  const o = 空模板()
  assert.deepEqual(o, { version: 1, 模板: [], 候选: [] })
})
