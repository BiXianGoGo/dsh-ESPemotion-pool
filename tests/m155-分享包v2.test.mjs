// 2026-11-19 任务单 1505（分享包 v2）：带 500 条匿名种子、导入落盘/保留/拒收。
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, existsSync, readFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), 'ep-packv2-'))
process.env.EMOTION_POOL_DIR = 目录
process.env.EP_SEED_PATH = join(目录, '不存在的种子.json') // 关掉 assets 回退，免得读到随包种子
const 模 = await import('../lib/index.js')

const 三轴 = (n) => Array.from({ length: 500 }, (_, i) => ({
  id: 's' + (i + 1),
  轴: { E: [0, 0.2 + n * 0.01 + (i % 3) * 0.01], S: [-0.1, 0], P: [0, 0.1] },
  注: n,
}))

function 写种子 (n = 1) {
  writeFileSync(join(目录, '情绪池-种子-500.json'), JSON.stringify({ 版本: 1, 格式: 'EPN-seed', n0: 500, 来源: 'E:\\whale-home\\memory\\x', 曲线: 三轴(n) }, null, 1), 'utf8')
}
function 命名 () {
  return { 名字: [{ 名: '甲', 形状: { 类型: '区间', E: [0, 0.3], S: [-0.1, 0.1], P: [0, 0.2] }, 互斥: [] }] }
}
function 包 (版本 = 2, 种子 = null, 哈希 = null, 名 = '名字1') {
  const p = { 格式: 'EPN-pack', 版本, 生成时间: '2026-11-19T00:00:00.000Z', 引擎范围: { 最低: '0.2.5', 最高: '0.3.0' }, 元: { 匿名: true, 含种子: !!种子 }, 条目: [{ 名字: 名, 形状: null, 元: { 类: '当下', 互斥: [] } }] }
  if (版本 === 2) { p.种子 = 种子; p.种子哈希 = 哈希 == null ? (种子 ? 模.种子哈希(种子) : null) : 哈希 }
  p.校验 = { 条数: p.条目.length, sha256: 模.包校验和(p) }
  return p
}
function 注册路由 () {
  const 路由 = []
  const ctx = { systemPrompt: { context () { return () => {} } }, on () {}, effect (fn) { fn(); return () => {} }, webServer: { register (r) { 路由.push(r); return () => {} } } }
  模.apply(ctx)
  return 路由
}
const 路由们 = 注册路由()
async function 打 (path, 体) {
  const r = 路由们.find((x) => x.path === '/dsh-emotion-pool' + path)
  let out = ''
  const req = { method: 体 ? 'POST' : 'GET', url: '/dsh-emotion-pool' + path, socket: { remoteAddress: '127.0.0.1' } }
  if (体) req[Symbol.asyncIterator] = async function* () { yield Buffer.from(JSON.stringify(体)) }
  const res = { statusCode: 200, setHeader () {}, end (x) { out = x } }
  await r.handler(req, res)
  return { 码: res.statusCode, o: JSON.parse(out) }
}
const 码 = (p) => 模.编码分享包(p)

test('m155-1 导出 v2 带 500 条、无路径/时间/sid、种子哈希对得上', async () => {
  写种子(1)
  const p = 模.生成分享包(命名(), { 匿名: true })
  assert.equal(p.版本, 2)
  assert.equal(p.种子.格式, 'EPN-seed')
  assert.equal(p.种子.轮数, 500)
  assert.deepEqual(p.种子.轴, ['E', 'S', 'P'])
  assert.equal(p.种子.曲线.length, 500)
  assert.equal(p.种子哈希, 模.种子哈希(p.种子))
  const s = JSON.stringify(p)
  assert.ok(!s.includes('whale-home'), '种子里不许带路径')
  assert.ok(!s.includes('"注"'), '种子只许带数字')
  const r = await 打('/pack/export', null)
  assert.equal(r.码, 200)
  assert.equal(r.o.版本, 2)
  assert.equal(r.o.种子.含, true)
  assert.equal(r.o.种子.条数, 500)
})

test('m155-2 无本地种子 → 预演将写入、确认后文件在且 500 条', async () => {
  const p0 = join(目录, '情绪池-种子-500.json')
  if (existsSync(p0)) unlinkSync(p0)
  const p = 包(2, 模.规范化种子({ 曲线: 三轴(1) }))
  const 预 = await 打('/pack/import', { 码: 码(p), 预演: true })
  assert.equal(预.码, 200)
  assert.equal(预.o.种子.将写入, true)
  assert.equal(预.o.种子.原因, '本地无种子')
  assert.ok(!existsSync(p0), '预演不写盘')
  const 确 = await 打('/pack/import', { 码: 码(p), 预演: false, 确认: true })
  assert.equal(确.码, 200)
  assert.equal(确.o.种子.已写, true)
  const o = JSON.parse(readFileSync(p0, 'utf8'))
  assert.equal(o.曲线.length, 500)
  assert.ok(o.来源 === '分享包导入')
})

test('m155-3 本地不同种子 → 保留本地，文件一字不变', async () => {
  const p0 = join(目录, '情绪池-种子-500.json')
  写种子(2)
  const 前 = readFileSync(p0)
  const p = 包(2, 模.规范化种子({ 曲线: 三轴(3) }))
  const 预 = await 打('/pack/import', { 码: 码(p), 预演: true })
  assert.equal(预.o.种子.将写入, false)
  assert.equal(预.o.种子.原因, '本地种子不同，保留本地')
  const 确 = await 打('/pack/import', { 码: 码(p), 预演: false, 确认: true })
  assert.equal(确.码, 200)
  assert.equal(确.o.种子.已写, false)
  assert.deepEqual(readFileSync(p0), 前, '本地种子不许被覆盖')
})

test('m155-4 v1 包仍能导入（无种子、不报错）', async () => {
  const p = 包(1, null, null, '名字V1')
  const 预 = await 打('/pack/import', { 码: 码(p), 预演: true })
  assert.equal(预.码, 200)
  assert.equal(预.o.种子.条数, 0)
  assert.equal(预.o.种子.将写入, false)
  assert.equal(预.o.种子.原因, 'v1 包不含种子')
  assert.equal(预.o.将新增, 1)
})

test('m155-5 坏种子被拒、不写盘', async () => {
  const p0 = join(目录, '情绪池-种子-500.json')
  写种子(2)
  const 前 = readFileSync(p0)
  const 少 = 模.规范化种子({ 曲线: 三轴(1).slice(0, 499) })
  let r = await 打('/pack/import', { 码: 码(包(2, 少)), 预演: true })
  assert.equal(r.码, 400)
  assert.ok(String(r.o.解析失败).includes('种子结构不对'))
  const 越 = 模.规范化种子({ 曲线: 三轴(1) })
  越.曲线[0].E = [0, 1.5]
  r = await 打('/pack/import', { 码: 码(包(2, 越)), 预演: true })
  assert.equal(r.码, 400)
  const 齐 = 模.规范化种子({ 曲线: 三轴(1) })
  齐.曲线[3].S = [0]
  r = await 打('/pack/import', { 码: 码(包(2, 齐)), 预演: true })
  assert.equal(r.码, 400)
  const 好 = 模.规范化种子({ 曲线: 三轴(1) })
  r = await 打('/pack/import', { 码: 码(包(2, 好, 'f'.repeat(64))), 预演: true })
  assert.equal(r.码, 400)
  assert.ok(String(r.o.解析失败).includes('种子校验不符'))
  assert.deepEqual(readFileSync(p0), 前, '坏包不许碰本地种子')
})
