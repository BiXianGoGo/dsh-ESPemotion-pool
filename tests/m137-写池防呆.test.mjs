// 0.2.5 写池防呆：分片事件只许新增或原地更新，任何情况下不许变少
// 2026-11-16 事故：配置写短号、分片里是全长 sid，写池按 sid 过滤后把 49 条写成 1 条
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m137-'))
process.env.EMOTION_POOL_DIR = 目录
const M = await import('../lib/index.js')
const 今 = () => new Date().toISOString()
const P = (...a) => join(目录, '情绪池', ...a)
const S1 = 'aaaaaaaa', S2 = 'bbbbbbbb'
const 全1 = 'session-aaaaaaaa-1111-2222-3333-444455556666'

function 重置(组, 分片) {
  rmSync(P('会话'), { recursive: true, force: true })
  rmSync(P('池'), { recursive: true, force: true })
  mkdirSync(P('会话'), { recursive: true })
  mkdirSync(P('池'), { recursive: true })
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify({ 启用: true, 存储模式: '分片', 注入启用: true, 写入者: [S1, S2], 组 }, null, 2))
  writeFileSync(P('总.json'), JSON.stringify({ rev: 7, updated: 今(), 已迁移到池: true, 组, events: [] }, null, 2))
  for (const [短, 事件] of Object.entries(分片)) {
    writeFileSync(P('会话', 短 + '.json'), JSON.stringify({ version: 1, sid: 短, 短, rev: 7, 事件, 结: [], 快照: {}, 状态: {} }, null, 2))
  }
}
const 事 = (sid, turn) => ({ t: 今(), sid, turn, delta_raw: { E: 0.2, S: 0, P: 0 }, note: 'n' })
const 读会话 = (短) => JSON.parse(readFileSync(P('会话', 短 + '.json'), 'utf8'))
const 写池文 = (名, o) => writeFileSync(P('池', 名 + '.json'), JSON.stringify(o, null, 2))
const 空池文 = { rev: 1, axes: { E: 0, S: 0, P: 0 }, spine: { E: 0, S: 0, P: 0 }, 快照启用: true, 会话快照: {} }

test('配置短号 + 分片全长 sid：写池不许把事件写丢', () => {
  重置([{ 名: '甲池', 会话: [S1] }], {
    [S1]: [事(S1, 1), 事(全1, 2), 事(全1, 3), 事(全1, 4)],
  })
  写池文('甲池', 空池文)
  M.推轴(全1, { E: 0.5, S: 0, P: 0 }, 5, JSON.parse(readFileSync(join(目录, '情绪池配置.json'), 'utf8')))
  const 本 = 读会话(S1)
  assert.ok(本.事件.length >= 4, '写池后分片条数不许变少，实际 ' + 本.事件.length)
  assert.ok(本.事件.some((e) => e.sid === 全1 && Number(e.turn) === 5), '新事件要写进去')
})

test('两会话池：写甲池后两边事件数都不变少', () => {
  重置([{ 名: '甲池', 会话: [S1] }, { 名: '乙池', 会话: [S2] }], {
    [S1]: [事(S1, 1), 事(S1, 2)],
    [S2]: [事(S2, 1), 事(S2, 2), 事(S2, 3)],
  })
  写池文('甲池', 空池文)
  写池文('乙池', 空池文)
  const 配 = () => JSON.parse(readFileSync(join(目录, '情绪池配置.json'), 'utf8'))
  M.推轴(S1, { E: 0.5, S: 0, P: 0 }, 3, 配())
  assert.equal(读会话(S1).事件.length, 3)
  assert.equal(读会话(S2).事件.length, 3, '乙池不许被连带写少')
})

test('分片里混着别人的事件：条数会变少时拒写并抛错，文件原样不动', () => {
  重置([{ 名: '甲池', 会话: [S1] }], {
    [S1]: [事(S2, 1), 事(S2, 2)],
  })
  写池文('甲池', 空池文)
  const 前 = readFileSync(P('会话', S1 + '.json'), 'utf8')
  assert.throws(
    () => M.推轴(S1, { E: 0.5, S: 0, P: 0 }, 3, JSON.parse(readFileSync(join(目录, '情绪池配置.json'), 'utf8'))),
    /写池拦截/,
  )
  assert.equal(readFileSync(P('会话', S1 + '.json'), 'utf8'), 前, '被拦截时分片必须一个字节都不动')
})
