// 2026-11-09 03:55：久压分钟级定时器——2/10/21 分钟，第 21 分钟出结；再 21 分钟出第二条
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m25-'))
process.env.EMOTION_POOL_DIR = 目录
const 模块 = await import('../lib/index.js')

const 配置 = {
  启用: true, 校验启用: false, 校验每天上限: 50, 校验只跑有自报的轮: true,
  提醒启用: false, 每日衰减系数: 0.9, 守恒上限: 1.0, 写入者: ['aaaaaaaa'],
  注入启用: false,
  刻度: 1, 刺阈值: 0.25, 结累计阈值: 0.45, 结急阈值: 0.2, 结急速率: 0.05,
  日志: ['情绪池-日志.md', '情绪池-日志.jsonl'],
}
const 会话id = 'session-aaaaaaaa'
const t0 = Date.now()

function 起(now) {
  const 池 = {
    rev: 0, updated: new Date(now).toISOString(), axes: { E: 0.3, S: 0, P: 0 },
    spine: { E: 0, S: 0, P: 0 }, prev_cell: 'E+S0P0',
    events: [{ id: 'e-0001', t: new Date(now).toISOString(), delta_raw: { E: 0.3, S: 0, P: 0 }, note: '起步', sid: 会话id, turn: 1 }],
    结: [], 格计时: { cell: 'E+S0P0', since: new Date(now).toISOString(), 轴值: { E: 0, S: 0, P: 0 } },
    stats: { selfreport_total: 1, missed_total: 0 },
    p_state: { 爽: { s: 1, a: 1, 最近: null }, 痛: { s: 1, a: 1, 最近: null } },
  }
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(池, null, 2))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify(配置, null, 2))
}
const 读 = () => JSON.parse(readFileSync(join(目录, '情绪池.json'), 'utf8'))

test('2 分钟、10 分钟都不出结', async () => {
  起(t0)
  assert.equal(await 模块.检查久压(t0 + 2 * 60000), null)
  assert.equal(await 模块.检查久压(t0 + 10 * 60000), null)
  assert.equal(读().结.length, 0)
})

test('第 21 分钟出一条久结，然后 since 重置', async () => {
  起(t0)
  const 果 = await 模块.检查久压(t0 + 21 * 60000)
  assert.ok(果 && 果.轴 === 'E')
  const p = 读()
  assert.equal(p.结.length, 1)
  assert.equal(p.结[0].类型, '久')
  assert.ok(Math.abs(p.结[0].值 - 0.15) < 2e-3, String(p.结[0].值))
  assert.ok(Date.parse(p.格计时.since) >= t0 + 20 * 60000)
  assert.equal(await 模块.检查久压(t0 + 22 * 60000), null)
})

test('再 21 分钟、轴值又变了 → 出第二条', async () => {
  起(t0)
  await 模块.检查久压(t0 + 21 * 60000)
  const p = 读()
  p.events.push({ id: 'e-0002', t: new Date(t0 + 25 * 60000).toISOString(), delta_raw: { E: 0.15, S: 0, P: 0 }, note: '又沉了一点', sid: 会话id, turn: 2 })
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(p, null, 2))
  const 果 = await 模块.检查久压(t0 + 42 * 60000)
  assert.ok(果)
  assert.equal(读().结.length, 2)
})

test('cell 变了就重计时、不出结', async () => {
  起(t0)
  const p = 读()
  p.格计时.cell = 'E0S0P0'
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(p, null, 2))
  assert.equal(await 模块.检查久压(t0 + 21 * 60000), null)
  assert.equal(读().结.length, 0)
  assert.equal(读().格计时.cell, 'E+S0P0')
})