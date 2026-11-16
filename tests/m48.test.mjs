import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const 目录 = mkdtempSync(join(tmpdir(), 'v15-'))
process.env.EMOTION_POOL_DIR = 目录
const 模 = await import('../lib/index.js')

function 事件(E值们) {
  return { events: E值们.map((v, i) => ({ t: '2026-11-11T00:00:0' + i + 'Z', delta_raw: { E: v, S: 0, P: 0 } })) }
}

test('E 分布：正 / 负 / 零 分别计数', () => {
  const r = 模.E分布(事件([0.1, -0.2, 0, 0.3, -0.4, 0.0004]))
  assert.equal(r.样本, 6)
  assert.equal(r.正, 2)
  assert.equal(r.负, 2)
  assert.equal(r.零, 2)
})

test('E 分布：只取最近 10 条，样本不足照实给', () => {
  const 十二 = 事件(Array.from({ length: 12 }, (_, i) => (i < 2 ? -0.5 : 0.2)))
  const r = 模.E分布(十二)
  assert.equal(r.样本, 10)
  assert.equal(r.负, 0)
  assert.equal(r.正, 10)
  const 三 = 模.E分布(事件([0.2, 0.2, -0.2]))
  assert.equal(三.样本, 3)
})

test('E 分布：|Δ| < 0.0005 算 0', () => {
  const r = 模.E分布(事件([0.0004, -0.0004, 0.0006]))
  assert.equal(r.零, 2)
  assert.equal(r.正, 1)
})

test('分身提示词：E 的拿/给两句方向必须自洽，且不许留旧矛盾句', () => {
  const 源 = readFileSync(fileURLToPath(new URL('../lib/index.js', import.meta.url)), 'utf8')
  assert.ok(源.includes('她拿（要他陪、要他配合、她占上风、她被照顾）→ 负'), '她拿 → 负')
  assert.ok(源.includes('她给（哄他、让他放心、替他扛、把注意力让给他）→ 正'), '她给 → 正')
  assert.ok(!源.includes('他从她这里拿到'), '旧矛盾句必须删掉')
  assert.ok(源.includes('每 10 轮最多允许 3 次 0'))
})

test('露出：/state.双轨 带 E分布，卡片第 2 页有那行', () => {
  const 源 = readFileSync(fileURLToPath(new URL('../lib/index.js', import.meta.url)), 'utf8')
  assert.ok(源.includes('E分布: E分布(池)'))
  const 挂 = readFileSync(fileURLToPath(new URL('../assets/widget.js', import.meta.url)), 'utf8')
  assert.ok(挂.includes("'采用'"))
})