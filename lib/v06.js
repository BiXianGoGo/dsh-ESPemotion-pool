// 助手 ESP 情感插件 · v0.6 数值层（2026-11-10）
// 四块：R1 溢出抑制、R2 速率分档衰减、R3 结加权、R4 六头基数零点。
// 这里只放纯函数；池的读写仍由 index.js 负责（同一把锁里调用）。

const 轴们 = ['E', 'S', 'P']
const 小时 = 3600000
const 天 = 86400000

// ── R1 溢出 ────────────────────────────────────────────────────────────
// 溢出按 12h 半衰期退；池里存 { v, t }。
export function 溢出现值(池, k, now = Date.now()) {
  const o = 池 && 池.溢出 && 池.溢出[k]
  const v = Math.max(0, Number(o && o.v) || 0)
  const t = Date.parse(String((o && o.t) || ''))
  if (!(v > 0)) return 0
  if (!Number.isFinite(t)) return v
  return v * Math.pow(0.5, Math.max(0, now - t) / (12 * 小时))
}

export function 溢出更新(池, k, now = Date.now()) {
  if (!池.溢出 || typeof 池.溢出 !== 'object') 池.溢出 = {}
  const 旧 = 池.溢出[k]
  const v = Math.max(0, Number(旧 && 旧.v) || 0)
  const t = Date.parse(String((旧 && 旧.t) || ''))
  const 退 = Number.isFinite(t) && v > 0 ? Math.pow(0.5, Math.max(0, now - t) / (12 * 小时)) : 1
  池.溢出[k] = { v: Number((v * 退).toFixed(6)), t: new Date(now).toISOString() }
  return 池.溢出[k]
}

export function 溢出记(池, k, 增, now = Date.now()) {
  溢出更新(池, k, now)
  池.溢出[k].v = Number((池.溢出[k].v + Math.max(0, Number(增) || 0)).toFixed(6))
  return 池.溢出[k].v
}

// v0.6：有效溢出 —— 真实溢出 + 预测超出 + 0.85 之后的软区
// 这一项是「验收 1（第 6 条起明显变小）」与「溢出公式」的对齐点，方案 A。
export function 有效溢出(池, k, 轴值, 增量, now = Date.now()) {
  const 真 = 溢出现值(池, k, now)
  const x = Number(轴值) || 0
  const d = Number(增量) || 0
  const 预测 = Math.max(0, Math.abs(x + d) - 1)
  const 软 = 0.5 * Math.max(0, (Math.abs(x) - 0.85) / 0.15)
  return 真 + 预测 + 软
}

// ── R2 速率分档衰减 ────────────────────────────────────────────────────
// 速率 = 近 60 分钟 |Δ_实| 之和（窗口外丢弃）。返回小时速率。
export function 速率记(池, k, 增量, now = Date.now()) {
  if (!池.速率 || typeof 池.速率 !== 'object') 池.速率 = {}
  const 列 = Array.isArray(池.速率[k]) ? 池.速率[k] : []
  const 保 = 列.filter((x) => x && Number.isFinite(Date.parse(x.t)) && now - Date.parse(x.t) <= 小时)
  保.push({ t: new Date(now).toISOString(), d: Math.abs(Number(增量) || 0) })
  池.速率[k] = 保.slice(-200)
  return 保.reduce((s, x) => s + (Number(x.d) || 0), 0)
}

export function 速率和(池, k, now = Date.now()) {
  const 列 = Array.isArray(池 && 池.速率 && 池.速率[k]) ? 池.速率[k] : []
  return 列
    .filter((x) => x && Number.isFinite(Date.parse(x.t)) && now - Date.parse(x.t) <= 小时)
    .reduce((s, x) => s + Math.abs(Number(x.d) || 0), 0)
}

export function τ选(v, 档 = []) {
  const 表 = 档.length ? 档 : [[0.05, 12], [0.15, 8], [0.3, 5], [Infinity, 3]]
  const 速 = Math.max(0, Number(v) || 0)
  for (const [上, τ] of 表) if (速 < 上) return Number(τ)
  return 3
}

