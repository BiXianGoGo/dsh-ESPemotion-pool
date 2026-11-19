// m153：2026-11-19 命名闭环——待命名存曲线 / <0.55 落待命名 / 加命名写原型 / 收录与丢弃 / 导入带原型
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const 后端 = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')

const 目录 = mkdtempSync(join(tmpdir(), 'ep-m153-'))
const SID = 'abcdef12'
const 今 = () => new Date().toISOString()
function 写(p, o) { writeFileSync(p, JSON.stringify(o, null, 2), 'utf8') }
mkdirSync(join(目录, '情绪池', '池'), { recursive: true })
mkdirSync(join(目录, '情绪池', '会话'), { recursive: true })
写(join(目录, '情绪池配置.json'), { 启用: true, 存储模式: '分片', 写入者: [SID], 装载会话: [SID], 组: [{ 名: '甲池', 会话: [SID] }] })
写(join(目录, '情绪池', '总.json'), { rev: 1, updated: 今(), 已迁移到池: true, 组: [{ 名: '甲池', 会话: [SID] }], events: [] })
写(join(目录, '情绪池', '池', '甲池.json'), {
  会话: [SID], rev: 1, updated: 今(),
  门槛: { 基线: 0.2, 趋势: 0.4, 跳变: 0.6, 斜率门: 0.02, 先验: false },
  权重: { 角: 1 / 3, 数: 1 / 3, 距: 1 / 3 },
  相似度基线: 0.99,
  events: [],
})
写(join(目录, '情绪池', '会话', SID + '.json'), { version: 1, sid: SID, 短: SID, rev: 1, 事件: [], 结: [], 快照: {}, 状态: {} })
过程第一()
function 过程第一() {
  process.env.EMOTION_POOL_DIR = 目录
}
const M = await import('../lib/index.js')
const 形 = await import('../lib/shape.js')
const 配置 = () => JSON.parse(readFileSync(join(目录, '情绪池配置.json'), 'utf8'))
const 待文件 = join(目录, '情绪池-待命名.json')
const 读待 = () => JSON.parse(readFileSync(待文件, 'utf8')).项
const 读名 = () => JSON.parse(readFileSync(join(目录, '情绪池-命名表.json'), 'utf8'))
const 读名字 = () => M.读命名(配置()).名字

function 点们(E, S = [], P = []) {
  return E.map((v, i) => ({ E: v, S: S[i] || 0, P: P[i] || 0 }))
}
const 八点 = 点们([0, 0.1, 0.2, 0.3, 0.2, 0.1, 0.2, 0.3], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0])

test('m153-1 记待命名：点落盘、同格只加次数、旧条缺 点 时补上', () => {
  M.记待命名(0.1, 0.2, 0.3, '', 八点)
  let 表 = 读待()
  assert.equal(表.length, 1)
  assert.equal(表[0].点.length, 8)
  assert.equal(表[0].次数, 1)
  M.记待命名(0.11, 0.21, 0.31, '', 八点)
  表 = 读待()
  assert.equal(表.length, 1, '同格应合并')
  assert.equal(表[0].次数, 2)
  // 旧条（无 点）同格补点
  写(待文件, { 说明: 'x', 项: [{ E: 0.2, S: 0.1, P: 0, 次数: 5, 首次: 今(), 最近: 今(), 区间名: null, 格: '' }] })
  M.记待命名(0.2, 0.1, 0, '', 八点)
  表 = 读待()
  assert.equal(表[0].次数, 6)
  assert.equal(表[0].点.length, 8, '旧条缺 点 时应补上')
})

test('m153-2 加命名：点 → 1 条原型；原型数组 → 末 12；都没有 → 空；不覆盖已有', () => {
  writeFileSync(待文件, JSON.stringify({ 说明: 'x', 项: [] }), 'utf8')
  const r1 = M.加命名(配置(), { 名: '有点名', 类: '当下', E: [0, 0.2], S: [0, 0.2], P: [0, 0.2], 点: 点们([0, 0.2, 0.4]) })
  assert.ok(r1.ok)
  assert.equal(r1.名.原型.length, 1)
  assert.equal(r1.名.变体数, 0)
  const 形 = M.加命名(配置(), {
    名: '带原型名', 类: '当下', E: [0.3, 0.5], S: [0.3, 0.5], P: [0.3, 0.5],
    原型: Array.from({ length: 15 }, () => ({ E: { θ: [0.25] }, S: { θ: [0.25] }, P: { θ: [0.25] } })),
  })
  assert.ok(形.ok)
  assert.equal(形.名.原型.length, 12)
  const 空 = M.加命名(配置(), { 名: '空原型名', 类: '当下', E: [-0.9, -0.7], S: [-0.9, -0.7], P: [-0.9, -0.7] })
  assert.ok(空.ok)
  assert.deepEqual(空.名.原型, [])
  assert.equal(空.名.来源.类型, '本地')
})

