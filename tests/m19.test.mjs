// 2026-11-09 02:21：同向连报改成池内独立计数器 池.streak（三根各算各的）+ 滚动 90 分钟窗
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m19-'))
process.env.EMOTION_POOL_DIR = 目录

const 模块 = await import('../lib/index.js')

function 空池() {
  return {
    rev: 0, updated: new Date().toISOString(), axes: { E: 0, S: 0, P: 0 }, spine: { S: 0 },
    prev_cell: 'E0S0P0', events: [], 结: [], stats: { selfreport_total: 0, missed_total: 0 },
    p_state: { 爽: { s: 1, a: 1, 最近: null }, 痛: { s: 1, a: 1, 最近: null } },
    streak: { aaaaaaaa: { E: { n: 0, dir: 0, t: 0 }, S: { n: 0, dir: 0, t: 0 }, P: { n: 0, dir: 0, t: 0 } } },
  }
}

function 起插件(池) {
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(池 || 空池(), null, 2))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify({ 启用: true, 写入者: ['aaaaaaaa'], 日志: ['情绪池-日志.md'] }, null, 2))
  const 路由 = new Map()
  const ctx = {
    on() {},
    effect(fn) { fn(); return () => {} },
    webServer: { register(o) { 路由.set(o.path, o.handler); return () => {} } },
    systemPrompt: { context: () => () => {} }, llm: {}, agents: { list: () => [] },
  }
  模块.apply(ctx)
  return { 路由 }
}

async function 发(路由, path, 体) {
  let 回 = ''
  let 码 = 200
  const req = {
    method: 'POST', socket: { remoteAddress: '127.0.0.1' }, url: path,
    async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(体)) },
  }
  await 路由.get('/dsh-emotion-pool' + path)(req, { set statusCode(v) { 码 = v }, get statusCode() { return 码 }, setHeader() {}, writeHead() {}, end(s) { 回 = String(s) } })
  return { 码, 回 }
}

function 读池() { return JSON.parse(readFileSync(join(目录, '情绪池.json'), 'utf8')) }
function 写池(池) { writeFileSync(join(目录, '情绪池.json'), JSON.stringify(池, null, 2)) }
function 搬旧(轴, 分钟) {
  const 池 = 读池()
  池.streak['aaaaaaaa'][轴].t = Date.now() - 分钟 * 60000
  写池(池)
}
const 末次S = () => 读池().events.at(-1).delta_raw.S

test('同向计数：独立、滚动窗、递减 1.0/0.6/0.4', async () => {
  // ① 三次 S+（间隔 20 分钟）→ 1.0 / 0.6 / 0.4
  {
    const { 路由 } = 起插件(空池())
    await 发(路由, '/report', { S: 0.15, 轮: 'a' })
    assert.equal(末次S(), 0.15)
    搬旧('S', 20)
    await 发(路由, '/report', { S: 0.15, 轮: 'b' })
    assert.equal(末次S(), 0.09)
    搬旧('S', 20)
    await 发(路由, '/report', { S: 0.15, 轮: 'c' })
    assert.equal(末次S(), 0.06)
  }

  // ② 中间报 E− 不影响 S 的计数
  {
    const { 路由 } = 起插件(空池())
    await 发(路由, '/report', { S: 0.15, 轮: 'a' })
    await 发(路由, '/report', { E: -0.15, 轮: 'b' })
    搬旧('S', 20)
    await 发(路由, '/report', { S: 0.15, 轮: 'c' })
    assert.equal(末次S(), 0.09, 'E− 不应重置 S 的 n')
  }

  // ③ 距上次 100 分钟 → n=1，×1.0
  {
    const { 路由 } = 起插件(空池())
    await 发(路由, '/report', { S: 0.15, 轮: 'a' })
    搬旧('S', 100)
    await 发(路由, '/report', { S: 0.15, 轮: 'b' })
    assert.equal(末次S(), 0.15, '超 90 分钟应重置')
  }
})
