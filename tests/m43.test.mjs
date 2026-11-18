// v0.11：分身错判记账、告知、K 窗口 20
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m43-'))
process.env.EMOTION_POOL_DIR = 目录
const 模 = await import('../lib/index.js')
const 双 = await import('../lib/dual.js')

const 会话 = 'session-c4b92d68-f40c-4fc3-ad69-f8338376753b'
const 配置 = {
  启用: true, 校验启用: false, 双轨重做: true, 双轨阈值: 0.15, 分身每批: 300,
  提醒启用: true, 守恒上限: 1, 写入者: ['c4b92d68'], 注入启用: false, 刻度: 1,
  日志: ['情绪池-日志.md', '情绪池-日志.jsonl'],
}

function 轮(n, 被否 = false) {
  return Array.from({ length: n }, (_, i) => ({ t: new Date(Date.now() - (i % 10) * 1000).toISOString(), 被否, 不可靠: false, 中点: !被否 }))
}
// 让「它」5 轮全被否 → 它 K=0.5；我 K=1.0，裁决时我会赢
function 种它被否() {
  return { K: {}, 旧K: null, 最近: null, 信誉: { c4b92d68: { 我: { 轮: 轮(5), 被否: 0, 值: 1, 样本: 0, q: [] }, 它: { 轮: 轮(5, true), 被否: 0, 值: 1, 样本: 0, q: [] } } } }
}
function 重置(双轨 = null) {
  try { rmSync(join(目录, '情绪池.json.lock')) } catch {}
  const 初 = { rev: 0, axes: { E: 0, S: 0, P: 0 }, spine: { S: 0 }, prev_cell: 'E0S0P0', events: [], stats: { selfreport_total: 0, missed_total: 0 } }
  if (双轨) 初.双轨 = 双轨
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(初, null, 2))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify(配置, null, 2))
  for (const f of ['情绪池-提醒.json', '情绪池-日志.md', '情绪池-日志.jsonl', '情绪池-分身额度.json', '情绪池-双轨计数.json']) {
    try { writeFileSync(join(目录, f), '') } catch {}
  }
}
function 池() { return JSON.parse(readFileSync(join(目录, '情绪池.json'), 'utf8')) }
function 记输入表() { const 表 = []; return { 表, 记: (s) => 表.push(String(s)) } }
function 造ctx(它点, 收) {
  return {
    llm: {
      async *stream(arg) {
        const 文 = arg && arg.messages && arg.messages[0] && arg.messages[0].content && arg.messages[0].content[0] && arg.messages[0].content[0].text
        if (收) 收.记(文)
        yield { type: 'text-delta', text: JSON.stringify({ 分析: '看语气', E: 它点.E, S: 它点.S, P: 它点.P, q1: 它点.q1 != null ? 它点.q1 : 0.8, q2: 它点.q2 != null ? 它点.q2 : 0.6 }) }
      },
    },
    agents: { list: () => [] },
  }
}
const 真 = { id: 会话, options: { provider: 'p', model: 'm' } }
const 自报 = (行) => 模.解析自报('<!-- EMO: ' + 行 + ' -->')

test('错判：两轨都有点数 + 超区间 + 采用我 → 错判 +1、该轮 错判:true', async () => {
  重置(种它被否())
  const 解 = 自报('E+9 S0 P0 | q1=1 q2=1')
  await 模.跑本轮(造ctx({ E: 1, S: 0, P: 0, q1: 0.5, q2: 0.5 }), 真, 会话, 1, '回复'.repeat(400), 解, '他说累')
  const p = 池()
  const 项 = p.双轨.K['c4b92d68']
  assert.equal(项.错判, 1)
  assert.equal(项.轮.at(-1).错判, true)
  assert.equal(项.轮.at(-1).采用, undefined) // 轮里不塞观测
  assert.equal(项.轮.at(-1).我点数.E, 9)
  assert.equal(项.轮.at(-1).它点数.E, 1)
})

test('采用中点：不记错判', async () => {
  重置()
  const 解 = 自报('E+1 S0 P0 | q1=1 q2=1')
  await 模.跑本轮(造ctx({ E: 1, S: 0, P: 0, q1: 0.5, q2: 0.5 }), 真, 会话, 1, '回复'.repeat(400), 解, '他说累')
  const 项 = 池().双轨.K['c4b92d68']
  assert.equal(项.错判 || 0, 0)
  assert.equal(项.轮.at(-1).错判, false)
})

test('单轨：不记错判', async () => {
  重置()
  const 解 = 自报('E+9 S0 P0 | q1=1 q2=1')
  const ctx = { llm: { async *stream() { throw new Error('boom') } }, agents: { list: () => [] } }
  await 模.跑本轮(ctx, 真, 会话, 1, '回复'.repeat(400), 解, '他说累')
  const 项 = 池().双轨.K['c4b92d68']
  assert.equal(项.错判 || 0, 0)
  assert.equal(项.轮.at(-1).错判, false)
})

test('告知：上一轮错判 → 下一轮分身输入带【上一轮反馈】和两组点数；没错判时不带', async () => {
  重置(种它被否())
  const 收 = 记输入表()
  await 模.跑本轮(造ctx({ E: 1, S: 0, P: 0, q1: 0.5, q2: 0.5 }, 收), 真, 会话, 1, '回复一'.repeat(120), 自报('E+9 S0 P0 | q1=1 q2=1'), '他说累')
  await 模.跑本轮(造ctx({ E: 1, S: 0, P: 0, q1: 0.5, q2: 0.5 }, 收), 真, 会话, 2, '回复二'.repeat(120), 自报('E+1 S0 P0 | q1=1 q2=1'), '他说累')
  const 第二 = 收.表[1]
  assert.ok(第二.includes('【上一轮反馈】'), 第二)
  assert.ok(第二.includes('你上一轮给的是 E+1 S0 P0'), 第二)
  assert.ok(第二.includes('我们最后采用 E+9 S0 P0'), 第二)
  assert.ok(!收.表[0].includes('【上一轮反馈】'))
})

test('K 窗口：写第 21 轮后轮长 20、最老的掉出', async () => {
  重置()
  for (let i = 1; i <= 21; i++) {
    await 模.跑本轮(造ctx({ E: 1, S: 0, P: 0, q1: 1, q2: 1 }), 真, 会话, i, ('回复' + i).repeat(120), 自报('E+1 S0 P0 | q1=1 q2=1'), '他说累')
  }
  const 项 = 池().双轨.K['c4b92d68']
  assert.equal(项.轮.length, 20)
})

test('写入即重算：项.值 === 算K(项.轮).K，且样本/一致率已写回', async () => {
  重置()
  for (let i = 1; i <= 6; i++) {
    await 模.跑本轮(造ctx({ E: 1, S: 0, P: 0, q1: 1, q2: 1 }), 真, 会话, i, ('回复' + i).repeat(120), 自报('E+1 S0 P0 | q1=1 q2=1'), '他说累')
  }
  const 项 = 池().双轨.K['c4b92d68']
  const kk = 双.算K(项.轮)
  assert.equal(项.值, kk.K)
  assert.equal(项.样本, kk.样本)
  assert.equal(项.中点一致率, kk.中点一致率)
})

test('露出：卡片第 2 页有「分身错判」这一行', () => {
  const w = readFileSync(join(import.meta.dirname, '..', 'assets', 'widget.js'), 'utf8')
  assert.ok(w.includes("'裁决 K'"), 'widget')
})