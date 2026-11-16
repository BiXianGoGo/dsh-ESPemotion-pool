// 0.2.5 A+D（2026-11-16 策划间拍板）：推轴也吃 §27.3 的 |Δ_实| ≤ 0.30 夹子，
// 推轴事件补写 观测{采用,系数,分歧,偏移,K} 与 夹断:[轴…]。
// 复现来源：turn 640，分身给 −9..9 整数点（E1 S3 P2 / … / E0 S2 P3），
// 被当 ±1 坐标直接推轴，Δ 到 S0.373 / P0.565，把测试组顶到 S45/P47。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m138-'))
process.env.EMOTION_POOL_DIR = 目录
const M = await import('../lib/index.js')
const 今 = () => new Date().toISOString()
const P = (...a) => join(目录, '情绪池', ...a)
const S1 = 'cccccccc'
const 空池文 = { rev: 1, axes: { E: 0, S: 0, P: 0 }, spine: { E: 0, S: 0, P: 0 }, 快照启用: true, 会话快照: {} }

function 重置() {
  rmSync(P('会话'), { recursive: true, force: true })
  rmSync(P('池'), { recursive: true, force: true })
  rmSync(join(目录, '情绪池-日志.md'), { force: true })
  mkdirSync(P('会话'), { recursive: true })
  mkdirSync(P('池'), { recursive: true })
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify({ 启用: true, 存储模式: '分片', 写入者: [S1], 组: [{ 名: '甲池', 会话: [S1] }] }, null, 2))
  writeFileSync(P('总.json'), JSON.stringify({ rev: 1, updated: 今(), 已迁移到池: true, 组: [{ 名: '甲池', 会话: [S1] }], events: [] }, null, 2))
  writeFileSync(P('池', '甲池.json'), JSON.stringify(空池文, null, 2))
  writeFileSync(P('会话', S1 + '.json'), JSON.stringify({ version: 1, sid: S1, 短: S1, rev: 1, 事件: [], 结: [], 快照: {}, 状态: {} }, null, 2))
}

const 读池 = () => JSON.parse(readFileSync(P('池', '甲池.json'), 'utf8'))
const 读事 = () => JSON.parse(readFileSync(P('会话', S1 + '.json'), 'utf8')).事件 || []
const 读日志 = () => readFileSync(join(目录, '情绪池-日志.md'), 'utf8')

test('分身超限点被夹到 0.30：Δ 不许超过，事件带 夹断 与 观测', () => {
  重置()
  // 场景复刻 turn 640：波动末点 {E0,S2,P3}，系数 0.5 → k=0.2，未夹时应为 S0.4 / P0.6
  const r = M.推轴(S1, { E: 0, S: 2, P: 3 }, 640, JSON.parse(readFileSync(join(目录, '情绪池配置.json'), 'utf8')), {
    系数: 0.5, 分歧: true, 偏移: 1.5611, 来源: '分身', 采用: '它', K: { 我: 1, 它: 1 },
  })
  for (const k of ['E', 'S', 'P']) {
    assert.ok(Math.abs(r.推[k]) <= 0.3 + 1e-12, `${k} 的 Δ 超了 0.30：${r.推[k]}`)
    assert.ok(Math.abs(r.轴[k]) <= 0.3 + 1e-12, `${k} 的轴超了 0.30：${r.轴[k]}`)
  }
  assert.ok(r.推.S > 0.29 && r.推.P > 0.29, '该夹的仍要推足 0.30，不许夹成 0')

  const 事 = 读事().find((e) => Number(e.turn) === 640)
  assert.ok(事, '推轴事件要落账')
  assert.deepEqual(事.夹断, ['S', 'P'])
  assert.equal(事.观测.采用, '它')
  assert.equal(事.观测.系数, 0.5)
  assert.equal(事.观测.分歧, true)
  assert.equal(事.观测.偏移, 1.5611)
  assert.deepEqual(事.观测.K, { 我: 1, 它: 1 })

  const 日志 = 读日志()
  assert.match(日志, /夹断 轴=S 原=0\.\d+ 夹后=0\.3/)
  assert.match(日志, /夹断 轴=P 原=0\.\d+ 夹后=0\.3/)
})

test('没超限就不夹、不写 夹断，观测照样写', () => {
  重置()
  const r = M.推轴(S1, { E: 0.2, S: 0, P: 0 }, 641, JSON.parse(readFileSync(join(目录, '情绪池配置.json'), 'utf8')), {
    系数: 1, 来源: '轨迹', 采用: '加权', 偏移: 0.02, K: { 我: 0.9, 它: 0.7 },
  })
  assert.ok(Math.abs(r.推.E - 0.08) < 1e-9, String(r.推.E))
  const 事 = 读事().find((e) => Number(e.turn) === 641)
  assert.equal(事.夹断, undefined)
  assert.equal(事.观测.采用, '加权')
  assert.deepEqual(事.观测.K, { 我: 0.9, 它: 0.7 })
  assert.doesNotMatch(读日志(), /夹断/)
})
