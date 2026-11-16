// 2026-11-09：GET /dsh-emotion-pool/panel —— 纯 HTML 面板，5 秒自拉 /state，无外链
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m12-'))
process.env.EMOTION_POOL_DIR = 目录

const 模块 = await import('../lib/index.js')

function 空池() {
  return {
    rev: 3, updated: '2026-11-09T01:13:00+08:00',
    axes: { E: -0.149, S: 1, P: 0 }, spine: { S: 0 }, prev_cell: 'E-S+P0',
    events: [], 结: [], stats: { selfreport_total: 0, missed_total: 0 },
    p_state: { 爽: { s: 1, a: 1, 最近: null }, 痛: { s: 1, a: 1, 最近: null } },
  }
}

function 起插件() {
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(空池(), null, 2))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify({ 启用: true, 写入者: ['aaaaaaaa'], 日志: ['情绪池-日志.md'] }, null, 2))
  const 路由 = new Map()
  const ctx = {
    on() {}, effect(fn) { fn(); return () => {} },
    webServer: { register(o) { 路由.set(o.path, o.handler); return () => {} } },
    systemPrompt: { context: () => () => {} }, llm: {}, agents: { list: () => [] },
  }
  模块.apply(ctx)
  return 路由
}

async function 取(路由, path, 地址 = '127.0.0.1') {
  let 回 = ''
  let 码 = 200
  const req = { method: 'GET', socket: { remoteAddress: 地址 }, async *[Symbol.asyncIterator]() {} }
  await 路由.get(path)(req, { set statusCode(v) { 码 = v }, get statusCode() { return 码 }, setHeader() {}, end(s) { 回 = String(s) } })
  return { 码, 回 }
}

test('panel：返回 HTML，含三轴/刺/事件/底部信息/5 秒刷新', async () => {
  const 路由 = 起插件()
  const r = await 取(路由, '/dsh-emotion-pool/panel')
  assert.equal(r.码, 200)
  assert.ok(r.回.includes('情绪池'))
  assert.ok(r.回.includes("var 轴 = ['E', 'S', 'P']"))
  assert.ok(r.回.includes('满点'))
  assert.ok(r.回.includes("setInterval(function () { 画(); 载('结', false); 载('事件', false); }, 5000)"))
  assert.ok(r.回.includes("fetch('/dsh-emotion-pool/state'"))
  assert.ok(r.回.includes('结（永存'))
})

test('panel：没有外链（不发 http/https 请求、不引 CDN）', async () => {
  const 路由 = 起插件()
  const r = await 取(路由, '/dsh-emotion-pool/panel')
  const 外链 = r.回.match(/https?:\/\/[^"'\\s<]+/g) || []
  assert.deepEqual(外链, [])
  assert.ok(!r.回.includes('cdn'))
})

test('panel：非本机 403', async () => {
  const 路由 = 起插件()
  const r = await 取(路由, '/dsh-emotion-pool/panel', '8.8.8.8')
  assert.equal(r.码, 403)
})
