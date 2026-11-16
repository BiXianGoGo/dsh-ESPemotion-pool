// turn=null 的推轴不许 upsert（曾经全并到第一条）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m127-'))
process.env.EMOTION_POOL_DIR = 目录
const I = await import('../lib/index.js')

test('turn=null 连续三次推轴：事件 +3，不并到第一条', () => {
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify({ 启用: true, 刻度: 1 }, null, 2), 'utf8')
  const 会话 = 'session-bbbbbbbb-nullturn-0000'
  I.推轴(会话, { E: 0.2, S: 0, P: 0 }, null, I.读配置(), { 系数: 1, 来源: '轨迹' })
  I.推轴(会话, { E: 0.4, S: 0, P: 0 }, null, I.读配置(), { 系数: 1, 来源: '轨迹' })
  I.推轴(会话, { E: 0.6, S: 0, P: 0 }, null, I.读配置(), { 系数: 1, 来源: '轨迹' })
  const 我 = (I.读池().events || []).filter((e) => e && e.sid === 会话)
  assert.equal(我.length, 3)
  assert.ok(Math.abs(Number(我[2].delta_raw.E)) > Math.abs(Number(我[0].delta_raw.E)), '吸附后第三次仍更大')
})

test('turn 相同仍然只更新，不新增', () => {
  const 会话2 = 'session-bbbbbbbb-sameturn-0000'
  I.推轴(会话2, { E: 0.2, S: 0, P: 0 }, 7, I.读配置(), { 系数: 1, 来源: '轨迹' })
  I.推轴(会话2, { E: 0.5, S: 0, P: 0 }, 7, I.读配置(), { 系数: 1, 来源: '轨迹' })
  const 我 = (I.读池().events || []).filter((e) => e && e.sid === 会话2)
  assert.equal(我.length, 1)
})
