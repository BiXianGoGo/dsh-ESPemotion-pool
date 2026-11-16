import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as 模 from '../lib/index.js'

const 源 = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')

test('spine 只在顶层加一次：组现值不含 spine', () => {
  const p = { 组零点: { A: { E: 0, S: 0, P: 0 } }, 组六头: { A: {} }, 会话快照: {}, 快照启用: true, spine: { E: 0.5, S: 0.5, P: 0.5 } }
  const v = 模.组现值(p, { 名: 'A', 会话: [] })
  assert.equal(v.轴.E, 0)
  assert.equal(v.合.E, 0)
})

test('顶层 axes 在 Σ组轴 之外再加一次 spine', () => {
  assert.ok(源.includes('for (const k of 轴们) 和[k] += Number(池.spine && 池.spine[k]) || 0'))
  assert.ok(!源.includes("合[k] += Number(池 && 池.spine && 池.spine[k]) || 0"))
})
// ── 情绪模板 A 段（tpl.js）───────────────────────────────
import * as T from '../lib/tpl.js'

function 点s(值列, 间 = 60e3, 起 = '2026-11-14T00:00:00+08:00') {
  const t0 = Date.parse(起)
  return 值列.map((v, i) => ({ t: new Date(t0 + i * 间).toISOString(), E: v.E, S: v.S, P: v.P }))
}
function 升(n = 5) { return 点s(Array.from({ length: n + 1 }, (_, i) => ({ E: i / n, S: i / n, P: 0 }))) }

test('tpl 签名：三轴段数、长求和≈1、位单调', () => {
  const s = T.签名(升(4))
  assert.equal(s.段数, 4)
  for (const k of ['E', 'S', 'P']) {
    assert.equal(s[k].length, 4)
    assert.ok(Math.abs(s[k].reduce((x, y) => x + y.长, 0) - 1) < 1e-6)
    assert.equal(s[k][0].位, 0)
    assert.ok(s[k].every((x, i, a) => i === 0 || x.位 >= a[i - 1].位))
  }
})

test('tpl 签名：t 缺失时退回点数占比', () => {
  const s = T.签名([{ E: 0 }, { E: 1 }, { E: 2 }])
  assert.equal(s.段数, 2)
  assert.ok(Math.abs(s.E[0].长 - 0.5) < 1e-9)
})

test('tpl 签名：涨角为正、跌角为负', () => {
  const 涨 = T.签名(点s([{ E: 0 }, { E: 1 }]))
  const 跌 = T.签名(点s([{ E: 1 }, { E: 0 }]))
  assert.ok(涨.E[0].角 > 0)
  assert.ok(跌.E[0].角 < 0)
})

test('tpl 角相关：同向=1、镜像=-1、常量=0', () => {
  const a = T.签名(升(6)), b = T.签名(升(6))
  assert.ok(Math.abs(T.角相关(a.E, b.E) - 1) < 0.2)
  const 镜 = T.签名(点s(Array.from({ length: 7 }, (_, i) => ({ E: 1 - i / 6 }))))
  assert.ok(T.角相关(a.E, 镜.E) < -0.2)
  const 平 = T.签名(点s(Array.from({ length: 7 }, () => ({ E: 0 }))))
  assert.equal(T.角相关(a.E, 平.E), 0)
})

test('tpl 相似度：同形状不同长度 > 0.8', () => {
  const 短 = T.签名(升(4)), 长 = T.签名(升(9))
  const r = T.相似度(短, 长)
  assert.ok(r.分 > 0.8, String(r.分))
  assert.ok(r.量级差 < 0.2)
})

test('tpl 相似度：同一份 = 1 分、量级 0', () => {
  const s = T.签名(升(6))
  const r = T.相似度(s, s)
  assert.ok(r.分 >= 1 - 1e-9)
  assert.ok(r.量级差 < 1e-9)
})

test('tpl 相似度：整体平移 0.5 → 量级差 0.5', () => {
  const a = T.签名(升(5))
  const b = T.签名(升(5).map((p) => ({ ...p, E: p.E + 0.5 })))
  assert.ok(Math.abs(T.相似度(a, b).量级差 - 0.5) < 1e-9)
})

test('tpl 判模板：镜像被方向门拦成未命中', () => {
  const 升签 = T.签名(升(6))
  const 降签 = T.签名(点s(Array.from({ length: 7 }, (_, i) => ({ E: 1 - i / 6, S: 1 - i / 6, P: 0 }))))
  const r = T.判模板(升签, [{ 名: '升', 签名: 降签 }])
  assert.equal(r.结论, '未命中')
})

test('tpl 判模板：量级差 0.5 → 量级不符', () => {
  const a = T.签名(升(5))
  const 大 = T.签名(升(5).map((p) => ({ ...p, E: p.E + 0.5, S: p.S + 0.5 })))
  const r = T.判模板(a, [{ 名: '大', 签名: 大 }])
  assert.equal(r.结论, '量级不符')
  assert.ok(r.量级差 > 0.3)
})

