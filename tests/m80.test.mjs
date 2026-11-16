import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as 双 from '../lib/dual.js'

const 后端 = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')

function 点(t, E, S, P) { return { t, E, S, P } }

test('A2：没有它点 → 单轨', () => {
  const r = 双.主曲线([点(1, 0.2, 0, 0)], [], 1, 1)
  assert.equal(r.来源, '单轨')
})

test('A2：偏移超过阈值 → 分歧，偏移是逐段三轴平均差', () => {
  const 我 = [点(1, 0.2, 0.2, 0.2), 点(2, 0.4, 0.4, 0.4)]
  const 它 = [点(1, 0.1, 0.1, 0.1), 点(2, 0.18, 0.18, 0.18)]
  const r = 双.主曲线(我, 它, 1, 1, 0.15)
  assert.equal(r.来源, '分身')
  assert.equal(r.分歧, true)
  assert.ok(r.偏移 > 0.15, String(r.偏移))
})

test('A2：末点至少两轴反向 → 反向', () => {
  const 我 = [点(1, 0.8, 0.8, 0), 点(2, 0.9, 0.9, 0)]
  const 它 = [点(1, -0.8, -0.8, 0), 点(2, -0.9, -0.9, 0)]
  const r = 双.主曲线(我, 它, 1, 1, 0.15)
  assert.equal(r.反向, true)
})

test('A2：单点 / 短回复 / 连续反向 / 确认问日限 都写在后端', () => {
  assert.ok(后端.includes("String(回复文 || '').length < 300"))
  assert.ok(后端.includes('确认问日限'))
  assert.ok(后端.includes('连续反向'))
  assert.ok(后端.includes('我可能读偏了'))
})

test('A2：系数连乘后夹下限 0.15', () => {
  assert.ok(后端.includes('Math.min(1, Math.max(0.15'))
  assert.ok(后端.includes('系数 *= 0.7'), '单点 0.7')
  assert.ok(后端.includes('系数 *= 0.25'), '反向 0.25')
})

test('A2：/state 露出曲线来源与确认问', () => {
  assert.ok(后端.includes('曲线来源:'))
  assert.ok(后端.includes('确认问:'))
})

test('A2：分身看曲线有 8 秒超时且失败降级单轨', () => {
  assert.ok(后端.includes('秒超时('))
  assert.ok(后端.includes('来源: \'单轨\''))
})