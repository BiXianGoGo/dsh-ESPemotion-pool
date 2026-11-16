// M27 验收：双轨校验（一致 / 单轴分歧 / 三轴分歧 / 分歧率 40% 报警 / 冷却 / 非法 JSON）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m27-'))
process.env.EMOTION_POOL_DIR = 目录
process.env.QQ_BRIDGE_PATH = join(目录, 'qq-bridge-config.json')
const 模块 = await import('../lib/index.js')

const 基础配置 = {
  启用: true,
  校验启用: false,
  校验每天上限: 50,
  校验只跑有自报的轮: true,
  提醒启用: false,
  // 2026-11-11 11:10: 总闸改成读不到就别发；这条用例验的是报警真的会发，夹具显式打开。
  QQ报警: true,
  每日衰减系数: 0.9,
  守恒上限: 1.0,
  写入者: ['aaaaaaaa'],
  注入启用: false,
  刻度: 1,
  双轨校验: true,
  一致阈值: 0.1,
  报警阈值: 0.4,
  报警冷却小时: 24,
  日志: ['情绪池-日志.md', '情绪池-日志.jsonl'],
}

const 会话 = { id: 'session-aaaaaaaa-f40c-4fc3-ad69-f8338376753b' }
const 发送 = []
globalThis.fetch = async (url, opts) => {
  发送.push({ url: String(url), body: opts && opts.body ? String(opts.body) : '' })
  return { json: async () => ({ status: 'ok', retcode: 0 }) }
}

function 重置(改 = {}) {
  writeFileSync(join(目录, 'qq-bridge-config.json'), JSON.stringify({ NapCat: 'http://127.0.0.1:3000', 私聊QQ: 123456789, 令牌: '' }), 'utf8')
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify({ rev: 0, axes: { E: 0, S: 0, P: 0 }, spine: { S: 0 }, prev_cell: 'E0S0P0', events: [], stats: { selfreport_total: 0, missed_total: 0 } }, null, 2))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify({ ...基础配置, ...改 }, null, 2))
  for (const f of ['情绪池-分歧.jsonl', '情绪池-双轨计数.json', '情绪池-日志.md', '情绪池-日志.jsonl', '情绪池.json.lock']) {
    const p = join(目录, f)
    if (existsSync(p)) rmSync(p)
  }
  发送.length = 0
}

function 起(答) {
  const ctx = {
    llm: {
      async *stream() {
        for (const ch of String(答)) yield { type: 'text-delta', text: ch }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    },
    agents: { list: () => [{ options: { provider: 'fake', model: 'fake-1' } }] },
  }
  return ctx
}

function 答(轴, 依据 = '看起来是') {
  return JSON.stringify({ E: 轴.E, S: 轴.S, P: 轴.P, 依据 })
}

const 我 = { E: 0.15, S: -0.15, P: 0 }

test('一致：三轴都在 ±0.10 内 → 不记分歧', async () => {
  重置()
  const r = await 模块.跑双轨(起(答({ E: 0.05, S: -0.1, P: 0 })), 会话, 1, '嗯，我在。', 我, '陪他', '你在吗')
  assert.equal(r.分歧, false)
  assert.equal(模块.双轨统计().样本, 1)
  assert.equal(模块.双轨统计().分歧, 0)
  assert.deepEqual(模块.读分歧(10), [])
})

test('单轴分歧：E 差 0.25 → 记一条，不改数', async () => {
  重置()
  const r = await 模块.跑双轨(起(答({ E: -0.1, S: -0.15, P: 0 }, '像在退开')), 会话, 2, '我没事。', 我, '怕他担心', '今天有点累')
  assert.equal(r.分歧, true)
  const 条 = 模块.读分歧(10)
  assert.equal(条.length, 1)
  assert.equal(条[0].我的.E, 0.15)
  assert.equal(条[0].它的.E, -0.1)
  assert.equal(条[0].我的依据, '怕他担心')
  assert.equal(条[0].它的依据, '像在退开')
})

test('三轴分歧 → 一条记录里三轴都在', async () => {
  重置()
  const r = await 模块.跑双轨(起(答({ E: -0.3, S: 0.3, P: -0.3 })), 会话, 3, '…', 我, '说实话', '今天有点累')
  assert.equal(r.分歧, true)
  const 条 = 模块.读分歧(10)
  assert.equal(条.length, 1)
  assert.deepEqual(条[0].它的, { E: -0.3, S: 0.3, P: -0.3 })
})

test('分歧率刚好 40%（2/5）→ 报警一次并私聊', async () => {
  重置()
  const 一致 = 答({ E: 0.1, S: -0.15, P: 0 })
  const 分歧 = 答({ E: -0.2, S: 0.2, P: 0 }, '语气不对')
  await 模块.跑双轨(起(分歧), 会话, 11, 'a', 我, '', '他')
  await 模块.跑双轨(起(一致), 会话, 12, 'b', 我, '', '他')
  await 模块.跑双轨(起(一致), 会话, 13, 'c', 我, '', '他')
  await 模块.跑双轨(起(一致), 会话, 14, 'd', 我, '', '他')
  const r = await 模块.跑双轨(起(分歧), 会话, 15, 'e', 我, '', '他')
  assert.equal(r.率, 0.4)
  assert.equal(r.报警, true)
  assert.equal(发送.length, 1)
  assert.match(发送[0].url, /send_private_msg$/)
  const 体 = JSON.parse(发送[0].body)
  assert.equal(体.user_id, 123456789)
  assert.match(体.message[0].data.text, /分歧率 40%/)
  assert.match(体.message[0].data.text, /不一致只记录/)
})

test('冷却：24 小时内已经报过 → 不再发', async () => {
  重置()
  writeFileSync(join(目录, '情绪池-双轨计数.json'), JSON.stringify({ 记录: [], 报警上次: new Date().toISOString() }))
  const 一致 = 答({ E: 0.1, S: -0.15, P: 0 })
  const 分歧 = 答({ E: -0.2, S: 0.2, P: 0 })
  for (let i = 0; i < 5; i += 1) {
    await 模块.跑双轨(起(i < 2 ? 分歧 : 一致), 会话, 20 + i, 'x', 我, '', '他')
  }
  assert.equal(模块.双轨统计().分歧率, 0.4)
  assert.equal(发送.length, 0)
})

test('非法 JSON → 跳过，不计入分母', async () => {
  重置()
  const r = await 模块.跑双轨(起('我觉得他有点难过'), 会话, 30, 'x', 我, '', '他')
  assert.equal(r.跳过, '非法JSON')
  assert.equal(模块.双轨统计().样本, 0)
  assert.deepEqual(模块.读分歧(10), [])
})

test('开关关掉 → 一次也不跑', async () => {
  重置({ 双轨校验: false })
  const r = await 模块.跑双轨(起(答({ E: 0, S: 0, P: 0 })), 会话, 31, 'x', 我, '', '他')
  assert.equal(r.跳过, '关闭')
  assert.equal(模块.双轨统计().样本, 0)
})