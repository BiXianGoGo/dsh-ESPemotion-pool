import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const 源 = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')

test('v2/state：全局轴与刻度一致（×刻度），顶层带 刻度', () => {
  assert.ok(源.includes("刻度: 刻,"))
  assert.ok(源.includes("轴: { E: 标值(配, 池.axes && 池.axes.E)"))
})

test('v2/meta：轴说明写明已乘刻度', () => {
  assert.ok(源.includes('axes 之和（含 spine，已乘刻度）'))
})
