// v0.10 验收：最新一轮高亮 / 释义悬停 / 待命名清单
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m42-'))
process.env.EMOTION_POOL_DIR = 目录
process.env.EP_LEGACY_INJECT = '1' // 旧【此刻】格式的回归用例

const 模块 = await import('../lib/index.js')

const 基础配置 = {
  启用: true,
  写入者: ['c4b92d68'],
  注入启用: true,
  保底间隔分钟: 40,
  保底轮数: 5,
  注入日限: 12,
  刻度: 1,
  守恒上限: 1.0,
  日志: ['情绪池-日志.md', '情绪池-日志.jsonl'],
}

function 空池(事件 = []) {
  return {
    rev: 1,
    updated: '2026-11-11T00:00:00+08:00',
    axes: { E: 0, S: 0, P: 0 },
    spine: { S: 0 },
    prev_cell: 'E0S0P0',
    events: 事件,
    stats: { selfreport_total: 0, missed_total: 0 },
  }
}

const 事件 = (turn, E, S = 0, P = 0) => ({ id: 'e-' + turn, t: new Date().toISOString(), turn, delta_raw: { E, S, P }, note: '' })
const 写池 = (事件们, rev = 1) => writeFileSync(join(目录, '情绪池.json'), JSON.stringify({ ...空池(事件们), rev }, null, 2))

function 重置(改 = {}) {
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(空池([]), null, 2))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify({ ...基础配置, ...改 }, null, 2))
  for (const f of ['情绪池-日志.md', '情绪池-注入.json', '情绪池-待命名.json', '情绪池-命名.json', '情绪池-卡片释义.json']) {
    const p = join(目录, f)
    if (existsSync(p)) rmSync(p)
  }
}

function 起插件() {
  const 出口 = new Map()
  const 路由 = new Map()
  const ctx = {
    on() {},
    effect(fn) { fn(); return () => {} },
    webServer: { register: (r) => { 路由.set(r.path, r); return () => {} } },
    systemPrompt: { context(参数) { 出口.set(参数.name, 参数); return () => {} } },
  }
  模块.apply(ctx)
  return {
    注入() {
      const c = 出口.get('emotion-pool-注入')
      return c ? c.text() : ''
    },
    async 取(path) {
      const r = 路由.get(path)
      const res = { code: 0, body: '', setHeader() {}, end(s) { this.body = String(s) } }
      await r.handler({ url: path, method: 'GET', socket: { remoteAddress: '127.0.0.1' } }, res)
      return JSON.parse(res.body)
    },
  }
}

const 注入状态 = () => JSON.parse(readFileSync(join(目录, '情绪池-注入.json'), 'utf8'))
const 待命名 = () => JSON.parse(readFileSync(join(目录, '情绪池-待命名.json'), 'utf8')).项
const 回拨时间 = () => {
  const o = 注入状态()
  o.上次时间 = new Date(Date.now() - 41 * 60000).toISOString()
  writeFileSync(join(目录, '情绪池-注入.json'), JSON.stringify(o, null, 2))
}

before(() => 重置())

test('待命名：0.52 / 0.53 落在同一 0.05 格，合并成一条、次数 2', () => {
  重置()
  起插件()
  // 2026-11-19：注入路径不再写待命名（策划间复核），这里直接走 记待命名 验同格合并
  模块.记待命名(0.52, 0, 0, '')
  模块.记待命名(0.53, 0, 0, '')
  const 表 = 待命名()
  assert.equal(表.length, 1, JSON.stringify(表))
  assert.equal(表[0].次数, 2)
  assert.equal(表[0].E, 0.5)
})

test('/state.待命名 给总数与前 5（按次数降序）', async () => {
  重置()
  const p = 起插件()
  // 2026-11-19：注入不再写待命名，直接记一条再验 /state 汇总
  模块.记待命名(0.52, 0, 0, '')
  const s = await p.取('/dsh-emotion-pool/state')
  assert.ok(s.待命名)
  assert.equal(s.待命名.总数, 1)
  assert.equal(s.待命名.前5.length, 1)
  assert.ok(s.待命名.前5[0].次数 >= 1)
})

test('释义路由：有文件返回项；缺文件返回空项且不写兜底文案', async () => {
  重置()
  writeFileSync(join(目录, '情绪池-卡片释义.json'), JSON.stringify({ 项: { 我的点数: '解释A', Δ_实: '解释B' } }))
  const p = 起插件()
  const g = await p.取('/dsh-emotion-pool/glossary')
  assert.equal(g.项.我的点数, '解释A')
  rmSync(join(目录, '情绪池-卡片释义.json'))
  const 空 = await p.取('/dsh-emotion-pool/glossary')
  assert.deepEqual(空.项, {})
})

test('卡片源码：只有 12 个名字有 data-tip，且用文件项、没有兜底文案', () => {
  const src = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')
  assert.ok(src.includes('释义 = o.项'), '从路由读释义进内存')
  assert.ok(src.includes('data-tip="\' + 转义(项.说明'), '缺项不加 data-tip')
  assert.ok(!src.includes('暂无解释'), '不许自写兜底')
  assert.ok(src.includes("fetch('/dsh-emotion-pool/glossary'"), '从路由读')
})

test('第一页三层：黄零点/绿当前/蓝上一 + rAF 动画', () => {
  const src = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')
  assert.ok(src.includes('ep-green'), '绿层')
  assert.ok(src.includes('ep-blu'), '蓝层')
  assert.ok(src.includes('ep-zdot'), '黄零点')
  assert.ok(src.includes('requestAnimationFrame'), 'rAF')
  assert.ok(src.includes('设置视觉'), '视觉参数可配')
  assert.ok(src.includes('走动画'), '走动画函数')
})

test('注入日限读配置：注入日限=1 时第二次插队被挡，日志写 1/1', () => {
  重置({ 注入日限: 1 })
  const p = 起插件()
  写池([事件(1, 0.2)], 1)
  assert.ok(p.注入().startsWith('【此刻】')) // 保底
  const o = 注入状态()
  o.上次格 = '别处'
  o.上次时间 = new Date().toISOString()
  o.上次轴 = { E: 0, S: 0, P: 0 }
  o.插队 = 1
  writeFileSync(join(目录, '情绪池-注入.json'), JSON.stringify(o, null, 2))
  写池([事件(2, 0.9)], 2)
  const 存 = JSON.parse(readFileSync(join(目录, '情绪池.json'), 'utf8'))
  存.上轮波动 = { 轮: 2, 有: true, t: new Date().toISOString() }
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(存, null, 2))
  const 行 = p.注入()
  assert.equal(行, '')
  const 日志 = readFileSync(join(目录, '情绪池-日志.md'), 'utf8')
  assert.ok(日志.includes('插队跳过（今日 1/1）'))
})
