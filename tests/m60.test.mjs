import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m60-'))
process.env.EMOTION_POOL_DIR = 目录
const M = await import('../lib/index.js?m60=' + Date.now())

function 起(行为) {
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify({ rev: 0, updated: new Date().toISOString(), axes: { E: 0, S: 0, P: 0 }, spine: { E: 0, S: 0, P: 0 }, prev_cell: 'E0S0P0', events: [], 结: [], streak: {}, 结窗: {}, stats: { selfreport_total: 0, missed_total: 0 }, p_state: { 爽: { s: 1, a: 1, 最近: null }, 痛: { s: 1, a: 1, 最近: null } } }))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify({ 启用: true, 写入者: ['aaaaaaaa'], 刻度: 1, 日志: ['情绪池-日志.md'] }))
  const 出们 = Array.isArray(行为) ? 行为.slice() : null
  const ctx = {
    on() {}, effect(fn) { fn(); return () => {} },
    webServer: { register() { return () => {} } },
    systemPrompt: { context: () => () => {} },
    agents: { list: () => [] },
    llm: { async *stream(req) { if (行为 === 'throwTimeout') { const e = new Error('request timeout 30000ms'); e.name = 'TimeoutError'; throw e } if (行为 === 'throw') throw new Error('boom 坏了') ; const 本 = 出们 ? (出们.length ? 出们.shift() : '') : 行为; for (const 文 of (Array.isArray(本) ? 本 : [本])) yield { type: 'text-delta', text: 文 }; yield { type: 'finish', reason: { kind: 'stop' } } } },
  }
  M.apply(ctx)
  return ctx
}
const 会 = { id: 'session-aaaaaaaa-1111', agent: { session: { id: 'session-aaaaaaaa-1111', requestHeader: () => ({ config: { provider: 'p', model: 'm' } }) } } }
const 计 = () => JSON.parse(readFileSync(join(目录, '情绪池-轨迹计数.json'), 'utf8'))

test('无思考：进近20轮计数，不进失败明细', async () => {
  const ctx = 起(['x'])
  await M.跑轨迹(ctx, 会, 'session-aaaaaaaa-1111', 1, '   ')
  const 摘 = M.轨迹摘要()
  assert.equal(摘.近20轮.无思考, 1)
  assert.equal(摘.失败明细.length, 0)
})

test('JSON坏：原因 + 20 字片段 + 片段来源=模型', async () => {
  const ctx = 起(['不是 JSON 的一长串原文' + 'x'.repeat(40), '还是不是 JSON'])
  await M.跑轨迹(ctx, 会, 'session-aaaaaaaa-1111', 2, '第一段内容。第二段内容')
  const 条 = 计().轮.at(-1)
  assert.equal(条.原因, 'JSON坏')
  assert.equal(条.片段来源, '模型')
  assert.ok(条.片段.length <= 20)
  assert.ok(条.片段.includes('JSON'))
  const 明 = M.轨迹摘要().失败明细
  assert.equal(明[0].轮, 2)
  assert.equal(明[0].原因, 'JSON坏')
  assert.ok(明[0].片段.length <= 20)
})

test('注太短：两次都不合格，记注太短', async () => {
  const ctx = 起(['{"点":[{"i":1,"E":0.1,"S":0,"P":0,"注":"x"}]}', '{"点":[{"i":1,"E":0.1,"S":0,"P":0,"注":"y"}]}'])
  await M.跑轨迹(ctx, 会, 'session-aaaaaaaa-1111', 3, '第一段内容。第二段内容')
  assert.equal(计().轮.at(-1).原因, '注太短')
})

test('超时：按错误类型记超时，片段来源=错误', async () => {
  const ctx = 起('throwTimeout')
  await M.跑轨迹(ctx, 会, 'session-aaaaaaaa-1111', 4, '第一段内容。第二段内容')
  const 条 = 计().轮.at(-1)
  assert.equal(条.原因, '超时')
  assert.equal(条.片段来源, '错误')
  assert.ok(条.片段.includes('timeout'))
})

test('空回答算调用失败，片段写「空回答」', async () => {
  const ctx = 起([''])
  await M.跑轨迹(ctx, 会, 'session-aaaaaaaa-1111', 5, '第一段内容。第二段内容')
  const 条 = 计().轮.at(-1)
  assert.equal(条.原因, '调用失败')
  assert.equal(条.片段, '空回答')
  assert.equal(条.片段来源, '错误')
})

test('失败明细只取最近 5 条，且按时间倒序', async () => {
  const ctx = 起(['no json'])
  for (let i = 10; i < 18; i++) await M.跑轨迹(ctx, 会, 'session-aaaaaaaa-1111', i, '第一段内容。第二段内容')
  const 明 = M.轨迹摘要().失败明细
  assert.equal(明.length, 5)
  assert.deepEqual(明.map((x) => x.轮), [17, 16, 15, 14, 13])
})

test('波动阈值：设置里 0.05–0.5、步进 0.01，越界 400', () => {
  const 项 = M.设置清单().find((x) => x.键 === '波动阈值')
  assert.ok(项)
  assert.deepEqual(项.范围, [0.05, 0.5])
  assert.equal(项.步进, 0.01)
  assert.ok(M.设置表().find((x) => x.键 === '波动阈值').步进 === 0.01)
  assert.equal(M.校验设置('波动阈值', 0.049).错误 != null, true)
  assert.equal(M.校验设置('波动阈值', 0.501).错误 != null, true)
  assert.equal(M.校验设置('波动阈值', 0.05).值, 0.05)
  assert.equal(M.校验设置('波动阈值', 0.5).值, 0.5)
  assert.equal(M.写设置('波动阈值', 0.501).码, 400)
  assert.equal(M.写设置('波动阈值', 0.2).ok, true)
})