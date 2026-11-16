// 情绪模板 · A 段纯函数（0.3 雏形）
// 形状用「角/长/位」三件套；方向靠角序列相关拦；量级只做否决门。
// 长：默认时间占比（相邻两点 t 差 / 总时长）；t 缺失或总时长为 0 时退回点数占比。
const 轴们 = ['E', 'S', 'P']
const 度 = (r) => (r * 180) / Math.PI

function 数(v, 缺 = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 缺
}

function 时间(点) {
  const t = Date.parse(String((点 && 点.t) || ''))
  return Number.isFinite(t) ? t : null
}

// 签名：[{t,E,S,P}] → { E/S/P:[{角,长,位}], 段数, 均值, 值 }
export function 签名(点s) {
  const 点 = Array.isArray(点s) ? 点s.filter((p) => p && typeof p === 'object') : []
  const 段数 = Math.max(0, 点.length - 1)
  const 出 = { 段数, 均值: {}, 值: {} }
  const 时 = 点.map(时间)
  const 全时 = 时.length && 时.every((x) => x != null)
  let 总时 = 0
  if (全时) for (let i = 1; i < 时.length; i++) 总时 += Math.max(0, 时[i] - 时[i - 1])

  for (const k of 轴们) {
    const 值 = 点.map((p) => 数(p[k]))
    出.值[k] = 值
    出.均值[k] = 值.length ? 值.reduce((s, x) => s + x, 0) / 值.length : 0
    const 段 = []
    let 已 = 0
    for (let i = 0; i < 段数; i++) {
      const Δ = 值[i + 1] - 值[i]
      const 长 = 全时 && 总时 > 0 ? Math.max(0, 时[i + 1] - 时[i]) / 总时 : 1 / Math.max(1, 段数)
      const 位 = 全时 && 总时 > 0 ? 已 / 总时 : i / Math.max(1, 段数)
      段.push({ 角: 度(Math.atan2(Δ, 1)), 长, 位 })
      已 += 全时 && 总时 > 0 ? Math.max(0, 时[i + 1] - 时[i]) : 1
    }
    出[k] = 段
  }
  return 出
}

function 重采样(a, n) {
  if (!a.length) return new Array(n).fill(0)
  if (a.length === n) return a.slice()
  const 出 = []
  for (let i = 0; i < n; i++) {
    const x = (i * (a.length - 1)) / Math.max(1, n - 1)
    const i0 = Math.floor(x)
    const i1 = Math.min(a.length - 1, i0 + 1)
    const f = x - i0
    出.push(a[i0] * (1 - f) + a[i1] * f)
  }
  return 出
}

// 角序列相关（Pearson，重采样到同一长度）
export function 角相关(a, b) {
  const n = 8
  const x = 重采样((a || []).map((s) => 数(s.角)), n)
  const y = 重采样((b || []).map((s) => 数(s.角)), n)
  const mx = x.reduce((s, v) => s + v, 0) / n
  const my = y.reduce((s, v) => s + v, 0) / n
  let 上 = 0, 下1 = 0, 下2 = 0
  for (let i = 0; i < n; i++) {
    上 += (x[i] - mx) * (y[i] - my)
    下1 += (x[i] - mx) ** 2
    下2 += (y[i] - my) ** 2
  }
  const 下 = Math.sqrt(下1 * 下2)
  if (下 <= 1e-9) {
    // 直线形的角是常数，Pearson 无定义：同号常数=1、异号=-1、一方为 0=0
    const 号 = Math.sign(mx) * Math.sign(my)
    return 号 || (Math.abs(mx) < 1e-9 && Math.abs(my) < 1e-9 ? 1 : 0)
  }
  return 上 / 下
}

function 段距(a, b) {
  return Math.abs(数(a.角) - 数(b.角)) / 180 + 0.5 * Math.abs(数(a.长) - 数(b.长)) + 0.5 * Math.abs(数(a.位) - 数(b.位))
}

function dtw(a, b) {
  const n = (a || []).length, m = (b || []).length
  if (!n || !m) return { 距离: 1, 步数: 1 }
  const D = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(Infinity))
  D[0][0] = 0
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      D[i][j] = 段距(a[i - 1], b[j - 1]) + Math.min(D[i - 1][j], D[i][j - 1], D[i - 1][j - 1])
    }
  }
  return { 距离: D[n][m], 步数: Math.max(n, m) }
}

