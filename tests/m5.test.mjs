// §24 验收：时间曲线三段、六档只作人话对照、命名表（基础名/区间/重叠/跨度）、数值警告线
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m5-'))
process.env.EMOTION_POOL_DIR = 目录

const 模块 = await import('../lib/index.js')

const 基础配置 = {
  启用: true,
  校验启用: true,
  校验每天上限: 50,
  校验只跑有自报的轮: true,
  提醒启用: true,
  每日衰减系数: 0.9,
  守恒上限: 1.0,
  写入者: ['c4b92d68'],
  注入启用: false,
  刻度: 1,
  日志: ['情绪池-日志.md', '情绪池-日志.jsonl'],
}

const 天前 = (n) => new Date(Date.now() - n * 86400000).toISOString()

function 写池(axes, events = []) {
  const 池 = {
    rev: 1,
    updated: 天前(0),
    axes,
    spine: { S: 0 },
    prev_cell: 'E0S0P0',
    events,
    stats: { selfreport_total: 0, missed_total: 0 },
  }
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(池, null, 2))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify(基础配置, null, 2))
  for (const f of ['情绪池-日志.md', '情绪池-日志.jsonl', '情绪池-命名.json', '情绪池-注入.json']) {
    const p = join(目录, f)
    if (existsSync(p)) rmSync(p)
  }
}

function 起插件() {
  const 路由 = new Map()
  const ctx = {
    on() {},
    effect(fn) { fn(); return () => {} },
    webServer: {
      register(o) {
        路由.set(o.path, o.handler)
        return () => {}
      },
    },
    systemPrompt: { context: () => () => {} },
  }
  模块.apply(ctx)
  return 路由
}

async function 调(路由, path, { method = 'GET', body } = {}) {
  let 体 = ''
  const req = {
    method,
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield Buffer.from(JSON.stringify(body))
    },
  }
  const res = {
    statusCode: 200,
    setHeader() {},
    end(s) { 体 = String(s || '') },
  }
  await 路由.get(path)(req, res)
  return { status: res.statusCode, out: 体 ? JSON.parse(体) : null }
}

test('§24.1：三段曲线——先掉、回升、半衰期 30 天，峰值不到 1.0', () => {
  assert.ok(Math.abs(模块.年龄系数(天前(0)).系数 - 1.0) < 1e-6)
  assert.ok(Math.abs(模块.年龄系数(天前(0.5)).系数 - 0.975) < 1e-6)
  assert.ok(Math.abs(模块.年龄系数(天前(1)).系数 - 0.95) < 1e-6)
  assert.ok(Math.abs(模块.年龄系数(天前(4)).系数 - 0.956923076923077) < 1e-6)
  assert.ok(Math.abs(模块.年龄系数(天前(7)).系数 - (0.95 + 0.03 * 6 / 13)) < 1e-6)
  assert.ok(Math.abs(模块.年龄系数(天前(30)).系数 - 0.574913295119831) < 2e-3)
  assert.ok(模块.年龄系数(天前(90)).系数 < 0.10)
  for (let d = 1; d < 400; d += 1) assert.ok(模块.年龄系数(天前(d)).系数 < 1.0)
})

test('§24.1：六档词只作人话对照（按天回档名）', () => {
  assert.equal(模块.年龄系数(天前(0.5)).档名, '最近')
  assert.equal(模块.年龄系数(天前(2)).档名, '这段时间')
  assert.equal(模块.年龄系数(天前(4)).档名, '上次')
  assert.equal(模块.年龄系数(天前(10)).档名, '不久前')
  assert.equal(模块.年龄系数(天前(90)).档名, '好像过了挺久')
  assert.equal(模块.年龄系数(天前(200)).档名, '很久很久以前')
})

test('§24.2：27 格基础名', () => {
  assert.equal(模块.基础名('E+S-P-'), '靠近·悬着·疼')
  assert.equal(模块.基础名('E0S0P0'), '持平·居中·平')
  assert.equal(模块.基础名('E-S+P+'), '退开·踏实·轻快')
})

test('§24.2：命名表——三轴区间包含、命中取更窄、重叠拒绝', async () => {
  写池({ E: 0.1, S: 0.3, P: 0.2 }, [{ id: 'a', t: 天前(0), turn: 7, delta_raw: { E: 0.1, S: 0.3, P: 0.2 }, note: '' }])
  writeFileSync(join(目录, '情绪池-命名.json'), JSON.stringify({
    version: 1,
    名字: [
      { 名: '宽的那个', E: [-0.2, 0.4], S: [-0.2, 0.6], P: [-0.1, 0.5], 出处: '测试', 建: '2026-11-08T23:16' },
      { 名: '窄的那个', E: [0, 0.2], S: [0.2, 0.4], P: [0.1, 0.3], 出处: '测试', 建: '2026-11-08T23:16' },
    ],
  }, null, 2))
  const 路由 = 起插件()

  const 名 = await 调(路由, '/dsh-emotion-pool/names')
  assert.equal(名.status, 200)
  assert.equal(名.out.名字.length, 2)
  assert.equal(Object.keys(名.out.基础).length, 27)
  assert.equal(名.out.当前.命中, '窄的那个')
  assert.equal(名.out.当前.cell, 'E+S+P+')

  const 好 = await 调(路由, '/dsh-emotion-pool/name', { method: 'POST', body: { 名: '新的一段', E: [0.6, 0.8], S: [-0.8, -0.5], P: [0.6, 0.9], 出处: '测试新增' } })
  assert.equal(好.status, 200)
  assert.equal(好.out.ok, true)

  const 重叠 = await 调(路由, '/dsh-emotion-pool/name', { method: 'POST', body: { 名: '叠上来', E: [0.65, 0.85], S: [-0.7, -0.4], P: [0.7, 0.95] } })
  assert.equal(重叠.status, 400)
  assert.match(重叠.out.error, /重叠/)

  const 太窄 = await 调(路由, '/dsh-emotion-pool/name', { method: 'POST', body: { 名: '窄缝', E: [0.1, 0.2], S: [0.8, 0.9], P: [0.8, 0.9] } })
  assert.equal(太窄.status, 400)
  assert.match(太窄.out.error, /0\.15/)

  const 倒 = await 调(路由, '/dsh-emotion-pool/name', { method: 'POST', body: { 名: '倒', E: [0.7, 0.6], S: [0, 0.2], P: [0, 0.2] } })
  assert.equal(倒.status, 400)

  const 再 = await 调(路由, '/dsh-emotion-pool/names')
  assert.equal(再.out.名字.length, 3)
})
test('§24.3：数值警告线——接近上限 / 已到上限 / 陡涨（/state 与日志）', async () => {
  写池({ E: 0.95, S: 0, P: 0 }, [{ id: 'a', t: 天前(0), turn: 7, delta_raw: { E: 0.95, S: 0, P: 0 }, note: '' }])
  const 路由 = 起插件()
  const r = await 调(路由, '/dsh-emotion-pool/state')
  assert.equal(r.status, 200)
  assert.ok(r.out.警告.some((x) => /已到上限/.test(x)), JSON.stringify(r.out.警告))
  assert.ok(r.out.警告.some((x) => /陡涨/.test(x)), JSON.stringify(r.out.警告))
  assert.equal(r.out.格名, '靠近·居中·平')
  assert.equal(r.out.事件明细[0].档, '最近')
})
