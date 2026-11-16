// v0.9 注入补充验收：20 次读状态至少注入 5 次、/state.注入 字段、跨天自检口径
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m41-'))
process.env.EMOTION_POOL_DIR = 目录
process.env.EP_LEGACY_INJECT = '1' // 旧【此刻】格式的回归用例

const 模块 = await import('../lib/index.js')

const 基础配置 = {
  启用: true,
  写入者: ['aaaaaaaa'],
  注入启用: true,
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
    上轮波动: { 轮: 事件.reduce((m, e) => Math.max(m, Number(e.turn) || 0), 0), 有: true, t: new Date().toISOString() },
    stats: { selfreport_total: 0, missed_total: 0 },
  }
}

const 事件 = (turn, E) => ({ id: 'e-' + turn, t: new Date().toISOString(), turn, delta_raw: { E, S: 0, P: 0 }, note: '' })

function 重置(事件们 = []) {
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(空池(事件们), null, 2))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify(基础配置, null, 2))
  for (const f of ['情绪池-日志.md', '情绪池-日志.jsonl', '情绪池-注入.json']) {
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
    async 状态() {
      const r = 路由.get('/dsh-emotion-pool/state')
      const res = {
        code: 0,
        body: '',
        setHeader() {},
        end(s) { this.body = String(s) },
      }
      await r.handler({ url: '/dsh-emotion-pool/state', method: 'GET', socket: { remoteAddress: '127.0.0.1' } }, res)
      return JSON.parse(res.body)
    },
  }
}

const 状态文件 = () => JSON.parse(readFileSync(join(目录, '情绪池-注入.json'), 'utf8'))

before(() => 重置())

test('20 次读状态，至少注入 5 次（同轮去重、变化触发插队）', () => {
  重置([])
  const p = 起插件()
  let 注 = 0
  for (let i = 1; i <= 20; i++) {
    const v = i % 2 === 1 ? 0.20 : 0.45
    const 池 = 空池([事件(i, v)])
    池.rev = i
    writeFileSync(join(目录, '情绪池.json'), JSON.stringify(池, null, 2))
    const 行 = p.注入()
    if (行.startsWith('【此刻】')) 注 += 1
  }
  assert.ok(注 >= 5, '只注入了 ' + 注 + ' 次')
  assert.equal(状态文件().判断, 20) // 每次通过去重都算判断，被日限挡下的也算
  assert.ok(注 <= 24, '日限 24 只管插队，保底另算')
})

test('/state.注入 给出今日/昨日 八个数', async () => {
  重置([事件(1, 0.2)])
  const p = 起插件()
  assert.ok(p.注入().startsWith('【此刻】'))
  const s = await p.状态()
  assert.ok(s.注入)
  for (const k of ['今日判断', '今日注入', '今日保底', '今日插队', '昨日判断', '昨日注入', '昨日保底', '昨日插队']) {
    assert.equal(typeof s.注入[k], 'number', k)
  }
  assert.equal(s.注入.今日注入, 1)
})

test('保底计入今日注入，但不计入插队', () => {
  重置([事件(1, 0.2)])
  const p = 起插件()
  p.注入()
  const 状 = 状态文件()
  assert.equal(状.注入, 1)
  assert.equal(状.保底, 1)
  assert.equal(状.插队, 0)
  assert.equal(状.次数, 0)
})