export function 相似度(甲, 乙) {
  if (!甲 || !乙) return { 分: 0, 角度相似: 0, 量级差: 1 }
  if (!甲.段数 || !乙.段数) return { 分: 0, 角度相似: 0, 量级差: 1 }
  let 距和 = 0
  let 角差和 = 0
  let 角数 = 0
  for (const k of 轴们) {
    const { 距离, 步数 } = dtw(甲[k], 乙[k])
    距和 += 距离 / 步数
    const a = 甲[k] || [], b = 乙[k] || []
    const n = Math.min(a.length, b.length)
    for (let i = 0; i < n; i++) {
      角差和 += Math.abs(数(a[i].角) - 数(b[i].角)) / 180
      角数 += 1
    }
  }
  const 平均 = 距和 / 轴们.length
  const 量级差 = Math.max(...轴们.map((k) => Math.abs(数(甲.均值 && 甲.均值[k]) - 数(乙.均值 && 乙.均值[k]))))
  return { 分: 1 / (1 + 平均), 角度相似: 1 - 角差和 / Math.max(1, 角数), 量级差 }
}

// 整体方向门：每轴首→末位移符号，至少两轴相反才排除（角相关在短轨迹上太抖，不做硬门）
export function 整体反向(a, b) {
  let 反 = 0
  for (const k of 轴们) {
    const va = (a && a.值 && a.值[k]) || []
    const vb = (b && b.值 && b.值[k]) || []
    if (va.length < 2 || vb.length < 2) continue
    const sa = Math.sign(数(va[va.length - 1]) - 数(va[0]))
    const sb = Math.sign(数(vb[vb.length - 1]) - 数(vb[0]))
    if (sa !== 0 && sb !== 0 && sa * sb < 0) 反 += 1
  }
  return 反 >= 2
}

function 取签名(x) {
  return x && x.签名 ? x.签名 : x
}

// 判模板：先方向门（角相关 < 0.5 剔除），再取最高分，再量级否决
export function 判模板(签, 模板集, 选项 = {}) {
  const 门槛 = 数(选项.相似度门槛, 0.8)
  const 量门 = 数(选项.量级门, 0.3)
  const 集 = Array.isArray(模板集) ? 模板集 : []
  let 最优 = null
  for (const t of 集) {
    const 它 = 取签名(t)
    if (!它) continue
    if (整体反向(签, 它)) continue
    const r = 相似度(签, 它)
    if (!最优 || r.分 > 最优.分) 最优 = { 名: String((t && t.名) || ''), 分: r.分, 量级差: r.量级差 }
  }
  if (!最优) return { 名: null, 分: 0, 量级差: 1, 结论: '未命中' }
  if (最优.量级差 > 量门) return { ...最优, 结论: '量级不符' }
  if (最优.分 < 门槛) return { ...最优, 结论: '未命中' }
  return { ...最优, 结论: '命中' }
}

// 更新模板：按 α 滑动平均（段按索引对齐，多出的段原样保留）
export function 更新模板(模板, 签, α = 0.3) {
  const a = Math.max(0, Math.min(1, 数(α, 0.3)))
  const 出 = JSON.parse(JSON.stringify(模板 || {}))
  出.均值 = 出.均值 || {}
  for (const k of 轴们) {
    const 新 = (签 && 签[k]) || []
    const 旧 = Array.isArray(出[k]) ? 出[k] : []
    const n = Math.max(旧.length, 新.length)
    const 段 = []
    for (let i = 0; i < n; i++) {
      const o = 旧[i], p = 新[i]
      if (o && p) 段.push({ 角: 数(o.角) * (1 - a) + 数(p.角) * a, 长: 数(o.长) * (1 - a) + 数(p.长) * a, 位: 数(o.位) * (1 - a) + 数(p.位) * a })
      else 段.push(JSON.parse(JSON.stringify(o || p)))
    }
    出[k] = 段
    出.均值[k] = 数(出.均值[k]) * (1 - a) + 数(签 && 签.均值 && 签.均值[k]) * a
  }
  出.段数 = Math.max(...轴们.map((k) => 出[k].length))
  return 出
}

export const TPL = { 轴们 }

// v0.2.2：几何只提示转折，不判决。逐轴算相邻两段的斜角差；任一轴满足即提示该段序号（1 起）。
export function 转折提示(段点) {
  if (!Array.isArray(段点) || 段点.length < 2) return []
  const 出 = []
  const 轴们 = ['E', 'S', 'P']
  const 角 = (a, b) => Math.atan2(b - a, 1) * 180 / Math.PI
  for (let i = 1; i < 段点.length; i++) {
    for (const k of 轴们) {
      const 前 = 段点[i - 1]
      const 本 = 段点[i]
      const 前Δ = i >= 2 ? (Number(前[k]) || 0) - (Number(段点[i - 2][k]) || 0) : (Number(前[k]) || 0)
      const 本Δ = (Number(本[k]) || 0) - (Number(前[k]) || 0)
      const 差 = Math.abs(角(0, 本Δ) - 角(0, 前Δ))
      const 末差 = Math.abs((Number(本[k]) || 0) - (Number(前[k]) || 0))
      if (差 >= 120 || (差 >= 30 && 末差 >= 0.3)) { 出.push(i + 1); break }
    }
  }
  return 出
}
