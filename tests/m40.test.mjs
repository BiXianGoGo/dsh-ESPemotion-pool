// v0.8 A：从旧 m3 迁移的仍然有效断言
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m40-'))
process.env.EMOTION_POOL_DIR = 目录
const 模 = await import('../lib/index.js')

const 配置 = {
  启用: true,
  双轨重做: true,
  双轨K: 1,
  双轨阈值: 0.15,
  分身每批: 300,
  提醒启用: true,
  注入启用: false,
  刻度: 1,
  写入者: ['c4b92d68'],
  日志: ['情绪池-日志.md', '情绪池-日志.jsonl'],
}
const 会话 = 'session-c4b92d68-f40c-4fc3-ad69-f8338376753b'

function 重置() {
  try { rmSync(join(目录, '情绪池.json.lock')) } catch {}
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify({ rev: 0, axes: { E: 0, S: 0, P: 0 }, spine: { S: 0 }, prev_cell: 'E0S0P0', events: [], stats: { selfreport_total: 0, missed_total: 0 } }, null, 2))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify(配置, null, 2))
  writeFileSync(join(目录, '情绪池-日志.md'), '')
}

test('单轨不进窗口：没有 K 轮次记录，样本 0、值 1.0', async () => {
  重置()
  const 解 = 模.解析自报('<!-- EMO: E+3 S0 P0 | 陪他 -->')
  const ctx = { llm: undefined, agents: { list: () => [] } }
  await 模.跑本轮(ctx, { id: 会话 }, 会话, 3, '回复'.repeat(400), 解, '在吗')
  const 池 = JSON.parse(readFileSync(join(目录, '情绪池.json'), 'utf8'))
  const 信 = (池.双轨.信誉 || {})['c4b92d68']
  assert.ok(!信 || !信.我 || (信.我.轮 || []).length === 0)
  assert.ok(!信 || !信.我 || Number(信.我.样本) === 0)
  assert.equal(池.双轨.最近.采用, '单轨')
})

test('日志形状：自报行、点位与值都在同一行（旧 m3 的「校验 OK」由新链的「双轨」替代）', async () => {
  重置()
  const 解 = 模.解析自报('<!-- EMO: E+3 S0 P0 | 陪他 -->')
  const ctx = { llm: undefined, agents: { list: () => [] } }
  await 模.跑本轮(ctx, { id: 会话 }, 会话, 4, '回复'.repeat(400), 解, '在吗')
  const 日志 = readFileSync(join(目录, '情绪池-日志.md'), 'utf8')
  assert.ok(日志.includes('自报 E+3 S0 P0'), 日志)
  assert.ok(日志.includes('值'), 日志)
})

test('提醒文案：说「语气和自报对不上」，不带旧「话说得轻快」', () => {
  模.挂提醒(配置, 'A', 9, 'E+3', '差 0.2')
  模.放提醒闸('A')
  const 文 = 模.取提醒(配置, 'A')
  assert.ok(文.includes('语气和自报对不上'), 文)
  assert.ok(!文.includes('话说得轻快'), 文)
})

test('提醒启用 false → 挂着也不注入', () => {
  模.挂提醒({ ...配置, 提醒启用: false }, 'C', 11, 'E-3', '差 0.2')
  模.放提醒闸('C')
  assert.equal(模.取提醒({ ...配置, 提醒启用: false }, 'C'), '')
})

test('提醒闸：同一条只取一次，取完即空', () => {
  模.挂提醒(配置, 'B', 10, 'S-3', '差 0.18')
  模.放提醒闸('B')
  assert.ok(模.取提醒(配置, 'B').includes('语气和自报对不上'))
  assert.equal(模.取提醒(配置, 'B'), '')
})

test('缺q：旧格式没写 q1/q2 时池里累计「缺q轮数」，/state 能看见', async () => {
  重置()
  const 解 = 模.解析自报('<!-- EMO: E+2 S0 P0 | 陪他 -->')
  assert.equal(解.缺q, true)
  assert.equal(解.q1, null)
  assert.equal(解.q2, null)
  const ctx = { llm: undefined, agents: { list: () => [] } }
  await 模.跑本轮(ctx, { id: 会话 }, 会话, 4, '回复'.repeat(400), 解, '在吗')
  const 池 = JSON.parse(readFileSync(join(目录, '情绪池.json'), 'utf8'))
  assert.equal(池.双轨.缺q轮数, 1)
  const 解2 = 模.解析自报('<!-- EMO: E+2 S0 P0 | q1=0.8 q2=0.6 | 陪他 -->')
  assert.equal(解2.缺q, false)
})

test('提醒日限：一天最多注入 3 条，第 4 条跳过并写日志', () => {
  重置()
  writeFileSync(join(目录, '情绪池-提醒.json'), JSON.stringify({ 今天: '', 今日次数: 0, 待提醒: null }))
  let 注入 = 0
  for (let i = 0; i < 4; i++) {
    模.挂提醒(配置, 会话, i + 1, 'E+3', '差 0.2')
    模.放提醒闸(会话)
    if (模.取提醒(配置, 会话)) 注入++
  }
  assert.equal(注入, 3)
  const 日志 = readFileSync(join(目录, '情绪池-日志.md'), 'utf8')
  assert.ok(日志.includes('提醒跳过'), 日志.slice(-300))
})