test('tpl 判模板：命中时返回名与分', () => {
  const a = T.签名(升(6))
  const r = T.判模板(a, [{ 名: '升', 签名: T.签名(升(8)) }])
  assert.equal(r.结论, '命中')
  assert.equal(r.名, '升')
  assert.ok(r.分 >= 0.8)
})

test('tpl 判模板：取最高分', () => {
  const a = T.签名(升(6))
  const 近 = T.签名(升(7))
  const 远 = T.签名(升(3))
  const r = T.判模板(a, [{ 名: '远', 签名: 远 }, { 名: '近', 签名: 近 }])
  assert.equal(r.名, '近')
})

test('tpl 判模板：空模板集 → 未命中', () => {
  const r = T.判模板(T.签名(升(4)), [])
  assert.equal(r.结论, '未命中')
  assert.equal(r.名, null)
})

test('tpl 判模板：三轴长度不同不抛错', () => {
  const p = 点s([{ E: 0, S: 0, P: 0 }, { E: 0.2, S: 0.5, P: 0.1 }, { E: 0.6, S: 0.2 }])
  const s = T.签名(p)
  const r = T.判模板(s, [{ 名: 'x', 签名: T.签名(升(9)) }])
  assert.ok(['命中', '未命中', '量级不符'].includes(r.结论))
})

test('tpl 判模板：量级正好 0.3 不否决', () => {
  const a = T.签名(升(5))
  const b = T.签名(升(5).map((p) => ({ ...p, E: p.E + 0.3, S: p.S + 0.3 })))
  const r = T.判模板(a, [{ 名: 'b', 签名: b }], { 量级门: 0.3 })
  assert.notEqual(r.结论, '量级不符')
})

test('tpl 更新模板：α=0 不动、α=1 全换', () => {
  const 旧 = T.签名(升(4))
  const 新 = T.签名(升(6).map((p) => ({ ...p, E: p.E + 0.2 })))
  const 不动 = T.更新模板(旧, 新, 0)
  assert.ok(Math.abs(不动.E[0].角 - 旧.E[0].角) < 1e-9)
  const 全换 = T.更新模板(旧, 新, 1)
  assert.ok(Math.abs(全换.均值.E - 新.均值.E) < 1e-9)
})

test('tpl 更新模板：α=0.3 滑动平均、段数取大', () => {
  const 旧 = T.签名(升(4))
  const 新 = T.签名(升(6))
  const 出 = T.更新模板(旧, 新, 0.3)
  assert.equal(出.段数, 6)
  assert.ok(Math.abs(出.均值.E - (旧.均值.E * 0.7 + 新.均值.E * 0.3)) < 1e-9)
})

test('tpl 更新模板：不改原对象', () => {
  const 旧 = T.签名(升(4))
  const 复制 = JSON.stringify(旧)
  T.更新模板(旧, T.签名(升(6)), 0.5)
  assert.equal(JSON.stringify(旧), 复制)
})

test('tpl 签名：空数组不抛错', () => {
  const s = T.签名([])
  assert.equal(s.段数, 0)
  assert.equal(s.E.length, 0)
})

test('tpl 相似度：空签名返回 0 分', () => {
  const r = T.相似度(T.签名([]), T.签名([]))
  assert.equal(r.分, 0)
})

test('tpl 方向门：短轨迹角抖但整体同向 → 命中（不再被角相关硬门拦）', () => {
  const 上 = T.签名(点s([{ E: 0.10, S: 0.20, P: 0.10 }, { E: 0.08, S: 0.30, P: 0.12 }, { E: 0.20, S: 0.22, P: 0.15 }, { E: 0.18, S: 0.40, P: 0.20 }]))
  const 下 = T.签名(点s([{ E: 0.12, S: 0.25, P: 0.11 }, { E: 0.22, S: 0.21, P: 0.14 }, { E: 0.19, S: 0.38, P: 0.18 }, { E: 0.26, S: 0.42, P: 0.21 }]))
  const r = T.判模板(上, [{ 名: '同源', 签名: 下 }])
  assert.notEqual(r.结论, '未命中')
})

test('tpl 方向门：至少两轴首末相反 → 排除', () => {
  const 升 = T.签名(点s([{ E: 0, S: 0, P: 0 }, { E: 0.5, S: 0.5, P: 0 }, { E: 1, S: 1, P: 0 }]))
  const 降 = T.签名(点s([{ E: 0, S: 0, P: 0 }, { E: -0.5, S: -0.5, P: 0 }, { E: -1, S: -1, P: 0 }]))
  assert.equal(T.整体反向(升, 降), true)
  assert.equal(T.判模板(升, [{ 名: '降', 签名: 降 }]).结论, '未命中')
})

test('tpl 方向门：只有一轴相反不排除', () => {
  const a = T.签名(点s([{ E: 0, S: 0, P: 0 }, { E: 1, S: 1, P: 0 }]))
  const b = T.签名(点s([{ E: 0, S: 0, P: 0 }, { E: -1, S: 0.6, P: 0 }]))
  assert.equal(T.整体反向(a, b), false)
})
