// 2026-11-09：右下角挂饰（serve /widget.js + webserver/index-inject），照 feiyu 的注册方式
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m13-'))
process.env.EMOTION_POOL_DIR = 目录

const 模块 = await import('../lib/index.js')

function 起插件() {
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify({
    rev: 0, updated: new Date().toISOString(), axes: { E: 0, S: 0, P: 0 }, spine: { S: 0 },
    prev_cell: 'E0S0P0', events: [], 结: [], stats: { selfreport_total: 0, missed_total: 0 },
    p_state: { 爽: { s: 1, a: 1, 最近: null }, 痛: { s: 1, a: 1, 最近: null } },
  }, null, 2))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify({ 启用: true, 写入者: ['c4b92d68'], 日志: ['情绪池-日志.md'] }, null, 2))
  const 路由 = new Map()
  const 监听 = new Map()
  const ctx = {
    on(名, fn) { 监听.set(名, fn) },
    effect(fn) { fn(); return () => {} },
    webServer: { register(o) { 路由.set(o.path, o.handler); return () => {} } },
    systemPrompt: { context: () => () => {} }, llm: {}, agents: { list: () => [] },
  }
  模块.apply(ctx)
  return { 路由, 监听 }
}

async function 取(路由, path) {
  let 回 = ''
  let 码 = 200
  const req = { method: 'GET', socket: { remoteAddress: '127.0.0.1' }, async *[Symbol.asyncIterator]() {} }
  await 路由.get(path)(req, { set statusCode(v) { 码 = v }, get statusCode() { return 码 }, setHeader() {}, writeHead() {}, end(s) { 回 = String(s) } })
  return { 码, 回 }
}

test('widget.js：能取到，拉 /state，无外链', async () => {
  const { 路由 } = 起插件()
  const r = await 取(路由, '/dsh-emotion-pool/widget.js')
  assert.equal(r.码, 200)
  assert.ok(r.回.includes("fetch(API") || r.回.includes('/dsh-emotion-pool/state'))
  assert.ok(r.回.includes('ep-card'))
  assert.ok(r.回.includes('ep-panel'))
  const 外链 = r.回.match(/https?:\/\/[^"'\\s<]+/g) || []
  assert.deepEqual(外链, [])
})

test('index-inject：挂一行 <script>，重复调用不重复挂', () => {
  const { 监听 } = 起插件()
  const fn = 监听.get('webserver/index-inject')
  assert.equal(typeof fn, 'function')
  const table = []
  fn(table)
  fn(table)
  assert.equal(table.length, 1)
  assert.equal(table[0].placement, 'body')
  assert.ok(String(table[0].text).includes('/dsh-emotion-pool/widget.js'))
})

test('index-inject：已有同 src 的行就不再挂', () => {
  const { 监听 } = 起插件()
  const table = [{ kind: 'script-src', src: '/dsh-emotion-pool/widget.js' }]
  监听.get('webserver/index-inject')(table)
  assert.equal(table.length, 1)
})
