// 2026-11-09 01:00：轴级名「满」（单轴 0.90~1.00）
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m9-'))
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
  写入者: ['aaaaaaaa'],
  注入启用: false,
  刻度: 1,
  刺阈值: 0.25,
  日志: ['情绪池-日志.md', '情绪池-日志.jsonl'],
}

const 命名 = {
  version: 1,
  名字: [
    { 名: '满', 类型: '轴级', E: [0.9, 1], S: [0.9, 1], P: [0.9, 1], 注: '某根到 0.90 以上，基本顶格了；再塞也进不去，只能等它自己退。' },
    { 名: '悬心', 注: '隔着屏幕守人', E: [-0.6, -0.3], S: [-0.9, -0.55], P: [-0.4, -0.1] },
  ],
}

function 池(spine) {
  return {
    rev: 0,
    updated: new Date().toISOString(),
    axes: { E: 0, S: 0, P: 0 },
    spine,
    prev_cell: 'E0S0P0',
    events: [],
    结: [],
    stats: { selfreport_total: 0, missed_total: 0 },
  }
}

function 重置(spine) {
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(池(spine), null, 2))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify(配置, null, 2))
  writeFileSync(join(目录, '情绪池-命名.json'), JSON.stringify(命名, null, 2))
}

function 起插件() {
  const 监听 = []
  const 路由 = new Map()
  const ctx = {
    on(_名, fn) { 监听.push(fn) },
    effect(fn) { fn(); return () => {} },
    webServer: { register(o) { 路由.set(o.path, o.handler); return () => {} } },
    systemPrompt: { context: () => () => {} },
    llm: {},
    agents: { list: () => [] },
  }
  模块.apply(ctx)
  return { 路由, 发: (ev) => { for (const fn of 监听) fn({ id: 'session-aaaaaaaa-f40c-4fc3-ad69-f8338376753b' }, ev) } }
}

async function 调(路由, path) {
  let 回 = ''
  await 路由.get(path)({ method: 'GET', socket: { remoteAddress: '127.0.0.1' }, async *[Symbol.asyncIterator]() {} }, { statusCode: 200, setHeader() {}, end(s) { 回 = String(s) } })
  return JSON.parse(回)
}

before(() => 重置({ S: 0.95 }))

test('轴级「满」：任一根 ≥0.90 命中，来源标轴级并给出轴', async () => {
  重置({ S: 0.95 })
  const p = 起插件()
  const s = await 调(p.路由, '/dsh-emotion-pool/state')
  assert.equal(s.命名, '满')
  assert.equal(s.命名来源, '轴级')
  assert.equal(s.命名轴, 'S')
  assert.ok(String(s.命名注).includes('0.90'))
})

test('轴级「满」：0.89 不命中，回落基础名', async () => {
  重置({ S: 0.89 })
  const p = 起插件()
  const s = await 调(p.路由, '/dsh-emotion-pool/state')
  assert.equal(s.命名来源, '基础名')
  assert.equal(s.命名, s.格名)
})

test('区间名仍然生效（轴级没有命中时）', async () => {
  重置({ E: -0.32, S: -0.56, P: -0.12 })
  const p = 起插件()
  const s = await 调(p.路由, '/dsh-emotion-pool/state')
  assert.equal(s.命名, '悬心')
  assert.equal(s.命名来源, '区间')
  assert.equal(s.命名轴, null)
})

test('满 的最近触发被写回命名表（可追溯）', async () => {
  重置({ S: 0.95 })
  const p = 起插件()
  await 调(p.路由, '/dsh-emotion-pool/state')
  // 0.2.6：命名表独立成 情绪池-命名表.json（旧 情绪池-命名.json 由迁移读兼容）
  const o = JSON.parse(readFileSync(join(目录, '情绪池-命名表.json'), 'utf8'))
  const 满 = o.条目.find((x) => x.名字 === '满')
  assert.ok(满.最近触发)
})

test('显示文本：符号 + 当前数值 + 命中名 + 注（给调试窗口用）', async () => {
  重置({ S: 0.95 })
  const p = 起插件()
  const s = await 调(p.路由, '/dsh-emotion-pool/state')
  assert.equal(s.显示.S.文本, 'S+ 0.9500')
  assert.equal(s.显示.E.方向, 'E0')
  assert.equal(s.显示.E.值, 0)
  assert.ok(s.显示文本.includes('S+ 0.9500'))
  assert.ok(s.显示文本.includes('满'))
  assert.ok(s.显示文本.includes('0.90'))
})