test('m153-3 闭环：<0.55 落待命名 → 收录 → 同曲线再定名命中', () => {
  // 命名表放一个原型（远形状），基线 0.9 → 新尺接近 0 → 待命名层
  const far = 点们([1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3])
  写(join(目录, '情绪池-命名表.json'), {
    格式: 'EPN-names', 版本: 1, 条目: [{ 名: '原型A', 类: '当下', E: [0.2, 0.4], S: [-0.1, 0.1], P: [-0.1, 0.1], 原型: [形.三轴签名(far)] }],
  })
  writeFileSync(待文件, JSON.stringify({ 说明: 'x', 项: [] }), 'utf8')
  const 点 = 点们([0, 0.1, 0.2, 0.3, 0.4, 0.3, 0.2, 0.1], [0, 0.1, 0.2, 0.1, 0, 0, 0, 0], [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1])
  const 波 = [{ 起: 0, 止: 7 }]
  const d1 = M.用池('甲池', () => M.定名波动(SID, 900, 点, 波, 配置()))
  assert.equal(d1.名, null)
  const 表 = 读待()
  assert.ok(表.length >= 1, '应落进待命名')
  const 条 = 表[0]
  assert.ok(Array.isArray(条.点) && 条.点.length === 8, '待命名要带末 8 点')
  const 收 = M.收录待命名(配置(), '测试名', 条.E, 条.S, 条.P)
  assert.ok(收.ok, JSON.stringify(收))
  assert.equal(收.原型数, 1)
  assert.equal(读待().length, 表.length - 1, '收录后该条应从待命名消失')
  const d2 = M.用池('甲池', () => M.定名波动(SID, 901, 点, 波, 配置()))
  assert.equal(d2.名, '测试名')
})

test('m153-4 旧条（点空）能收录但原型 0；不能在这里丢弃', () => {
  writeFileSync(待文件, JSON.stringify({ 说明: 'x', 项: [{ E: -0.5, S: -0.5, P: -0.5, 次数: 3, 首次: 今(), 最近: 今(), 区间名: null, 格: '', 点: [] }] }), 'utf8')
  const 收 = M.收录待命名(配置(), '旧条名', -0.5, -0.5, -0.5)
  assert.ok(收.ok, JSON.stringify(收))
  assert.equal(收.原型数, 0)
  writeFileSync(待文件, JSON.stringify({ 说明: 'x', 项: [{ E: -0.6, S: -0.6, P: -0.6, 次数: 1, 首次: 今(), 最近: 今(), 区间名: null, 格: '', 点: [] }] }), 'utf8')
  const 丢 = M.丢弃待命名(配置(), -0.6, -0.6, -0.6)
  assert.equal(丢.ok, false, JSON.stringify(丢))
  assert.match(String(丢.error), /旧条目/)
})

test('m153-5 丢弃：点非空可删；不碰命名表', () => {
  writeFileSync(待文件, JSON.stringify({ 说明: 'x', 项: [{ E: 0.7, S: 0.7, P: 0.7, 次数: 1, 首次: 今(), 最近: 今(), 区间名: null, 格: '', 点: 八点 }] }), 'utf8')
  const 名前 = (读名().名字 || []).length
  const r = M.丢弃待命名(配置(), 0.7, 0.7, 0.7)
  assert.ok(r.ok)
  assert.equal(读待().length, 0)
  assert.equal((读名().名字 || []).length, 名前, '丢弃不碰命名表')
})

test('m153-6 应用导入：带原型写入、不带为空；分享包骨架仍不带原型', () => {
  const 分类 = {
    将新增: [
      { 名字: '导入甲', 形状: { 类型: '区间', E: [0, 0.2], S: [0, 0.2], P: [0, 0.2] }, 元: { 类: '当下', 互斥: [] }, 原型: [{ E: { θ: [0.2] }, S: { θ: [0.2] }, P: { θ: [0.2] } }] },
      { 名字: '导入乙', 形状: { 类型: '区间', E: [0.3, 0.5], S: [0.3, 0.5], P: [0.3, 0.5] }, 元: { 类: '当下', 互斥: [] } },
    ],
    撞名: [], 版本不符: [],
  }
  const r = M.应用导入(分类, 配置())
  assert.equal(r.新增, 2)
  const 表 = 读名字()
  const 甲 = 表.find((x) => x.名 === '导入甲')
  const 乙 = 表.find((x) => x.名 === '导入乙')
  assert.equal(甲.原型.length, 1)
  assert.deepEqual(乙.原型, [])
  // 分享包白名单不含 原型（v1）
  const 包 = M.生成分享包({ 名字: 读名字() })
  const 文 = JSON.stringify(包)
  assert.equal(文.includes('原型'), false)
})

test('m153-7 待命名候选：按次数降序、旧条 旧:true、新条 点 与 旧:false', () => {
  writeFileSync(待文件, JSON.stringify({ 说明: 'x', 项: [
    { E: 0.1, S: 0.1, P: 0.1, 次数: 2, 首次: 今(), 最近: 今(), 点: 八点 },
    { E: -0.2, S: -0.2, P: -0.2, 次数: 9, 首次: 今(), 最近: 今(), 点: [] },
  ] }), 'utf8')
  const 候 = M.待命名候选()
  assert.equal(候.length, 2)
  assert.equal(候[0].次数, 9)
  assert.equal(候[0].旧, true)
  assert.deepEqual(候[0].点, [])
  assert.equal(候[1].旧, false)
  assert.equal(候[1].点.length, 8)
})

test('m153-8 注入路径不再写待命名（只剩定名波动两处）', () => {
  assert.equal(后端.includes('if (!名) 记待命名(现.轴.E'), false, '注入路径不许再调 记待命名')
  assert.ok(后端.includes('注入未命名'))
  const 次数 = (后端.match(/记待命名\(/g) || []).length
  assert.equal(次数, 3, '函数声明 1 + 定名波动两处 2（注入路径 0）')
})
