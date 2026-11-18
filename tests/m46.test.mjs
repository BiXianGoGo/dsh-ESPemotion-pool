// v0.13：两本账 K（只压不抬）+ 裁决只看 K（q 不进裁决）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m46-'))
process.env.EMOTION_POOL_DIR = 目录
const 模 = await import('../lib/index.js')
const 双 = await import('../lib/dual.js')

const 会话 = 'session-c4b92d68-f40c-4fc3-ad69-f8338376753b'
const 配置 = {
  启用: true, 校验启用: false, 双轨重做: true, 双轨阈值: 0.15, 分身每批: 300,
  提醒启用: true, 守恒上限: 1, 写入者: ['c4b92d68'], 注入启用: false, 刻度: 1,
  日志: ['情绪池-日志.md', '情绪池-日志.jsonl'],
}

function 重置(双轨 = null) {
  try { rmSync(join(目录, '情绪池.json.lock')) } catch {}
  const 池 = { rev: 0, axes: { E: 0, S: 0, P: 0 }, spine: { S: 0 }, prev_cell: 'E0S0P0', events: [], stats: { selfreport_total: 0, missed_total: 0 } }
  if (双轨) 池.双轨 = 双轨
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(池, null, 2))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify(配置, null, 2))
  for (const f of ['情绪池-提醒.json', '情绪池-日志.md', '情绪池-日志.jsonl', '情绪池-分身额度.json', '情绪池-注入.json']) {
    try { writeFileSync(join(目录, f), '') } catch {}
  }
}
function 池() { return JSON.parse(readFileSync(join(目录, '情绪池.json'), 'utf8')) }
function 信() { return 池().双轨.信誉['c4b92d68'] }
function 轮(n, 被否 = false, 不可靠 = false) {
  return Array.from({ length: n }, (_, i) => ({ t: new Date(Date.now() - (i % 10) * 1000).toISOString(), 被否, 不可靠, 中点: !被否 && !不可靠 }))
}
function 种(K我被否 = false, K它被否 = false) {
  return { K: {}, 旧K: null, 最近: null, 信誉: { c4b92d68: { 我: { 轮: 轮(5, K我被否), 被否: 0, 值: 1, 样本: 0, q: [] }, 它: { 轮: 轮(5, K它被否), 被否: 0, 值: 1, 样本: 0, q: [] } } } }
}
function 造ctx(点, q1 = 0.8, q2 = 0.6) {
  return {
    llm: {
      async *stream() {
        yield { type: 'text-delta', text: JSON.stringify({ 分析: '看语气', E: 点.E, S: 点.S, P: 点.P, q1, q2 }) }
      },
    },
    agents: { list: () => [] },
  }
}
const 真 = { id: 会话, options: { provider: 'p', model: 'm' } }
const 自报 = (行) => 模.解析自报('<!-- EMO: ' + 行 + ' -->')

test('采用它 → 我 被否 +1、它 0；我的轮末尾 被否:true', async () => {
  重置(种(true, false)) // 我 K=0.5，它 K=1.0
  await 模.跑本轮(造ctx({ E: 1, S: 0, P: 0 }), 真, 会话, 1, '回复'.repeat(400), 自报('E+9 S0 P0 | q1=0.5 q2=0.5'), '他说累')
  const s = 信()
  assert.equal(s.我.被否, 1)
  assert.equal(s.它.被否, 0)
  assert.equal(s.我.轮.at(-1).被否, true)
  assert.equal(s.它.轮.length, 5)
  assert.equal(池().双轨.最近.采用, '它')
})

test('采用我 → 它 被否 +1', async () => {
  重置(种(false, true)) // 我 1.0，它 0.5
  await 模.跑本轮(造ctx({ E: 1, S: 0, P: 0 }), 真, 会话, 1, '回复'.repeat(400), 自报('E+9 S0 P0 | q1=1 q2=1'), '他说累')
  const s = 信()
  assert.equal(s.它.被否, 1)
  assert.equal(s.我.被否, 0)
  assert.equal(池().双轨.最近.采用, '我')
})

test('中点 → 两本都不记被否（各记一条中点）', async () => {
  重置(种(false, false))
  await 模.跑本轮(造ctx({ E: 1, S: 0, P: 0 }), 真, 会话, 1, '回复'.repeat(400), 自报('E+1 S0 P0 | q1=1 q2=1'), '他说累')
  const s = 信()
  assert.equal(s.我.被否, 0)
  assert.equal(s.它.被否, 0)
  assert.equal(s.我.轮.at(-1).中点, true)
  assert.equal(s.它.轮.at(-1).中点, true)
})

test('不可靠：双方裁决度都 <0.6 → 两边各记不可靠、不算被否（0.6 阈值）', async () => {
  重置(种(true, true)) // 两边 K=0.5
  await 模.跑本轮(造ctx({ E: 1, S: 0, P: 0 }), 真, 会话, 1, '回复'.repeat(400), 自报('E+9 S0 P0 | q1=1 q2=1'), '他说累')
  const s = 信()
  assert.equal(s.我.轮.at(-1).不可靠, true)
  assert.equal(s.它.轮.at(-1).不可靠, true)
  assert.equal(s.我.被否, 0)
  assert.equal(s.它.被否, 0)
  assert.equal(池().双轨.最近.不可靠, true)
})

