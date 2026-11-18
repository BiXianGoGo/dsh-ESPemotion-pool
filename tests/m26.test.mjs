// 2026-11-09 04:15：SSE 每轮推送 rev；挂饰收到后重拉已载列表并保留滚动位置
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m26-'))
process.env.EMOTION_POOL_DIR = 目录
const 模块 = await import('../lib/index.js')

const 配置 = {
  启用: true, 校验启用: false, 校验每天上限: 50, 校验只跑有自报的轮: true,
  提醒启用: false, 每日衰减系数: 0.9, 守恒上限: 1.0, 写入者: ['c4b92d68'],
  注入启用: false,
  刻度: 1, 刺阈值: 0.25, 结累计阈值: 0.45, 结急阈值: 0.2, 结急速率: 0.05,
  日志: ['情绪池-日志.md', '情绪池-日志.jsonl'],
}
const 会话id = 'session-c4b92d68'
const 池 = {
  rev: 0, updated: new Date().toISOString(), axes: { E: 0, S: 0, P: 0 },
  spine: { E: 0, S: 0, P: 0 }, prev_cell: 'E0S0P0', events: [], 结: [], 格计时: null,
  stats: { selfreport_total: 0, missed_total: 0 },
  p_state: { 爽: { s: 1, a: 1, 最近: null }, 痛: { s: 1, a: 1, 最近: null } },
}
writeFileSync(join(目录, '情绪池.json'), JSON.stringify(池, null, 2))
writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify(配置, null, 2))

const 路由 = new Map()
const ctx = {
  on() {}, effect(fn) { fn(); return () => {} },
  webServer: { register(o) { 路由.set(o.path, o.handler); return () => {} } },
  systemPrompt: { context: () => () => {} },
  llm: {}, agents: { list: () => [] },
}
模块.apply(ctx)

function 开流() {
  const 块 = []
  let 头 = null
  const req = { method: 'GET', url: '/dsh-emotion-pool/stream', socket: { remoteAddress: '127.0.0.1' }, on() {} }
  const res = { writeHead(码, h) { 头 = { 码, h } }, write(s) { 块.push(String(s)) }, on() {}, end() {} }
  路由.get('/dsh-emotion-pool/stream')(req, res)
  return { 块, 头 }
}
async function 报(体) {
  let 回 = ''
  const req = { method: 'POST', socket: { remoteAddress: '127.0.0.1' }, url: '/dsh-emotion-pool/report',
    async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(体)) } }
  await 路由.get('/dsh-emotion-pool/report')(req, { set statusCode(v) {}, get statusCode() { return 200 }, setHeader() {}, writeHead() {}, end(s) { 回 = String(s) } })
  return JSON.parse(回)
}
const revs = (块) => 块.filter((s) => s.startsWith('data: ')).map((s) => JSON.parse(s.slice(6)).rev)

test('SSE：连上先推当前 rev，之后每写一次推一次', async () => {
  const 流 = 开流()
  assert.equal(流.头.码, 200)
  assert.ok(/text\/event-stream/.test(流.头.h['Content-Type']))
  const 初 = revs(流.块)
  assert.equal(初.length, 1)
  assert.equal(初[0], JSON.parse(readFileSync(join(目录, '情绪池.json'), 'utf8')).rev)
  await 报({ E: 0.15, 用户话: '一' })
  await 报({ E: 0.15, 用户话: '二' })
  const r = revs(流.块)
  assert.equal(r.length, 3)
  assert.ok(r[2] > r[1] && r[1] > r[0])
})

test('挂饰：EventSource + 保位刷新 + 15 秒兜底', () => {
  const 源 = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'widget.js'), 'utf8')
  assert.ok(/new EventSource\('\/dsh-emotion-pool\/stream'\)/.test(源))
  assert.ok(/保位刷新\('结'\)/.test(源) && /保位刷新\('事件'\)/.test(源))
  assert.ok(/offset=0&limit=' \+ 数据\.length/.test(源))
  assert.ok(/盒2\.scrollTop = 上/.test(源))
  assert.ok(/setInterval\(刷, 15000\)/.test(源))
})