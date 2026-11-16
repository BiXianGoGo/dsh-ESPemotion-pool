// v0.8 A 补充：中点逐轴、K 夹取、旧格式量级
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m39-'))
process.env.EMOTION_POOL_DIR = 目录
const 模 = await import('../lib/index.js')
const 双 = await import('../lib/dual.js')

test('旧格式（E+ S-）delta 仍是 ±0.15，自报文本保留符号写法', () => {
  const r = 模.解析自报('<!-- EMO: E+ S- P0 | 陪他 -->')
  assert.equal(r.新格式, false)
  assert.equal(r.delta.E, 0.15)
  assert.equal(r.delta.S, -0.15)
  assert.equal(r.自报, 'E+ S- P0')
})

test('新格式 delta 由点数给出，Q 缺省为 null（按 0.7/0.7 兜底）', () => {
  const r = 模.解析自报('<!-- EMO: E+2 S0 P-3 -->')
  assert.equal(r.新格式, true)
  assert.deepEqual(r.点数, { E: 2, S: 0, P: -3 })
  assert.equal(r.q1, null)
  assert.equal(r.q2, null)
})

test('三轴都在 ±0.15 内时逐轴取中点', () => {
  const 我 = { 点数: { E: 2, S: -1, P: 0 }, 认知度: 0.8 }
  const 它 = { 点数: { E: 4, S: -3, P: 0 }, 认知度: 0.8 }
  const r = 双.合成(我, 它)
  assert.equal(r.采用, '中点')
  assert.ok(Math.abs(r.delta.E - 0.12) < 1e-9)
  assert.ok(Math.abs(r.delta.S + 0.08) < 1e-9)
  assert.equal(r.delta.P, 0)
})

test('K 上限 1.0、下限 0.5', () => {
  const 高 = Array.from({ length: 20 }, () => ({ 中点: true, 不可靠: false }))
  assert.equal(双.算K(高).K, 1.0)
  const 低 = Array.from({ length: 20 }, () => ({ 被否: true, 不可靠: false }))
  const r = 双.算K(低)
  assert.equal(r.K, 0.5)
})

test('不可靠率计入 K：同样 20 轮，不可靠多的 K 更低', () => {
  const 甲 = Array.from({ length: 20 }, (_, i) => ({ 中点: i < 10, 不可靠: false }))
  const 乙 = Array.from({ length: 20 }, (_, i) => ({ 中点: i < 10, 不可靠: i < 6 }))
  assert.ok(双.算K(乙).K < 双.算K(甲).K, `${双.算K(乙).K} vs ${双.算K(甲).K}`)
})
