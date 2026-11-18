import test from 'node:test'
import assert from 'node:assert/strict'
import {
  中位,
  百分位,
  净位移,
  路径长度,
  跳变,
  回落,
  折返,
  回归,
  折点,
  形状,
  形状距离,
  新尺,
  状态判定,
  三轴状态,
  走表,
  生长分叉,
  判归属,
  取名字,
  未命名枝,
  先验门槛,
} from '../lib/shape.js'
import { 分位上取, 算门槛, 算权重, 算基线, 校准, 该落盘, 写轮画像, 读轮画像, 追加轮画像 } from '../lib/calib.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('0.2.7 S1：状态三态 + 跳变（回归与单步）', () => {
  // 平稳：单步很小、R² 低
  const 平 = [0.5, 0.49, 0.5, 0.49, 0.5]
  assert.equal(状态判定(平, { 基线: 0.05, 趋势: 0.9, 跳变: 0.5 }, 0.05).状态, '基线')
  // 抖动：单步大、R² 低
  const 抖 = [0, 0.3, 0, 0.3, 0]
  assert.equal(状态判定(抖, { 基线: 0.05, 趋势: 0.9, 跳变: 0.9 }, 0.05).状态, '波动')
  // 趋势：线性 R²=1、斜率显著
  const 趋 = [0, 0.1, 0.2, 0.3, 0.4]
  const r = 回归(趋)
  assert.ok(r.R2 > 0.999 && Math.abs(r.斜率 - 0.1) < 1e-9)
  assert.equal(状态判定(趋, { 基线: 0.2, 趋势: 0.45, 跳变: 0.9 }, 0.05).状态, '趋势')
  // 跳变：单步 ≥ 门槛，优先级最高
  const 跳 = [0, 0, 0.6, 0.6]
  assert.equal(状态判定(跳, { 基线: 0.05, 趋势: 0.45, 跳变: 0.5 }, 0.05).状态, '跳变')
  // 2026-11-18：突变要求 >=2 轴同跳；单轴跳不合成跳变
  const 单合 = 三轴状态({ E: 平, S: 平, P: 跳 }, { 基线: 0.05, 趋势: 0.45, 跳变: 0.5 }, 0.05)
  assert.notEqual(单合.状态, '跳变')
  assert.equal(单合.同跳轴, 1)
  // 两轴同跳 → 合成跳变
  const 合 = 三轴状态({ E: 平, S: 跳, P: 跳 }, { 基线: 0.05, 趋势: 0.45, 跳变: 0.5 }, 0.05)
  assert.equal(合.状态, '跳变')
  assert.equal(合.同跳轴, 2)
  assert.equal(合.轴.P.状态, '跳变')
})

test('0.2.7 S2：曲线特征（净位移/路径/回落/折返/折点）', () => {
  assert.ok(Math.abs(净位移([0.1, 0.2, 0.35]) - 0.25) < 1e-9)
  assert.ok(Math.abs(路径长度([0.1, 0.2, 0.35]) - 0.25) < 1e-9)
  assert.equal(跳变([0, 0.1, 0.4]), 0.30000000000000004)
  assert.ok(Math.abs(回落([0.1, 0.5, 0.3], 1) - 0.2) < 1e-9) // 正方向：峰后回落
  assert.ok(Math.abs(回落([0.5, 0.1, 0.3], -1) - 0.2) < 1e-9) // 负方向：谷后回弹
  assert.equal(折返([0, 0.2, 0.1, 0.2]), 2)
  const 折 = 折点([0, 0.2, 0.1, 0.2])
  assert.ok(折.折数 >= 1)
  assert.ok(折.θ.every((x) => x >= 0 && x <= 1))
})

test('0.2.7 S3：形状距离（D距=长度差÷较长者，D角空序列给中性）', () => {
  const a = 形状([0, 0.2, 0.4, 0.5])
  const b = 形状([0, 0.2, 0.4, 0.5])
  const 同 = 形状距离(a, b)
  assert.equal(同.D, 0)
  assert.equal(同.相似度, 1)
  const 短 = 形状([0, 0.2])
  const 距 = 形状距离(a, 短)
  assert.ok(距.距 > 0 && 距.D > 0)
  const 直 = 形状([0, 0.1, 0.2, 0.3])
  const 折 = 形状([0, 0.2, 0.0])
  assert.equal(形状距离(直, 折).角, 0.5) // 一边有折点、一边没有：给中性值
})

test('0.2.7 S4：新尺与三层归属', () => {
  assert.ok(Math.abs(新尺(0.9, 0.5) - 0.8) < 1e-9)
  assert.equal(新尺(0.4, 0.5), 0)
  assert.equal(判归属(0.9).层, '归入')
  assert.equal(判归属(0.6).层, '变体')
  assert.equal(判归属(0.3).层, '待命名')
  assert.equal(判归属(0.6, 25).提示, '变体超过 20，要不要拆？')
})

