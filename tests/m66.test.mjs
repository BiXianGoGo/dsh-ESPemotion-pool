import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const 库 = new URL('../lib/index.js', import.meta.url).href
const 双 = new URL('../lib/dual.js', import.meta.url).href
const 源 = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
const 屏源 = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')

test('A2 比曲线：平均偏移与对齐率', async () => {
  const { 比曲线 } = await import(双)
  const 我 = [{ E: 1, S: 0, P: 0 }, { E: 3, S: 1, P: -1 }, { E: 4, S: 2, P: -2 }]
  const 它 = [{ E: 1, S: 0, P: 0 }, { E: 2, S: 1, P: -2 }, { E: 5, S: 3, P: -1 }]
  const r = 比曲线(我, 它, 0.15, 1, 1)
  assert.equal(r.平均偏移.E, Number(((0 + 1 + 1) / 3).toFixed(3)))
  assert.equal(r.采用, '它')
  assert.ok(r.对齐率 >= 0 && r.对齐率 <= 1)
  assert.equal(r.段数, 3)
})

test('A2 比曲线：整体偏移超阈时采用分身，K低只标不可靠', async () => {
  const { 比曲线 } = await import(双)
  const 我 = [{ E: 0, S: 0, P: 0 }, { E: 5, S: 5, P: 5 }]
  const 它 = [{ E: 0, S: 0, P: 0 }, { E: 0, S: 0, P: 0 }]
  const r = 比曲线(我, 它, 0.15, 1, 0.7)
  assert.equal(r.采用, '它')
  assert.equal(r.点.E, 0)
  assert.equal(r.不可靠, false)
  const r2 = 比曲线(我, 它, 0.15, 0.55, 0.55)
  assert.equal(r2.不可靠, true)
  assert.equal(r2.采用, '它')
  assert.equal(r2.点.E, 0)
})

test('A2 解析曲线JSON：围栏、夹紧、坏输入、归一与原始点', async () => {
  const { 解析曲线JSON } = await import(库)
  const 好 = '```json\n{"点":[{"E":1,"S":-2,"P":12,"依据":"他在说话"}]}\n```'
  const r = 解析曲线JSON(好)
  assert.equal(r.length, 1)
  // 2026-11-16 C：先夹 ±9，再 ÷9 归一到 ±1；原始整数另存。
  assert.equal(r[0].P, 1)
  assert.equal(r[0].E, Number((1 / 9).toFixed(4)))
  assert.equal(r[0].S, Number((-2 / 9).toFixed(4)))
  assert.deepEqual(r[0].原始点数, { E: 1, S: -2, P: 9 })
  assert.equal(解析曲线JSON('不是 json'), null)
  assert.equal(解析曲线JSON('{"点":[{"E":"x","S":0,"P":0}]}'), null)
})

test('A2 接线：跑本轮同步写池，曲线在轨迹后补记（不改数值）', () => {
  assert.ok(源.includes('export async function 跑本轮(ctx, session, sid, 轮, 回复文, 解, 用户话, 轨)'))
  assert.ok(源.includes('分身看曲线'))
  assert.ok(源.includes('比曲线(轨.段点'))
  assert.ok(源.includes('曲线: 曲线 ?'))
  assert.ok(源.includes('补曲线(ctx, session, sid, d.turn, r)'))
  assert.ok(源.includes('跑本轮(ctx, session, sid, d.turn, 文, 解, 最近用户.get(sid) || 最后用户).catch'))
})

test('A4 曲线速度：默认与设置键', () => {
  assert.ok(源.includes('曲线速度: 40,'))
  assert.ok(源.includes("{ 键: '曲线速度', 名: '曲线速度'"))
  assert.ok(/范围: \[10, 200\]/.test(源))
})

test('A4 折线动画：速度限速、时长夹在 0.4~2 倍', () => {
  assert.ok(屏源.includes('translateX'))
  assert.ok(屏源.includes('0.4 * (Number(设置视觉().动画时长)'))
  assert.ok(屏源.includes('2 * (Number(设置视觉().动画时长)'))
  assert.ok(屏源.includes('设置视觉().曲线速度'))
  assert.ok(屏源.includes('上次点数 + 1'))
})
