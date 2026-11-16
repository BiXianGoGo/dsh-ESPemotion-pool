import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m52-'))
process.env.EMOTION_POOL_DIR = 目录
const M = await import('../lib/index.js?m52=' + Date.now())

function 起(llmOut = '{"点":[{"i":1,"E":0.3,"S":0,"P":-0.2,"注":"在替他找理由"}]}', 次 = 1) {
  const 出们 = Array.isArray(llmOut) ? llmOut.slice() : null
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify({ rev: 0, updated: new Date().toISOString(), axes: { E: 0, S: 0, P: 0 }, spine: { E: 0, S: 0, P: 0 }, prev_cell: 'E0S0P0', events: [], 结: [], streak: {}, 结窗: {}, stats: { selfreport_total: 0, missed_total: 0 }, p_state: { 爽: { s: 1, a: 1, 最近: null }, 痛: { s: 1, a: 1, 最近: null } } }))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify({ 启用: true, 写入者: ['aaaaaaaa'], 刻度: 1, 日志: ['情绪池-日志.md'] }))
  let 调 = 0
  const ctx = {
    on() {}, effect(fn) { fn(); return () => {} },
    webServer: { register() { return () => {} } },
    systemPrompt: { context: () => () => {} },
    agents: { list: () => [] },
    llm: {
      async *stream() {
        调++
        const 本 = 出们 ? (出们.length ? 出们.shift() : '') : llmOut
        for (let k = 0; k < 次; k++) yield { type: 'text-delta', text: 本 }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    },
  }
  M.apply(ctx)
  return { ctx, 调: () => 调 }
}
const 会 = { id: 'session-aaaaaaaa-1111', agent: { session: { id: 'session-aaaaaaaa-1111', requestHeader: () => ({ config: { provider: 'p', model: 'm' } }) } } }
const 计 = () => JSON.parse(readFileSync(join(目录, '情绪池-轨迹计数.json'), 'utf8'))
const 轨迹文件 = () => (existsSync(join(目录, '情绪池-思考轨迹')) ? readdirSync(join(目录, '情绪池-思考轨迹')) : [])

test('切段：按空行/句号/分号切、段截 80 字、>40 段并到 40', () => {
  assert.deepEqual(M.切段('a。b；c\n\nd'), ['a', 'b', 'c', 'd'])
  const 长 = M.切段('x'.repeat(200))
  assert.equal(长.length, 1)
  assert.ok(长[0].length <= 80)
  const 多 = Array.from({ length: 120 }, (_, i) => '段' + i).join('。')
  assert.equal(M.切段(多).length, 40)
  assert.deepEqual(M.切段('   '), [])
})

test('解析点JSON：去围栏、非法返回 null、超界夹紧', () => {
  const a = M.解析点JSON('```json\n{"点":[{"i":1,"E":2,"S":0,"P":-0.2,"注":"x"}]}\n```')
  assert.equal(a.length, 1)
  assert.equal(a[0].E, 1)
  assert.equal(a[0].P, -0.2)
  assert.equal(M.解析点JSON('not json'), null)
  assert.equal(M.解析点JSON('{"点":[]}'), null)
})

test('无思考：记 0 字为「无思考」，不写文件', async () => {
  const { ctx } = 起()
  await M.跑轨迹(ctx, 会, 'session-aaaaaaaa-1111', 7, '   ')
  const c = 计()
  assert.equal(c.轮.at(-1).状态, '无思考')
  assert.equal(轨迹文件().length, 0)
})

test('有轨迹：写文件、/state.轨迹 形状、文件 ≤50KB', async () => {
  const { ctx } = 起()
  const r = await M.跑轨迹(ctx, 会, 'session-aaaaaaaa-1111', 8, '第一段内容。第二段内容；第三段内容')
  assert.equal(r.段数, 3)
  const 名 = 轨迹文件().find((x) => x.includes('-8.json'))
  assert.ok(名)
  const 体 = JSON.parse(readFileSync(join(目录, '情绪池-思考轨迹', 名), 'utf8'))
  assert.equal(体.turn, 8)
  assert.equal(体.段点.length, 1)
  assert.ok(JSON.stringify(体).length <= 50 * 1024)
  const 摘 = M.轨迹摘要()
  assert.equal(摘.最近.turn, 8)
  assert.equal(摘.最近.段数, 3)
  assert.equal(摘.近20轮.有轨迹, 1)
  assert.ok(摘.今日调用数 >= 1)
})

test('非法 JSON：重试一次后记「失败」', async () => {
  const { ctx } = 起('这不是 JSON')
  const r = await M.跑轨迹(ctx, 会, 'session-aaaaaaaa-1111', 9, 'aaaaaa。bbbbbb')
  assert.equal(r.失败, true)
  assert.equal(计().轮.at(-1).状态, '失败')
})

test('短文本不凑点：几段给几个点', async () => {
  const { ctx } = 起('{"点":[{"i":1,"E":0.1,"S":0,"P":0,"注":"第一点"},{"i":2,"E":0.2,"S":0,"P":0,"注":"第二点"}]}')
  const r = await M.跑轨迹(ctx, 会, 'session-aaaaaaaa-1111', 10, '只有两段内容。第二段内容')
  assert.equal(r.段点.length, 2)
})
test('短碎片（<5 字）在打点前丢掉；全丢光记「无思考」', async () => {
  const { ctx, 调 } = 起()
  const r = await M.跑轨迹(ctx, 会, 'session-aaaaaaaa-1111', 11, '嗯。好。这是一个足够长的片段')
  assert.equal(r.段数, 1)
  assert.equal(调(), 1)
  const r2 = await M.跑轨迹(ctx, 会, 'session-aaaaaaaa-1111', 12, '嗯。好。哦')
  assert.equal(r2.无思考, true)
  assert.equal(计().轮.at(-1).状态, '无思考')
})

test('注太短 → 重打一次；第二次合格就用第二次', async () => {
  const 短 = '{"点":[{"i":1,"E":0.1,"S":0,"P":0,"注":"略"}]}'
  const 好 = '{"点":[{"i":1,"E":0.1,"S":0,"P":0,"注":"在猜他的意思"}]}'
  const { ctx, 调 } = 起([短, 好])
  const r = await M.跑轨迹(ctx, 会, 'session-aaaaaaaa-1111', 13, '这一段足够长可以打点')
  assert.equal(调(), 2)
  assert.equal(r.段点[0].注, '在猜他的意思')
  assert.equal(计().轮.at(-1).状态, '有轨迹')
})

test('连续两次注太短 → 记「失败」', async () => {
  const 短 = '{"点":[{"i":1,"E":0.1,"S":0,"P":0,"注":"略"}]}'
  const { ctx, 调 } = 起([短, 短])
  const r = await M.跑轨迹(ctx, 会, 'session-aaaaaaaa-1111', 14, '这一段足够长可以打点')
  assert.equal(r.失败, true)
  assert.equal(调(), 2)
  assert.equal(计().轮.at(-1).状态, '失败')
})
