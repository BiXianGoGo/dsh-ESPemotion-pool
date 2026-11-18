// v0.2.3：P 轴计次门槛 / 不应期 / 适应 / 戒断
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m115-'))
process.env.EMOTION_POOL_DIR = 目录
process.env.EP_LEGACY_INJECT = '1' // 旧【此刻】格式的回归用例
const M = await import('../lib/index.js')
const 配置 = { 启用: true, 写入者: ['c4b92d68'], 注入启用: false, 校验启用: false, 双轨校验: false, 刻度: 100, 日志: ['情绪池-日志.md', '情绪池-日志.jsonl'] }
const 天前 = (n) => new Date(Date.now() - n * 86400000).toISOString()
function 写池(o = {}) {
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify({ rev: 1, updated: 天前(0), axes: { E: 0, S: 0, P: 0 }, spine: { S: 0 }, events: [], stats: {}, ...o }, null, 2))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify(配置, null, 2))
}
const 池 = () => JSON.parse(readFileSync(join(目录, '情绪池.json'), 'utf8'))
function 起插件() {
  const 路由 = new Map()
  let 监听 = []
  const ctx = { on(n, f) { 监听.push(f) }, effect(fn) { const r = fn(); return typeof r === 'function' ? r : () => {} }, webServer: { register(o) { 路由.set(o.path, o.handler); return () => {} } }, systemPrompt: { context: () => () => {} }, llm: {}, agents: { list: () => [] } }
  M.apply(ctx)
  return { 路由 }
}
async function 调(路由, path, 体 = null) {
  let 回 = ''
  const req = { method: 体 ? 'POST' : 'GET', socket: { remoteAddress: '127.0.0.1' }, async *[Symbol.asyncIterator]() { if (体) yield JSON.stringify(体) } }
  await 路由.get(path)(req, { statusCode: 200, setHeader() {}, end(s) { 回 = String(s) } })
  return JSON.parse(回)
}

test('|ΔP|<0.15：不计次（s/a 不动，只刷新最近）', async () => {
  写池({ p_state: { 爽: { s: 1, a: 1, 最近: null }, 痛: { s: 1, a: 1, 最近: null } }, P敏感迁移: { at: 天前(0) } })
  const p = 起插件()
  const r = await 调(p.路由, '/dsh-emotion-pool/report', { P: 10 })
  assert.equal(r.ok, true)
  const 后 = 池()
  assert.equal(后.p_state.爽.s, 1)
  assert.equal(后.p_state.爽.a, 1)
  assert.ok(后.p_state.爽.最近)
})

test('不应期内：s 只涨一次、a 继续涨', async () => {
  写池({ p_state: { 爽: { s: 1, a: 1, 最近: null }, 痛: { s: 1, a: 1, 最近: null } }, P敏感迁移: { at: 天前(0) } })
  const p = 起插件()
  await 调(p.路由, '/dsh-emotion-pool/report', { P: 30 })
  await 调(p.路由, '/dsh-emotion-pool/report', { P: 30 })
  const 后 = 池()
  assert.ok(Math.abs(后.p_state.爽.s - 1.005) < 1e-9, String(后.p_state.爽.s))
  assert.ok(Math.abs(后.p_state.爽.a - 1.004) < 1e-9, String(后.p_state.爽.a))
})

test('出不应期：按强度再涨 s', async () => {
  写池({ p_state: { 爽: { s: 1.005, a: 1.004, 最近: 天前(0.3), 计入: 天前(0.3) }, 痛: { s: 1, a: 1, 最近: null } }, P敏感迁移: { at: 天前(0) } })
  const p = 起插件()
  await 调(p.路由, '/dsh-emotion-pool/report', { P: 30 })
  const 后 = 池()
  assert.ok(Math.abs(后.p_state.爽.s - 1.010) < 1e-9, String(后.p_state.爽.s))
})

test('戒断：>3 天没爽 → a −0.002、P 推 −0.01、记「渴求」', () => {
  写池({ p_state: { 爽: { s: 1.1, a: 0.9, 最近: 天前(4) }, 痛: { s: 1, a: 1, 最近: null } }, P敏感迁移: { at: 天前(0) } })
  M.检查戒断(Date.now())
  const 后 = 池()
  assert.ok(Math.abs(后.p_state.爽.a - 0.896) < 1e-9, String(后.p_state.爽.a))
  assert.ok(Math.abs(后.spine.P + 0.01) < 1e-9, String(后.spine.P))
  const 渴 = (后.结 || []).filter((x) => x.类型 === '渴求')
  assert.equal(渴.length, 1)
  assert.equal(渴[0].轴, 'P')
})

test('/state：敏感适应带 不应期到 与 渴求', async () => {
  写池({ p_state: { 爽: { s: 1.1, a: 0.9, 最近: 天前(4) }, 痛: { s: 1, a: 1, 最近: null } }, P敏感迁移: { at: 天前(0) } })
  const p = 起插件()
  const s = await 调(p.路由, '/dsh-emotion-pool/state')
  assert.equal(s.敏感适应.爽.渴求, true)
  assert.ok('不应期到' in s.敏感适应.爽)
})