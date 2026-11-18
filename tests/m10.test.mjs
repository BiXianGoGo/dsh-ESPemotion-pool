// 2026-11-09：桥注入的 user 话不经过 session/event 的 user/message，
// 要在 agent/inbox/inserted 上补捕，且来源头（【…】）不算「用户说的话」。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m10-'))
process.env.EMOTION_POOL_DIR = 目录

const 模块 = await import('../lib/index.js')

const 配置 = {
  启用: true,
  校验启用: false,
  校验每天上限: 50,
  校验只跑有自报的轮: true,
  提醒启用: false,
  每日衰减系数: 0.9,
  守恒上限: 1.0,
  写入者: ['c4b92d68'],
  注入启用: false,
  刻度: 1,
  刺阈值: 0.25,
  日志: ['情绪池-日志.md', '情绪池-日志.jsonl'],
}

const 会话id = 'session-c4b92d68-f40c-4fc3-ad69-f8338376753b'

function 空池() {
  return {
    rev: 0,
    updated: new Date().toISOString(),
    axes: { E: 0, S: 0, P: 0 },
    spine: { S: 0 },
    prev_cell: 'E0S0P0',
    events: [],
    结: [],
    stats: { selfreport_total: 0, missed_total: 0 },
    p_state: { 爽: { s: 1, a: 1, 最近: null }, 痛: { s: 1, a: 1, 最近: null } },
  }
}

function 起插件() {
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(空池(), null, 2))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify(配置, null, 2))

  let 收件 = null
  const 监听 = []
  const agent = {
    session: { id: 会话id },
    ctx: {
      on(名, fn) { if (名 === 'agent/inbox/inserted') 收件 = fn },
    },
  }
  const ctx = {
    on(_名, fn) { 监听.push(fn) },
    effect(fn) { fn(); return () => {} },
    webServer: { register() { return () => {} } },
    systemPrompt: { context: () => () => {} },
    llm: {},
    agents: { list: () => [agent] },
  }
  模块.apply(ctx)
  const 发 = (ev) => { for (const fn of 监听) fn({ id: 会话id }, ev) }
  return {
    注入: (t) => 收件 && 收件({ message: { role: 'user', content: [{ type: 'text', text: t }] } }),
    回话: (轮, t) => 发({ type: 'assistant/message', data: { turn: 轮, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: t }] } } }),
    池: () => JSON.parse(readFileSync(join(目录, '情绪池.json'), 'utf8')),
  }
}

test('桥注入的 user 话：注释带 [前 20 字]，且不把来源头算进去', () => {
  const p = 起插件()
  p.注入('【另一间会话递过来的】\n今天真的有点累')
  p.回话(1, '嗯，我陪着。\n<!-- EMO: E0 S+ P0 | q1=1 q2=0.5 | 陪着他 -->')
  const 事件 = 借(p)
  assert.equal(事件.note, '[今天真的有点累] 陪着他')
})

test('普通 user/message 路径不受影响（没有来源头就不剥）', () => {
  const p = 起插件()
  p.回话(1, '好。\n<!-- EMO: E0 S0 P0 | q1=1 q2=0.5 -->')
  // 没有用户话时，按 01:30 的新规写 [无用户话]（不留空）
  assert.equal(借(p).note, '[无用户话]')
})

function 借(p) { return p.池().events[0] }