test('0.2.7 S5：分位门槛（先验 → 池内分位）', () => {
  assert.ok(Math.abs(百分位([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.3) - 3.7) < 1e-9)
  const 少 = 算门槛([{ 轴: { E: { 单步中位: 0.1, R2: 0.2, 跳变: 0.3, 斜率: 0.01 } } }])
  assert.equal(少.先验, true)
  assert.equal(少.基线, 先验门槛.基线)
  const 样本 = []
  for (let i = 0; i < 600; i++) {
    const v = i / 600
    样本.push({ 轴: { E: { 单步中位: v, R2: v, 跳变: v * 2, 斜率: v } } })
  }
  const 多 = 算门槛(样本)
  assert.equal(多.先验, false)
  assert.equal(多.样本数, 600)
  assert.ok(多.基线 > 0.65 && 多.基线 < 0.72) // 30% 分位 ≈0.7（不下取/不上取）
  assert.ok(Math.abs(分位上取([0.1, 0.2, 0.2, 0.3], 0.5) - 0.3) < 1e-9) // 0.2 落在同分上 → 0.3
  assert.ok(多.跳变 >= 1.8 && 多.跳变 < 2) // 单步最猛 5%，按 0.1 网格向下取整格
})

test('0.2.7 S6：逆标准差权重 + 冷启动收缩', () => {
  const 曲 = []
  for (let i = 0; i < 60; i++) {
    // 角度变化多、数/距变化少 → 角 的 σ 大 → 权重小
    const v = [0, 0.1 + (i % 7) * 0.01, 0.2, 0.18 + (i % 5) * 0.005]
    曲.push(v)
  }
  const w = 算权重(曲)
  assert.equal(w.先验, false)
  assert.ok(Math.abs(w.角 + w.数 + w.距 - 1) < 1e-3)
  assert.ok(w.角 > 0 && w.角 < 1)
  // 完全相同的一批曲线：σ 全 0 → 三项权重回落到均分
  const 同 = 算权重([曲[0], 曲[0], 曲[0], 曲[0]])
  assert.ok(Math.abs(同.角 - 1 / 3) < 1e-3)
  const 少 = 算权重([曲[0], 曲[1]])
  assert.equal(少.先验, true)
  assert.ok(Math.abs(少.角 - 1 / 3) < 1e-9)
})

test('0.2.7 S7：相似度基线与自动生长', () => {
  const 曲 = []
  for (let i = 0; i < 40; i++) 曲.push([0, 0.1 * (i % 5), 0.2 * (i % 3)])
  const 基 = 算基线(曲)
  assert.ok(基.基线 >= 0 && 基.基线 <= 1)
  assert.ok(基.对 > 0)
  const 样本 = []
  for (let i = 0; i < 40; i++) 样本.push({ 曲线: i < 20 ? [0, 0.3, 0] : [0.2, 0.1, 0] })
  const 分 = 生长分叉(样本, { 生长距离: 0.1 })
  assert.ok(分 && 分.左 >= 10 && 分.右 >= 10)
  assert.equal(生长分叉(样本.slice(0, 10)), null)
})

test('0.2.7 S8：走表 3 问 8 片 + 名字挂枝 + 未命名枝', () => {
  const 有方向 = 走表([0.0, 0.1, 0.2, 0.18], 0.15)
  assert.equal(有方向.叶子, '有方向|正|未回落')
  assert.equal(走表([0.0, 0.1, 0.2, 0.1], 0.15).叶子, '有方向|正|回落')
  assert.equal(走表([0.4, 0.2, 0.0], 0.15).叶子, '有方向|负|未回落')
  const 无 = 走表([0, 0.1, 0, 0.02], 0.05)
  assert.ok(无.叶子.startsWith('无方向|'))
  const 表 = { 有方向: '有速度' }
  assert.equal(取名字('有方向|正|未回落', 表).名, '有速度')
  assert.equal(取名字('无方向|抖大|折返', 表).名, null)
  assert.ok(未命名枝('无方向|抖大|折返', 12).includes('12 轮'))
})

test('0.2.7 S9：轮画像环形缓冲（≤2000）', () => {
  const 家 = mkdtempSync(join(tmpdir(), 'esp-rounds-'))
  try {
    for (let i = 0; i < 2010; i++) 追加轮画像('测', { t: i }, 家)
    const o = 读轮画像('测', 家)
    assert.equal(o.记录.length, 2000)
    assert.equal(o.记录[0].t, 10)
    写轮画像('测', 家, { 记录: [] })
    assert.equal(读轮画像('测', 家).记录.length, 0)
  } finally {
    rmSync(家, { recursive: true, force: true })
  }
})

test('0.2.7 S10：校准合并 + 是否落盘', () => {
  const 记录 = []
  for (let i = 0; i < 520; i++) {
    const v = [0, (i % 7) * 0.05, (i % 5) * 0.04]
    记录.push({ 曲线: { E: v, S: v, P: v }, 状态: '波动' })
  }
  const c = 校准(记录)
  assert.equal(c.门槛.先验, false)
  assert.ok(c.样本数 === 520)
  assert.ok(c.相似度基线 >= 0 && c.相似度基线 <= 1)
  assert.equal(该落盘({ 基线: c.门槛.基线 + 0.001 }, c.门槛), false)
  assert.equal(该落盘({ 基线: c.门槛.基线 + 0.2 }, c.门槛), true)
  assert.equal(该落盘({ 角: 0.9 }, c.权重), true)
})

test('0.2.7 S11：三轴判定逐轴另存、中位工具', () => {
  const r = 三轴状态({ E: [0, 0.1, 0.2, 0.3], S: [0.5, 0.5, 0.5], P: [0.1, 0.1] }, { 基线: 0.05, 趋势: 0.9, 跳变: 0.9 }, 0.05)
  assert.equal(r.轴.E.状态, '趋势')
  assert.equal(r.轴.S.状态, '基线')
  assert.equal(r.状态, '趋势')
  assert.equal(中位([3, 1, 2]), 2)
  assert.equal(中位([4, 1, 3, 2]), 2.5)
})
