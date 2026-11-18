// 推轴必须落事件，否则事件页永远只有自报
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m124-'))
process.env.EMOTION_POOL_DIR = 目录
const I = await import('../lib/index.js')
const 会话 = 'session-8f689553-aaaa-bbbb-cccc-ddddeeeeffff'

test('推轴两次：事件从 0 变 2，类型/来源/Δ 都在，快照轴不受事件影响', () => {
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify({ 启用: true, 刻度: 1 }, null, 2), 'utf8')
  I.推轴(会话, { E: 0.4, S: 0, P: 0 }, 11, I.读配置(), { 系数: 1, 来源: '轨迹', 段数: 2, 为谁: '为他' })
  I.推轴(会话, { E: 0.6, S: 0, P: 0 }, 12, I.读配置(), { 系数: 1, 来源: '轨迹', 段数: 1, 为谁: '为自己' })
  const 池 = I.读池()
  const 我 = (池.events || []).filter((e) => e && e.sid === 会话)
  assert.equal(我.length, 2)
  assert.equal(我[0].类型, '推轴')
  assert.equal(我[0].段数, 2)
  assert.equal(我[1].为谁, '为自己')
  assert.ok(Math.abs(Number(我[0].delta_raw.E)) > 0)
  // 快照路径下现值只看快照，不看事件
  assert.ok(Object.keys(池.会话快照 || {}).length >= 1)
})

test('同轮已有一条事件时，推轴只更新那条，不新增', () => {
  I.推轴('s2', { E: 0.2, S: 0, P: 0 }, 9, I.读配置(), { 系数: 1, 来源: '轨迹', 段数: 2, 为谁: '为他' })
  const 首Δ = Number((I.读池().events || []).filter((e) => e.sid === 's2')[0].delta_raw.E)
  I.推轴('s2', { E: 0.5, S: 0, P: 0 }, 9, I.读配置(), { 系数: 1, 来源: '轨迹', 段数: 4, 为谁: '两边' })
  const 池 = I.读池()
  const 我 = (池.events || []).filter((e) => e.sid === 's2')
  assert.equal(我.length, 1, '同轮不新增')
  assert.equal(我[0].段数, 4)
  assert.equal(我[0].为谁, '两边')
  assert.notEqual(Number(我[0].delta_raw.E), 首Δ, 'Δ 取最新一次')
  assert.ok(Math.abs(Number(我[0].delta_raw.E)) > Math.abs(首Δ))
})
