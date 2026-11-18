import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { 三轴签名, 平均相似度, 走表, 片号, 叶枝, 片们 } from '../lib/shape.js'

const 根 = join(dirname(fileURLToPath(import.meta.url)), '..')
const 源码 = (p) => readFileSync(join(根, p), 'utf8')

// 造点：E/S/P 三轴序列 → {E,S,P}[] 数组
function 点(E, S = [], P = []) {
  const n = E.length
  return Array.from({ length: n }, (_, i) => ({ E: E[i], S: S[i] || 0, P: P[i] || 0 }))
}

test('m150-1 三轴定名：E 相同但 S/P 不同，不应算同形；三轴都同才高分', () => {
  const 甲 = 点([0, 0.2, 0.4, 0.6], [0, 0, 0, 0], [0, 0, 0, 0])
  const 乙 = 点([0, 0.2, 0.4, 0.6], [0, 0.5, 0.2, 0.6], [0.4, 0, 0.5, 0.1])
  const 形甲 = 三轴签名(甲)
  const 形乙 = 三轴签名(乙)
  const 同 = 平均相似度(形甲, 形甲)
  const 异 = 平均相似度(形甲, 形乙)
  assert.ok(同 && 异)
  assert.ok(同.相似度 > 0.99, '三轴都同应接近 1，实际 ' + 同.相似度)
  assert.equal(同.轴数, 3)
  assert.ok(异.相似度 < 0.95, 'S/P 不同不该判同形，实际 ' + 异.相似度)
  assert.ok(异.逐轴 && 异.逐轴.E > 0.99, 'E 轴单看仍应相同')
  assert.ok(异.逐轴.S < 0.99 || 异.逐轴.P < 0.99)
})

test('m150-2 老单轴原型（顶层 θ）能读、按 E 轴比较、不崩', () => {
  const 新形 = 三轴签名(点([0, 0.2, 0.4], [0, 0, 0], [0, 0, 0]))
  const 老原型 = { θ: [0.25, 0.25], 折数: 0, g: [], 路径: 0.4 }
  const d = 平均相似度(新形, 老原型)
  assert.ok(d)
  assert.equal(d.轴数, 1)
  assert.equal(d.逐轴.E != null, true)
})

test('m150-3 8 片：八条叶子都能定位到 1..8，且枝是父路径', () => {
  const 例 = [
    [0, 0.4, 0.8, 0.4], // 有方向|正|回落
    [0, 0.2, 0.4, 0.6], // 有方向|正|未回落
    [0, -0.4, -0.8, -0.4], // 有方向|负|回落
    [0, -0.2, -0.4, -0.6], // 有方向|负|未回落
    [0, 0.2, 0, 0.2, 0], // 无方向|抖大|折返
    [0, 0.03, 0.06, 0.09], // 无方向|抖大|单向（中位 0）
    [0, 0.02, 0, 0.02], // 无方向|抖小|折返（中位 1）
    [0, 0.01, 0.02] // 无方向|抖小|单向（中位 1）
  ]
  const 中位路径 = [0, 0, 0, 0, 0, 0, 1, 1]
  const 得 = 例.map((v, i) => 走表(v, 中位路径[i]))
  const 号 = 得.map((x) => 片号(x.叶子))
  assert.deepEqual(号.slice().sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8])
  for (const x of 得) {
    const n = 片号(x.叶子)
    assert.equal(片们[n - 1], x.叶子)
    assert.equal(叶枝(x.叶子), x.路.slice(0, -1).join('|'))
  }
})

test('m150-4 接线：跳变不进表、片/枝写进事件与轨迹、波动只定位不定名（源码守卫）', () => {
  const idx = 源码('lib/index.js')
  assert.ok(idx.includes("轮廓贴.状态 === '基线' || 轮廓贴.状态 === '波动' || 轮廓贴.状态 === '趋势'"), '只对 基线/波动/趋势 走表')
  assert.ok(!idx.includes("轮廓贴.状态 === '跳变'"), '跳变不应进表')
  assert.ok(idx.includes('走表(v, 池路径中位('), '走表要接池路径中位')
  assert.ok(idx.includes('同轮.片 = 片'), '同轮事件要有片')
  assert.ok(idx.includes('事.片 = 片'), '新事件要有片')
  assert.ok(idx.includes('片: (推回 && 推回.片) || null'), '轨迹体要带片')
  assert.ok(idx.includes('签名: (定名 && 定名.签名) || null'), '轨迹体要带三轴签名')
  // 定名只在 定名波动（趋势相关调用）里发生，推轴体不直接命名
  assert.ok(!idx.includes('定名波动(sid, turn, 曲线'), '推轴体不应直接命名')
})

test('m150-5 /state.片分布：8 个计数 + 空片保留 + 卡片读它', () => {
  const idx = 源码('lib/index.js')
  assert.ok(idx.includes('片分布: (() => {'), '/state 要有 片分布')
  assert.ok(idx.includes('const 计 = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 }'), '8 个计数键一个不能少')
  assert.ok(idx.includes('返回 { 样本数: 画.length, 计数: 计, 无片 }') || idx.includes('return { 样本数: 画.length, 计数: 计, 无片 }'))
  const w = 源码('assets/widget.js')
  assert.ok(w.includes("观行('8 片分布'"), '卡片观测页要显示 8 片分布')
  assert.ok(w.includes('最新.片分布.计数'), '计数从 /state 取')
  assert.ok(w.includes("for (var i = 1; i <= 8; i++)"), '空片也要保留位')
})
