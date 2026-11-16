// M28 验收：定名 / 未命名 / 回忆档位 / 归档 / 面板清·折
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m28-'))
process.env.EMOTION_POOL_DIR = 目录
const 模 = await import('../lib/index.js')

const 配置 = {
  启用: true, 校验启用: false, 校验每天上限: 50, 校验只跑有自报的轮: true, 提醒启用: false,
  每日衰减系数: 0.9, 守恒上限: 1.0, 写入者: ['aaaaaaaa'], 注入启用: false, 刺阈值: 0.25,
  双轨校验: true, 一致阈值: 0.1, 报警阈值: 0.4, 报警冷却小时: 24,
  日志: ['情绪池-日志.md', '情绪池-日志.jsonl'],
}
function 空池() {
  return { rev: 0, updated: new Date().toISOString(), axes: { E: 0, S: 0, P: 0 }, spine: { S: 0 }, prev_cell: 'E0S0P0', events: [], 结: [], stats: { selfreport_total: 0, missed_total: 0 } }
}
function 重置(池 = 空池()) {
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(池, null, 2))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify(配置, null, 2))
}

test('抽定名：带 · 取整句；常见词取词；普通句 null', () => {
  assert.equal(模.抽定名('这段时间·悬着'), '这段时间·悬着')
  assert.equal(模.抽定名('有点悬心'), '悬心')
  assert.equal(模.抽定名('就普通两句话'), null)
  assert.equal(模.抽定名(''), null)
})

test('回忆=true 按档位系数算，不按事件年龄', () => {
  const e = { t: new Date().toISOString(), delta_raw: { E: 0, S: 0.15, P: 0 }, 回忆: true, 档位: '上次' }
  const r = 模.现值({ events: [e], spine: {} })
  assert.ok(Math.abs(r.轴.S - 0.105) < 1e-9, String(r.轴.S))
})

test('回忆=false 按年龄系数（现在≈1.0）', () => {
  const e = { t: new Date().toISOString(), delta_raw: { E: 0, S: 0.15, P: 0 }, 回忆: false }
  const r = 模.现值({ events: [e], spine: {} })
  assert.ok(Math.abs(r.轴.S - 0.15) < 1e-6, String(r.轴.S))
})

test('归档：作废结 + 7 天前事件挪进归档 jsonl，池清空对应项', () => {
  const 旧 = new Date(Date.now() - 8 * 86400000).toISOString()
  const 新 = new Date().toISOString()
  重置({ ...空池(), 刺: [
    { t: 新, 轴: 'S', 值: 0.05, 作废: true, 注: '旧小结' },
    { t: 新, 轴: 'S', 值: 0.6, 注: '有效结' },
  ], events: [
    { t: 旧, delta_raw: { E: 0.1, S: 0, P: 0 }, note: '旧的' },
    { t: 新, delta_raw: { E: 0.1, S: 0, P: 0 }, note: '新的' },
  ] })
  const r = 模.归档旧项()
  assert.equal(r.ok, true)
  assert.equal(r.结, 1)
  assert.equal(r.事件, 1)
  assert.ok(existsSync(r.文件))
  const 行 = readFileSync(r.文件, 'utf8').split('\n').filter(Boolean)
  assert.equal(行.length, 2)
  const 池 = 模.读池()
  assert.equal(池.结.length, 1)
  assert.equal(池.结[0].注, '有效结')
  assert.equal(池.events.length, 1)
  assert.equal(池.events[0].note, '新的')
})

test('双轨：回忆=true 给该轮事件盖回忆/档位', async () => {
  const 轮 = 77
  const sid = 'session-aaaaaaaa-f40c-4fc3-ad69-f8338376753b'
  const e = { t: new Date().toISOString(), delta_raw: { E: 0.15, S: -0.15, P: 0 }, note: '[他说累] 陪他', sid, turn: 轮 }
  重置({ ...空池(), events: [e] })
  const ctx = {
    llm: { async *stream() { for (const ch of JSON.stringify({ E: 0.15, S: -0.15, P: 0, 依据: '像在陪', 回忆: true, 档位: '上次' })) yield { type: 'text-delta', text: ch }; yield { type: 'finish', reason: { kind: 'stop' } } } },
    agents: { list: () => [{ options: { provider: 'fake', model: 'f' } }] },
  }
  const r = await 模.跑双轨(ctx, { id: sid }, 轮, '我记得上次你说过。'.repeat(60), { E: 0.15, S: -0.15, P: 0 }, '陪他', '今天有点累')
  assert.equal(r.回忆, true)
  assert.equal(r.档位, '上次')
  const 池 = 模.读池()
  assert.equal(池.events[0].回忆, true)
  assert.equal(池.events[0].档位, '上次')
})

test('面板源码有「显示作废 / 归档到文件 / 折叠 / 含作废」', () => {
  const 文 = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
  for (const k of ['显示作废', '归档到文件', 'h3.折', '含作废=1', '/dsh-emotion-pool/archive']) assert.ok(文.includes(k), k)
})