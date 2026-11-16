import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 根 = mkdtempSync(join(tmpdir(), 'ep-curve-'))
const 轨迹 = join(根, '情绪池-思考轨迹')
mkdirSync(轨迹, { recursive: true })
process.env.EMOTION_POOL_DIR = 根
process.env.EP_LEGACY_INJECT = '1' // 旧【此刻】格式的回归用例
const 库 = await import(new URL('../lib/index.js?curve=1', import.meta.url).href)
const 全 = 'session-34061975-c057-4526-802a-c161ddee3cca'
const 短 = '34061975'

function 造(点们, 名 = '0') {
  点们.forEach((p, i) => {
    const 段点 = [{ i: 1, E: p.E, S: p.S, P: p.P, 注: 't' }]
    writeFileSync(join(轨迹, 短 + '-' + (Number(名) + i + 1) + '.json'), JSON.stringify({ version: 1, sid: 全, turn: i + 1, t: '2026-11-15T1' + i + ':00:00+08:00', 秒: 6.2, 段数: 1, 段点, 主点: 段点[0] }), 'utf8')
  })
}
function 清() { for (const f of readdirSync(轨迹)) unlinkSync(join(轨迹, f)) }
const 池 = () => ({ rev: 1, axes: { E: 0, S: 0, P: 0 }, spine: {}, overflow: {}, events: [], 上轮波动: { 有: true, t: new Date().toISOString(), sid: 全 } })
const 配 = () => ({ 注入启用: true, 保底轮数: 1, 保底间隔分钟: 1, 注入日限: 24 })

test('E+：位移够，出「在往他那边让」', () => {
  清(); 造([{ E: 0, S: 0, P: 0 }, { E: 0.2, S: 0, P: 0 }])
  const 句 = 库.曲线一句话(池())
  assert.ok(句.includes('E 在往他那边让'))
  assert.ok(句.startsWith('【曲线的意思】最近 2 轮：'))
})
test('E−：位移够，出「在往自己这边收」', () => {
  清(); 造([{ E: 0.2, S: 0, P: 0 }, { E: 0, S: 0, P: 0 }])
  assert.ok(库.曲线一句话(池()).includes('E 在往自己这边收'))
})
test('S+：踏实下来了', () => {
  清(); 造([{ E: 0, S: -0.2, P: 0 }, { E: 0, S: 0, P: 0 }])
  assert.ok(库.曲线一句话(池()).includes('S 踏实下来了'))
})
test('S−：心里悬着', () => {
  清(); 造([{ E: 0, S: 0.2, P: 0 }, { E: 0, S: 0, P: 0 }])
  assert.ok(库.曲线一句话(池()).includes('S 心里悬着'))
})
test('P+：轻快起来', () => {
  清(); 造([{ E: 0, S: 0, P: -0.2 }, { E: 0, S: 0, P: 0 }])
  assert.ok(库.曲线一句话(池()).includes('P 轻快起来'))
})
test('P−：疼过一阵', () => {
  清(); 造([{ E: 0, S: 0, P: 0.2 }, { E: 0, S: 0, P: 0 }])
  assert.ok(库.曲线一句话(池()).includes('P 疼过一阵'))
})
test('位移小于 0.15 且无反转 → 不生成', () => {
  清(); 造([{ E: 0, S: 0, P: 0 }, { E: 0.05, S: 0.02, P: 0.01 }])
  assert.equal(库.曲线一句话(池()), null)
})
test('不足两点 → 不生成', () => {
  清(); 造([{ E: 0.2, S: 0, P: 0 }])
  assert.equal(库.曲线一句话(池()), null)
})
test('文案无 Δ/百分号且长度 ≤140', () => {
  清(); 造([{ E: 0, S: 0, P: 0 }, { E: 0.2, S: 0.2, P: 0.2 }])
  const 句 = 库.曲线一句话(池())
  assert.ok(!句.includes('Δ'))
  assert.ok(!句.includes('%'))
  assert.ok(句.length <= 140)
})
test('拐点：先…又…', () => {
  清(); 造([{ E: 0.1, S: 0, P: 0 }, { E: 0.28, S: 0, P: 0 }, { E: 0.12, S: 0, P: 0 }])
  const 句 = 库.曲线一句话(池())
  assert.ok(句.includes('先'), 句)
  assert.ok(句.includes('又'), 句)
})
test('连续 3 段同向且合计 ≥0.15 → 生成', () => {
  清(); 造([{ E: 0, S: 0, P: 0 }, { E: 0.06, S: 0, P: 0 }, { E: 0.12, S: 0, P: 0 }, { E: 0.18, S: 0, P: 0 }])
  assert.ok(库.曲线一句话(池()).includes('在往他那边让'))
})
test('30 分钟内同句不重复注入', () => {
  清(); 造([{ E: 0, S: 0, P: 0 }, { E: 0.2, S: 0, P: 0 }])
  const 一 = 库.取注入(配(), 池())
  assert.ok(一.includes('【曲线的意思】'), 一)
  const p0 = join(根, '情绪池-注入.json')
  const o0 = JSON.parse(readFileSync(p0, 'utf8'))
  o0.上次轮 = null
  writeFileSync(p0, JSON.stringify(o0), 'utf8')
  const 二 = 库.取注入(配(), Object.assign(池(), { rev: 2 }))
  assert.ok(!二.includes('【曲线的意思】'), '二=' + 二 + ' | 注入=' + readFileSync(join(根, '情绪池-注入.json'), 'utf8'))
})
test('30 分钟后可再注入（改上次时间）', () => {
  const p = join(根, '情绪池-注入.json')
  const o = JSON.parse(readFileSync(p, 'utf8'))
  o.曲线注入.上次 = new Date(Date.now() - 40 * 60000).toISOString()
  writeFileSync(p, JSON.stringify(o), 'utf8')
  const 三 = 库.取注入(配(), Object.assign(池(), { rev: 3 }))
  assert.ok(三.includes('【曲线的意思】'), 三)
})
test('无轨迹文件 → 不生成', () => {
  清()
  assert.equal(库.曲线一句话(池()), null)
})
test('/state 源码含 曲线注入 字段与初始 null', () => {
  const 源 = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
  assert.ok(源.includes('out.曲线注入 ='))
  assert.ok(源.includes("上次: null, 文案: ''"))
})
test('措辞表六项写死', () => {
  const 源 = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
  for (const 词 of ['在往他那边让', '在往自己这边收', '踏实下来了', '心里悬着', '轻快起来', '疼过一阵']) assert.ok(源.includes(词), 词)
})
