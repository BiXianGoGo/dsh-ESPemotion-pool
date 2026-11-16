// v0.12：注入的「距 5 轮」改用真实回复计数
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m45-'))
process.env.EMOTION_POOL_DIR = 目录
process.env.EP_LEGACY_INJECT = '1' // 旧【此刻】格式的回归用例
const 模块 = await import('../lib/index.js')

const 配置 = {
  启用: true, 注入启用: true, 注入日限: 12, 保底间隔分钟: 40, 保底轮数: 5, 刻度: 1, 守恒上限: 1, 写入者: ['aaaaaaaa'], 日志: ['情绪池-日志.md', '情绪池-日志.jsonl'] }
const 池 = (事件们 = []) => ({ rev: 1, updated: '2026-11-11T00:00:00+08:00', axes: { E: 0.2, S: 0, P: 0 }, spine: { S: 0 }, prev_cell: 'E+S0P0', events: 事件们, stats: { selfreport_total: 0, missed_total: 0 } })
const 事件 = (turn, t = '2026-11-11T00:00:00+08:00') => ({ id: 'e' + turn, t, turn, delta_raw: { E: 0.1, S: 0, P: 0 }, note: '' })

function 重置(事件们 = [], 注入 = null) {
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(池(事件们), null, 2))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify(配置, null, 2))
  for (const f of ['情绪池-注入.json', '情绪池-轮号.json', '情绪池-日志.md', '情绪池-命名.json']) {
    const p = join(目录, f); if (existsSync(p)) rmSync(p)
  }
  if (注入) writeFileSync(join(目录, '情绪池-注入.json'), JSON.stringify(注入, null, 2))
  if (注入 && 注入.轮) writeFileSync(join(目录, '情绪池-轮号.json'), JSON.stringify({ 总: 注入.轮.总 || 0, 按会话: 注入.轮.按会话 || {}, 末: 注入.轮.末 || {}, 更新: null }, null, 2))
}
const 注入状态 = () => JSON.parse(readFileSync(join(目录, '情绪池-注入.json'), 'utf8'))

function 起插件() {
  const 出口 = new Map(); const 路由 = new Map(); let 事件处理 = null
  const ctx = {
    on(名, 函) { if (名 === 'session/event') 事件处理 = 函; return () => {} },
    effect(函) { return 函() || (() => {}) },
    webServer: { register(定义) { 路由.set(定义.path, 定义.handler); return () => {} } },
    systemPrompt: { context(参数) { 出口.set(参数.name, 参数); return () => {} } },
    agents: { list: () => [] }, llm: {},
  }
  模块.apply(ctx)
  return {
    注入() { const c = 出口.get('emotion-pool-注入'); return c ? c.text() : '' },
    发(类型, 数据) { 事件处理({ id: 'session-aaaaaaaa-f40c-4fc3-ad69-f8338376753b' }, { type: 类型, data: 数据 }) },
    状态: async () => {
      const h = 路由.get('/dsh-emotion-pool/state')
      let 文 = ''
      const res = { statusCode: 200, setHeader() {}, end(x) { 文 = x } }
      await h({ socket: { remoteAddress: '127.0.0.1' }, url: '/' }, res)
      return JSON.parse(文)
    },
  }
}

test('记一轮：首次用 max(事件最大 turn, 上次轮) 做种子，且同轮不重复', () => {
  重置([事件(12)], { 今天: '', 上次轮: 20, 判断: 0, 注入: 0, 保底: 0, 插队: 0, 次数: 0, 昨日: {}, 上次轴: {}, 上次时间: null, 上次格: '', 上次rev: null })
  const 池对象 = JSON.parse(readFileSync(join(目录, '情绪池.json'), 'utf8'))
  模块.记一轮('session-aaaaaaaa-f40c-4fc3-ad69-f8338376753b', 7, 池对象)
  assert.equal(JSON.parse(readFileSync(join(目录, '情绪池-轮号.json'), 'utf8')).总, 21)
  assert.equal(JSON.parse(readFileSync(join(目录, '情绪池-轮号.json'), 'utf8')).按会话.aaaaaaaa, 1)
  模块.记一轮('session-aaaaaaaa-f40c-4fc3-ad69-f8338376753b', 7, 池对象)
  assert.equal(JSON.parse(readFileSync(join(目录, '情绪池-轮号.json'), 'utf8')).总, 21)
})

test('当前轮：优先读 轮.总，不再只认事件表最大 turn', () => {
  重置([事件(3)], { 今天: '', 上次轮: null, 判断: 0, 注入: 0, 保底: 0, 插队: 0, 次数: 0, 昨日: {}, 上次轴: {}, 上次时间: null, 上次格: '', 上次rev: null })
  const 池对象 = JSON.parse(readFileSync(join(目录, '情绪池.json'), 'utf8'))
  for (let i = 1; i <= 6; i++) 模块.记一轮('session-aaaaaaaa-f40c-4fc3-ad69-f8338376753b', i, 池对象)
  // 种子取事件最大 3，再记 6 轮 → 9（说明读的是计数、不只是事件表）\n  assert.equal(模块.当前轮(池对象), 9)\n  assert.ok(9 > 3)
})

test('6 条不带自报的 assistant/message 之后，注入是保底而不是空', () => {
  重置([事件(1)], { 今天: '', 上次轮: 1, 判断: 0, 注入: 0, 保底: 0, 插队: 0, 次数: 0, 昨日: {}, 上次轴: { E: 0.2, S: 0, P: 0 }, 上次时间: new Date(Date.now() - 60000).toISOString(), 上次格: 'E+S0P0', 上次rev: 1 })
  模块.记一轮('session-aaaaaaaa-f40c-4fc3-ad69-f8338376753b', 1, { events: [] })
  const p = 起插件()
  for (let i = 2; i <= 7; i++) p.发('assistant/message', { turn: i, message: { content: [{ type: 'text', text: '（没有自报的一轮）' }] } })
  const 行 = p.注入()
  assert.ok(行.startsWith('【此刻】'), 行)
  assert.equal(注入状态().保底, 1)
})

test('同一轮 text() 多次只注一次', () => {
  重置([事件(1)], { 今天: '', 上次轮: 2, 判断: 0, 注入: 0, 保底: 0, 插队: 0, 次数: 0, 昨日: {}, 上次轴: {}, 上次时间: null, 上次格: '', 上次rev: null, 轮: { 总: 3, 按会话: {}, 末: {} } })
  const p = 起插件()
  assert.ok(p.注入().startsWith('【此刻】'))
  assert.equal(p.注入(), '')
  assert.equal(注入状态().注入, 1)
})

test('/state.注入：带 轮总/上次轮，没注入过时 距上次注入分钟 为 null', async () => {
  重置([事件(1)], { 今天: '', 上次轮: 4, 判断: 0, 注入: 0, 保底: 0, 插队: 0, 次数: 0, 昨日: {}, 上次轴: {}, 上次时间: null, 上次格: '', 上次rev: null, 轮: { 总: 4, 按会话: { aaaaaaaa: 4 }, 末: {} } })
  const p = 起插件()
  const s = await p.状态()
  assert.equal(s.注入.轮总, 4)
  assert.equal(s.注入.上次轮, 4)
  assert.equal(s.注入.距上次注入分钟, null)
})