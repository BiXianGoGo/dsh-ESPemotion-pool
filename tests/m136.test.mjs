// 0.2.5 池化：一池一份状态，会话事件仍按分片存
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m136-'))
process.env.EMOTION_POOL_DIR = 目录
const M = await import('../lib/index.js')
const S1 = 'aaaaaaaa', S2 = 'bbbbbbbb', S9 = 'cccccccc'
const 今 = () => new Date().toISOString()
const P = (...a) => join(目录, '情绪池', ...a)

function 重置() {
  rmSync(P('会话'), { recursive: true, force: true })
  rmSync(P('池'), { recursive: true, force: true })
  mkdirSync(P('会话'), { recursive: true })
  mkdirSync(P('池'), { recursive: true })
  const 组 = [{ 名: '甲池', 会话: [S1] }, { 名: '乙池', 会话: [S2] }]
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify({ 启用: true, 存储模式: '分片', 注入启用: true, 写入者: [S1, S2], 组 }, null, 2))
  writeFileSync(P('总.json'), JSON.stringify({ rev: 7, updated: 今(), 已迁移到池: true, 组, events: [] }, null, 2))
  const 本 = (sid) => ({ version: 1, sid, 短: sid, rev: 7, 事件: [{ t: 今(), sid, turn: 1, delta_raw: { E: 0.5, S: 0, P: 0 }, note: 'n' }], 结: [], 快照: {}, 状态: {} })
  writeFileSync(P('会话', S1 + '.json'), JSON.stringify(本(S1), null, 2))
  writeFileSync(P('会话', S2 + '.json'), JSON.stringify(本(S2), null, 2))
}
const 配 = () => JSON.parse(readFileSync(join(目录, '情绪池配置.json'), 'utf8'))
const 读池文 = (名) => JSON.parse(readFileSync(P('池', 名 + '.json'), 'utf8'))
const 写池文 = (名, o) => writeFileSync(P('池', 名 + '.json'), JSON.stringify(o, null, 2))

test('池名：按组把 sid 映射到池名', () => {
  重置()
  assert.equal(M.池名(配(), S1), '甲池')
  assert.equal(M.池名(配(), S2), '乙池')
  assert.equal(M.池名(配(), S9), '')
})

test('池视图：事件只取本池会话的分片', () => {
  重置()
  const a = M.池视图(配(), '甲池')
  assert.equal(a.events.length, 1)
  assert.equal(a.events[0].sid, S1)
  const b = M.池视图(配(), '乙池')
  assert.equal(b.events.length, 1)
  assert.equal(b.events[0].sid, S2)
})

test('推轴只动本池：甲池涨、乙池不动', () => {
  重置()
  写池文('甲池', { rev: 1, axes: { E: 0, S: 0, P: 0 }, spine: { E: 0, S: 0, P: 0 }, 快照启用: true, 会话快照: {} })
  写池文('乙池', { rev: 1, axes: { E: 0, S: 0, P: 0 }, spine: { E: 0, S: 0, P: 0 }, 快照启用: true, 会话快照: {} })
  // §27.3 夹子（2026-11-16 A+D 单）：单轮 Δ 上限 0.30，用 0.5 的点让 k=0.4 落在夹子内
  const r = M.推轴(S1, { E: 0.5, S: 0, P: 0 }, 2, 配())
  assert.ok(Math.abs(r.轴.E - 0.2) < 1e-6, JSON.stringify(r.轴))
  assert.ok(Math.abs(读池文('甲池').axes.E - 0.2) < 1e-6)
  assert.equal(读池文('乙池').axes.E, 0)
  assert.equal(M.池视图(配(), '甲池').events.length, 2)
})

test('未归池：迁移后不统计、不写池', () => {
  重置()
  const r = M.推轴(S9, { E: 1, S: 0, P: 0 }, 3, 配())
  assert.equal(r.未归池, true)
})

test('落池写回：推轴后池文件与分片都更新', () => {
  重置()
  写池文('甲池', { rev: 1, axes: { E: 0, S: 0, P: 0 }, spine: { E: 0, S: 0, P: 0 }, 快照启用: true, 会话快照: {} })
  const 前 = 读池文('甲池').axes.E
  M.推轴(S1, { E: 0.5, S: 0, P: 0 }, 4, 配())
  assert.ok(读池文('甲池').axes.E > 前)
  assert.ok(M.池视图(配(), '甲池').events.some((e) => Number(e.turn) === 4))
})