test('q 不进裁决：同一组点数，q1=0.2 与 q1=1 采用结果相同', async () => {
  重置(种(true, false))
  await 模.跑本轮(造ctx({ E: 1, S: 0, P: 0 }), 真, 会话, 1, '回复'.repeat(400), 自报('E+9 S0 P0 | q1=0.2 q2=0.5'), '他说累')
  const a = 池().双轨.最近
  重置(种(true, false))
  await 模.跑本轮(造ctx({ E: 1, S: 0, P: 0 }), 真, 会话, 2, '回复'.repeat(400), 自报('E+9 S0 P0 | q1=1 q2=0.5'), '他说累')
  const b = 池().双轨.最近
  assert.equal(a.采用, b.采用)
  assert.deepEqual(a.差值, b.差值)
  assert.ok(a.认知度.我 < b.认知度.我) // q 只影响写入幅度，不影响裁决
})

test('裁决度差 ≤0.05 → 即使超区间也取中点', () => {
  const r = 双.合成({ 点数: { E: 9, S: 0, P: 0 }, 裁决度: 1.0 }, { 点数: { E: 0, S: 0, P: 0 }, 裁决度: 0.97 }, 0.15)
  assert.equal(r.超区间, true)
  assert.equal(r.采用, '中点')
  assert.equal(r.中点, true)
})

test('两边都 ≥0.6 → 取裁决度高的；一方 <0.6 → 取另一方', () => {
  const a = 双.合成({ 点数: { E: 9, S: 0, P: 0 }, 裁决度: 0.9 }, { 点数: { E: 1, S: 0, P: 0 }, 裁决度: 0.6 }, 0.15)
  assert.equal(a.采用, '我')
  const b = 双.合成({ 点数: { E: 9, S: 0, P: 0 }, 裁决度: 0.59 }, { 点数: { E: 1, S: 0, P: 0 }, 裁决度: 0.8 }, 0.15)
  assert.equal(b.采用, '它')
  assert.equal(b.不可靠, false)
})

test('窗口 20：写 21 轮后只留 20 条，且 值 = 算K(轮)', async () => {
  重置(种(false, false))
  for (let i = 1; i <= 21; i++) {
    try { rmSync(join(目录, '情绪池.json.lock')) } catch {}
    await 模.跑本轮(造ctx({ E: 1, S: 0, P: 0 }), 真, 会话, i, '回复'.repeat(400), 自报('E+1 S0 P0 | q1=0.8 q2=0.6'), 'x')
  }
  const s = 信()
  assert.equal(s.我.轮.length, 20)
  assert.equal(s.我.值, 双.算K(s.我.轮).K)
})

test('迁移：旧 K 原样进 旧K，不参与计算；新账从 1.0 起', async () => {
  重置({ K: { c4b92d68: { 值: 1.175, 轮: [], 样本: 0, 错判: 3 } }, 最近: null })
  await 模.跑本轮(造ctx({ E: 1, S: 0, P: 0 }), 真, 会话, 1, '回复'.repeat(400), 自报('E+1 S0 P0 | q1=1 q2=1'), 'x')
  const p = 池()
  assert.equal(p.双轨.旧K.c4b92d68.值, 1.175)
  assert.notEqual(p.双轨.信誉.c4b92d68.我.值, 1.175)
})

test('分身认知度 = 它 K；我的认知度 = 我 K × q 部分', async () => {
  重置(种(false, false))
  await 模.跑本轮(造ctx({ E: 1, S: 0, P: 0 }), 真, 会话, 1, '回复'.repeat(400), 自报('E+1 S0 P0 | q1=0.5 q2=0.5'), 'x')
  const 观 = 池().双轨.最近
  assert.ok(Math.abs(观.认知度.它 - 1.0) < 1e-9)
  assert.ok(Math.abs(观.认知度.我 - 1 * 0.5 * (0.7 + 0.6 * 0.5)) < 1e-9)
  assert.equal(观.裁决度.我, 1.0)
})

test('q 缺省：取本轨近 20 轮均值；从没写过 → 0.7', async () => {
  重置(种(false, false))
  await 模.跑本轮(造ctx({ E: 1, S: 0, P: 0 }), 真, 会话, 1, '回复'.repeat(400), 自报('E+1 S0 P0 | q1=0.2 q2=0.4'), 'x')
  await 模.跑本轮(造ctx({ E: 1, S: 0, P: 0 }), 真, 会话, 2, '回复'.repeat(400), 自报('E+1 S0 P0'), 'x')
  const 观 = 池().双轨.最近
  assert.ok(Math.abs(观.认知度.q1 - 0.2) < 1e-9)
  assert.ok(Math.abs(观.认知度.q2 - 0.4) < 1e-9)
})
test('中点 delta = 平均点数 × 0.05 × 平均裁决度', () => {
  const r = 双.合成({ 点数: { E: 2, S: 0, P: 0 }, 裁决度: 1.0 }, { 点数: { E: 3, S: 0, P: 0 }, 裁决度: 0.8 }, 0.15)
  assert.equal(r.采用, '中点')
  assert.ok(Math.abs(r.delta.E - 2.5 * 0.05 * 0.9) < 1e-9, String(r.delta.E))
})

test('采用某轨 delta = 该轨点数 × 0.05 × 该轨裁决度', () => {
  const r = 双.合成({ 点数: { E: 2, S: 0, P: 0 }, 裁决度: 0.5 }, { 点数: { E: 9, S: 0, P: 0 }, 裁决度: 0.9 }, 0.15)
  assert.equal(r.采用, '它')
  assert.ok(Math.abs(r.delta.E - 9 * 0.05 * 0.9) < 1e-9, String(r.delta.E))
})

test('阈值边界：裁决度恰 0.6 算「不低」，不会被判成一方低', () => {
  const r = 双.合成({ 点数: { E: 9, S: 0, P: 0 }, 裁决度: 0.6 }, { 点数: { E: 1, S: 0, P: 0 }, 裁决度: 0.6 }, 0.15)
  assert.equal(r.不可靠, false)
  assert.equal(r.采用, '中点')
})