// ── 近 24h 峰值（按小时桶）─────────────────────────────────────────────
export function 记峰值(池, k, x, now = Date.now()) {
  if (!池.峰值桶 || typeof 池.峰值桶 !== 'object') 池.峰值桶 = {}
  const h = Math.floor(now / 小时)
  const 桶 = (Array.isArray(池.峰值桶[k]) ? 池.峰值桶[k] : []).filter((b) => b && Number(b.h) > h - 24)
  const 旧 = 桶.find((b) => Number(b.h) === h)
  const v = Math.abs(Number(x) || 0)
  if (旧) 旧.max = Math.max(Number(旧.max) || 0, v)
  else 桶.push({ h, max: v })
  桶.sort((a, b) => Number(a.h) - Number(b.h))
  池.峰值桶[k] = 桶
  return v
}

export function 近峰值(池, k, now = Date.now()) {
  const h = Math.floor(now / 小时)
  const 桶 = (池 && 池.峰值桶 && Array.isArray(池.峰值桶[k]) ? 池.峰值桶[k] : []).filter((b) => b && Number(b.h) > h - 24)
  return 桶.reduce((m, b) => Math.max(m, Number(b.max) || 0), 0)
}

// ── R2 水位 ───────────────────────────────────────────────────────────
export function 水位(池, k, x0, now = Date.now()) {
  const 峰 = 近峰值(池, k, now)
  const 比例 = 0.4
  const 符 = Math.sign(Number(x0) || 0) || 0
  return { T: 比例 * 峰 * 符, 峰 }
}

// 向 T 做指数逼近；靠近时变慢（软停靠），D<0.01 直接落到 T。
// 用两次不动点迭代近似软停靠（避免按分钟循环）。
export function 推进(x0, T, τ, Δt) {
  const x = Number(x0) || 0
  const t = Number(T) || 0
  const τ0 = Math.max(0.5, Number(τ) || 12)
  const dtH = Math.max(0, Number(Δt) || 0) / 3600000
  if (dtH < 1 / 60) return x
  if (!dtH) return x
  if (Math.abs(x - t) < 0.01) return t
  let τe = τ0
  for (let i = 0; i < 2; i += 1) {
    const D = Math.abs(x - t) * Math.pow(0.5, dtH / τe)
    const 慢 = D < 0.15 ? 1 + 2 * (0.15 - D) / 0.15 : 1
    τe = τ0 * 慢
  }
  const 终 = t + (x - t) * Math.pow(0.5, dtH / τe)
  return Math.abs(终 - t) < 0.01 ? t : 终
}

// ── R3 结坐标 ─────────────────────────────────────────────────────────
// 结记录只有「轴 + 值」：坐标就是 X 轴上的那个值，另两轴 0。
export function 结坐标(池, now = Date.now()) {
  const 起 = now - 7 * 天
  const o = { E: 0, S: 0, P: 0 }
  for (const c of (池 && Array.isArray(池.刺) ? 池.刺 : [])) {
    if (!c || c.作废 === true) continue
    const t = Date.parse(String(c.t || ''))
    if (!Number.isFinite(t) || t < 起) continue
    if (!轴们.includes(c.轴)) continue
    o[c.轴] += Number(c.值) || 0
  }
  for (const k of 轴们) o[k] = Number(o[k].toFixed(6))
  return o
}

export function 最高结轴(结) {
  let 轴 = null
  let 大 = 0
  for (const k of 轴们) {
    const v = Math.abs(Number(结[k]) || 0)
    if (v > 大) { 大 = v; 轴 = k }
  }
  return 轴
}

export function τ加权(τ, 结, k, 最高) {
  if (!最高 || 最高 !== k) return τ
  const w = Math.min(1, Math.abs(Number(结[k]) || 0))
  return τ / (1 + w)
}

// ── R4 六头基数 ───────────────────────────────────────────────────────
const 头名 = ['E-', 'E+', 'S-', 'S+', 'P-', 'P+']

