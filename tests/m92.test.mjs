// 旧链退役：自报兜底推轴（无轨迹轮）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m92-'))
process.env.EMOTION_POOL_DIR = 目录
const 模 = await import('../lib/index.js')
const 会话 = 'session-c4b92d68-f40c-4fc3-ad69-f8338376753b'
const 今 = new Date().toISOString().slice(0, 10)

function 起(补 = {}) {
  const 池 = {
    rev: 5, updated: new Date().toISOString(), axes: { E: 0, S: 0, P: 0 },
    spine: { E: 0, S: 0, P: 0 }, overflow: { E: 0, S: 0, P: 0 },
    prev_cell: 'E0S0P0', events: [], 结: [], 组零点: {}, 组六头: {}, 未归组: 0,
    六头迁移: { at: new Date().toISOString(), 旧总: 0 },
    零点迁移: { at: new Date().toISOString(), 归组: '常用聊天组', 旧零点: { E: 0, S: 0, P: 0 } },
    快照启用: true, 会话快照: { c4b92d68: {
      E: { x: 0, t: new Date().toISOString(), τ: 12 },
      S: { x: 0, t: new Date().toISOString(), τ: 12 },
      P: { x: 0, t: new Date().toISOString(), τ: 12 },
    } },
    p_state: { 爽: { s: 1, a: 1, 最近: null }, 痛: { s: 1, a: 1, 最近: null } },
    streak: {}, ...补,
  }
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(池, null, 2))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify({ 启用: true, 组: [{ 名: '常用聊天组', 会话: ['c4b92d68'] }] }, null, 2))
  return 池
}
function 读() {
  return JSON.parse(readFileSync(join(目录, '情绪池.json'), 'utf8'))
}

test('兜底：无轨迹轮用自报 delta_raw 推轴，来源=自报兜底', async () => {
  起({ events: [{ id: 'e1', t: new Date().toISOString(), delta_raw: { E: 0.5, S: 0, P: 0 }, note: 'x', sid: 会话, turn: 3 }] })
  const r = await 模.自报兜底推轴(会话, 3)
  assert.ok(r && !r.跳过)
  const 池 = 读()
  assert.ok(Math.abs(池.axes.E - 0.2) < 1e-6, String(池.axes.E))
  assert.equal(池.推轴来源, '自报兜底')
  assert.equal(Number(池.兜底轮), 3)
})

test('兜底互斥：同一轮第二次调用不再推', async () => {
  起({ events: [{ id: 'e1', t: new Date().toISOString(), delta_raw: { E: 0.5, S: 0, P: 0 }, note: 'x', sid: 会话, turn: 4 }] })
  await 模.自报兜底推轴(会话, 4)
  const 一 = 读().axes.E
  const r2 = await 模.自报兜底推轴(会话, 4)
  assert.equal(r2, null)
  assert.ok(Math.abs(读().axes.E - 一) < 1e-9)
})

test('兜底路径：六头/溢出/零点都记', async () => {
  起({
    events: [{ id: 'e1', t: new Date().toISOString(), delta_raw: { E: 9, S: 0, P: 0 }, note: 'x', sid: 会话, turn: 5 }],
    刺: [{ t: new Date().toISOString(), 轴: 'E', 值: 0.6, 注: 'x', sid: 会话, turn: 1 }],
    组六头: { '常用聊天组': { 'E+': { 累计: 6, 桶: [{ d: 今, n: 6 }] } } },
    组零点: { '常用聊天组': { E: 0, S: 0, P: 0 } },
  })
  await 模.自报兜底推轴(会话, 5, { 启用: true, 组: [{ 名: '常用聊天组', 会话: ['c4b92d68'] }] })
  const 池 = 读()
  assert.ok(池.溢出.E.v > 0.05, JSON.stringify(池.溢出))
  assert.ok(池.组六头['常用聊天组']['E+'].累计 >= 7, JSON.stringify(池.组六头))
  const 源2 = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
  assert.ok(源2.includes('应用零点(子, 判零点(子, 配, 结, 最高, now)'))
})

test('旧链：源码里已无 自报推轴 / 旧链 分支', async () => {
  const { readFileSync } = await import('node:fs')
  const 源 = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
  assert.equal(源.includes('自报推轴'), false)
  assert.equal(源.includes('旧链（自报推轴）'), false)
  assert.ok(源.includes('if (波动.length) {'))
  assert.ok(源.includes('自报兜底'))
})
