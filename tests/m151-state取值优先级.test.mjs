// 2026-11-18 策划间定：/state 展示时，池里存的「先验」门槛/权重是旧值，
// 有种子就优先用「按种子现算」的值（只改取值优先级，不写池）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), 'ep-state-prio-'))
process.env.EMOTION_POOL_DIR = 目录
const 模 = await import('../lib/index.js')
const 校准 = await import('../lib/calib.js')

const 短 = '8f689553'
const 池名 = '常用聊天组'

function 备 ({ 先验 = true } = {}) {
  mkdirSync(join(目录, '情绪池', '池'), { recursive: true })
  mkdirSync(join(目录, '情绪池-轮画像'), { recursive: true })
  const 配置 = { 启用: true, 存储模式: '分片', 刻度: 100, 装载会话: [短], 写入者: [短], 组: [{ 名: 池名, 会话: [短] }] }
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify(配置, null, 1), 'utf8')
  writeFileSync(join(目录, '情绪池', '总.json'), JSON.stringify({ rev: 1, axes: { E: 0, S: 0, P: 0 }, spine: {}, events: [] }), 'utf8')
  const 池 = {
    rev: 3,
    updated: '2026-11-18T12:46:12.857Z',
    axes: { E: 0.2, S: 0.1, P: 0 },
    spine: {},
    events: [],
    会话: [短],
    已迁移: true,
    迁移: { 版本: '0.2.5' },
    门槛: { 基线: 0.3, 趋势: 0.45, 跳变: 0.5, 斜率门: 0.02, 样本数: 60, 先验, 分位: { 基线: 0.3, 趋势: 0.2, 跳变: 0.05 } },
    权重: { 角: 0.3448, 数: 0.3204, 距: 0.3348, 样本数: 58, 先验 },
    相似度基线: 0.7651
  }
  writeFileSync(join(目录, '情绪池', '池', 池名 + '.json'), JSON.stringify(池, null, 1), 'utf8')
  // 37 轮本池画像：每轮单步中位 0.3（<500 → 本池门槛仍是先验，正好复现「池里是 0.3、种子是 0.2」）
  const 记录 = Array.from({ length: 37 }, (_, i) => ({ t: '2026-11-18T12:00:00.000Z', sid: 短, turn: i + 1, 状态: '波动', 轴: 'E', 曲线: { E: [0, 0.3], S: [0, 0], P: [0, 0] } }))
  writeFileSync(join(目录, '情绪池-轮画像', 池名 + '.json'), JSON.stringify({ 格式: 'EPN-rounds', 版本: 1, 池: 池名, 记录 }, null, 1), 'utf8')
  const 种曲 = Array.from({ length: 500 }, (_, i) => ({ id: 's' + (i + 1), 轴: { E: [0, 0.2], S: [0, 0], P: [0, 0] } }))
  writeFileSync(join(目录, '情绪池-种子-500.json'), JSON.stringify({ 版本: 1, 格式: 'EPN-seed', n0: 500, 曲线: 种曲 }, null, 1), 'utf8')
}

async function 取state () {
  const 路由 = []
  const ctx = {
    systemPrompt: { context () { return () => {} } },
    on () {},
    effect (fn) { fn(); return () => {} },
    webServer: { register (r) { 路由.push(r); return () => {} } }
  }
  模.apply(ctx)
  const r = 路由.find((x) => x.path === '/dsh-emotion-pool/state')
  let 体 = ''
  await r.handler({ url: '/dsh-emotion-pool/state' }, { setHeader () {}, end (x) { 体 = x } })
  return JSON.parse(体)
}

test('m151 池里门槛是先验 + 有种子 → /state 用种子混合值（0.2069），门种来源=种子+本池', async () => {
  备({ 先验: true })
  const s = await 取state()
  const 预期 = 校准.校准(
    Array.from({ length: 37 }, () => ({ 曲线: { E: [0, 0.3], S: [0, 0], P: [0, 0] } })),
    { 种子: 校准.读种子(目录) }
  )
  assert.equal(s.校准.种子数, 500)
  assert.ok(Math.abs(s.校准.混合比 - 37 / 537) < 1e-3)
  assert.equal(s.校准.门槛.先验, false, '先验=true 的池值不应再原样给卡片')
  assert.equal(Number(s.校准.门槛.基线.toFixed(4)), 0.2069)
  assert.equal(Number(s.校准.门槛.基线.toFixed(4)), 预期.门槛.基线, '应与 校准.校准 的结果一致')
  assert.equal(s.校准.门种来源, '种子+本池')
  assert.notEqual(Number(s.校准.门槛.趋势), 0.45, '不应再显示旧先验 0.45')
})

test('m151 池里门槛不是先验（已经落过种子值）→ 仍用池里的值', async () => {
  备({ 先验: false })
  const s = await 取state()
  assert.equal(Number(s.校准.门槛.基线), 0.3)
  assert.equal(Number(s.校准.门槛.趋势), 0.45)
  assert.equal(s.校准.门槛.先验, false)
})