export function 日键(now = Date.now()) {
  const d = new Date(now)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

export function 记六头(池, 轴, Δ, now = Date.now()) {
  if (!池.六头 || typeof 池.六头 !== 'object') 池.六头 = {}
  const 头 = 轴 + (Number(Δ) >= 0 ? '+' : '-')
  if (!头名.includes(头)) return
  const 旧 = 池.六头[头] && typeof 池.六头[头] === 'object' ? 池.六头[头] : {}
  const 界 = now - 90 * 24 * 小时
  const 桶 = (Array.isArray(旧.桶) ? 旧.桶 : []).filter((b) => b && Date.parse(String(b.d)) >= 界)
  const d = 日键(now)
  const 条 = 桶.find((b) => String(b.d) === d)
  if (条) 条.n = (Number(条.n) || 0) + 1
  else 桶.push({ d, n: 1 })
  const 累 = (Number(旧.累计) || 0) + 1
  池.六头[头] = { 累计: 累, 桶, 上次z: 旧.上次z || null }
}

export function 六头计(池, now = Date.now()) {
  const 界 = 日键(now - 168 * 小时)
  const o = {}
  const 累 = {}
  let 总 = 0
  for (const 名 of 头名) {
    const 源 = 池 && 池.六头 && 池.六头[名] && typeof 池.六头[名] === 'object' ? 池.六头[名] : {}
    const 桶 = Array.isArray(源.桶) ? 源.桶 : []
    const n = 桶.filter((b) => b && String(b.d) >= 界).reduce((s, b) => s + (Number(b.n) || 0), 0)
    const c = 源.累计 != null ? Number(源.累计) || 0 : 桶.reduce((s, b) => s + (Number(b.n) || 0), 0)
    o[名] = n
    累[名] = c
    总 += n
  }
  return { 计: o, 累计: 累, μ: 总 / 6 }
}

// 返回每根轴本次是否该 +1 个单次偏移（不写池，写池在调用方）
export function 判零点(池, 配置, 结, 最高, now = Date.now()) {
  const { 计, μ } = 六头计(池, now)
  const 步 = Number(配置.单次偏移) || 0.01
  const 冷 = (Number(配置.冷却) || 6) * 小时
  const 倍 = Number(配置.阈值倍数) || 1.5
  const 封 = Number(配置.封顶) || 0.2
  const 出 = {}
  for (const k of 轴们) {
    let cap = Math.min(封, 封 * Math.min(1, Math.abs(Number(结[k]) || 0)))
    cap *= 最高 && 最高 === k ? 1 : 0.5
    const z = Number(池.零点 && 池.零点[k]) || 0
    if (Math.abs(z) + 步 > cap + 1e-9) continue
    for (const 头 of [k + '-', k + '+']) {
      const 两向 = (计[k + '-'] || 0) + (计[k + '+'] || 0)
      const 占比 = 两向 > 0 ? (计[头] || 0) / 两向 : 0
      if ((计[头] || 0) < Math.max(3, 倍 * μ)) continue
      if (占比 < 0.6) continue
      const 上次 = 池.六头 && 池.六头[头] && 池.六头[头].上次z ? Date.parse(池.六头[头].上次z) : 0
      if (Number.isFinite(上次) && now - 上次 < 冷) continue
      出[k] = { 头, 方向: 头.endsWith('+') ? 1 : -1 }
      break
    }
  }
  return 出
}

export function 应用零点(池, 出, now = Date.now()) {
  const 步 = 0.01
  for (const [k, v] of Object.entries(出 || {})) {
    if (!池.零点 || typeof 池.零点 !== 'object') 池.零点 = { E: 0, S: 0, P: 0 }
    池.零点[k] = Number(((Number(池.零点[k]) || 0) + v.方向 * 步).toFixed(4))
    if (池.六头 && 池.六头[v.头]) 池.六头[v.头].上次z = new Date(now).toISOString()
  }
}

export function 显示值(x, z) {
  return Math.max(-1, Math.min(1, (Number(x) || 0) + (Number(z) || 0)))
}

export const V06 = { 轴们, 头名 }
