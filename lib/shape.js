// 0.2.7 情绪形状：状态判定 / 二分检索表 / 形状距离 / 原型归属
// 纯函数，不读盘；所有门槛由调用方传入（池内分位自标定）。

export const 折角阈 = 15 // 度：转角 ≥ 15° 记为折点
export const 方向阈 = 0.10
export const 回落阈 = 0.05
export const 归属阈 = 0.88
export const 待命名阈 = 0.55
export const 原型上限 = 12
export const 变体提示 = 20
export const 生长最少 = 30
export const 生长每侧 = 10
export const 生长距离 = 0.25
export const 深度上限 = 6

export const 轴们 = ['E', 'S', 'P']
export const 状态优先 = { 跳变: 4, 趋势: 3, 波动: 2, 基线: 1 }

export const 先验门槛 = { 基线: 0.30, 趋势: 0.45, 跳变: 0.50, 斜率门: 0.02 }
export const 先验权重 = { 角: 1 / 3, 数: 1 / 3, 距: 1 / 3 }

export function 数(v) {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}
export const 夹 = (x, lo, hi) => Math.min(hi, Math.max(lo, x))
export function 中位(a) {
  const b = a.map(数).filter((x) => Number.isFinite(x)).sort((x, y) => x - y)
  if (!b.length) return 0
  const m = b.length >> 1
  return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2
}
export const 均值 = (a) => (a.length ? a.reduce((s, x) => s + 数(x), 0) / a.length : 0)
export function 标准差(a) {
  if (!a.length) return 0
  const m = 均值(a)
  return Math.sqrt(a.reduce((s, x) => s + (数(x) - m) ** 2, 0) / a.length)
}
export function 百分位(a, q) {
  const b = a.map(数).filter((x) => Number.isFinite(x)).sort((x, y) => x - y)
  if (!b.length) return 0
  const p = 夹(数(q), 0, 1)
  if (b.length === 1) return b[0]
  const x = p * (b.length - 1)
  const lo = Math.floor(x)
  const hi = Math.min(b.length - 1, lo + 1)
  return b[lo] + (b[hi] - b[lo]) * (x - lo)
}

// —— 曲线特征 ——

export function 单步(v) {
  const 出 = []
  for (let i = 1; i < v.length; i++) 出.push(Math.abs(数(v[i]) - 数(v[i - 1])))
  return 出
}
export const 单步中位 = (v) => 中位(单步(v))
export const 路径长度 = (v) => 单步(v).reduce((s, x) => s + x, 0)
export const 净位移 = (v) => (v.length ? 数(v[v.length - 1]) - 数(v[0]) : 0)
export const 跳变 = (v) => (单步(v).length ? Math.max(...单步(v)) : 0)

// 正方向看峰后回落；负方向看谷后回弹；都取绝对值
export function 回落(v, 方向) {
  if (v.length < 2) return 0
  const 末 = 数(v[v.length - 1])
  if (方向 >= 0) return Math.max(0, Math.max(...v.map(数)) - 末)
  return Math.max(0, 末 - Math.min(...v.map(数)))
}

export function 折返(v) {
  let 次 = 0
  let 上 = 0 // 0 未知，1 上，-1 下
  for (let i = 1; i < v.length; i++) {
    const d = 数(v[i]) - 数(v[i - 1])
    if (!d) continue
    const s = d > 0 ? 1 : -1
    if (上 && s !== 上) 次++
    上 = s
  }
  return 次
}

// 一元回归：返回斜率与 R²
export function 回归(v) {
  const n = v.length
  if (n < 2) return { 斜率: 0, R2: 0 }
  const xs = v.map((_, i) => i)
  const ys = v.map(数)
  const mxs = 均值(xs)
  const mys = 均值(ys)
  let sxy = 0
  let sxx = 0
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mxs) * (ys[i] - mys)
    sxx += (xs[i] - mxs) ** 2
  }
  const 斜率 = sxx ? sxy / sxx : 0
  let ssRes = 0
  let ssTot = 0
  for (let i = 0; i < n; i++) {
    const f = mys + 斜率 * (xs[i] - mxs)
    ssRes += (ys[i] - f) ** 2
    ssTot += (ys[i] - mys) ** 2
  }
  const R2 = ssTot > 1e-12 ? 1 - ssRes / ssTot : 0
  return { 斜率, R2 }
}

// 折点：转角（两段方向夹角）≥ 15° 的点。θ=角度÷180；g=折点间距÷总路径长
export function 折点(v) {
  const θ = []
  const 位置 = []
  const pts = v.map(数)
  const 总 = 路径长度(pts)
  for (let i = 1; i < pts.length - 1; i++) {
    const ax = 1
    const ay = pts[i] - pts[i - 1]
    const bx = 1
    const by = pts[i + 1] - pts[i]
    const la = Math.hypot(ax, ay)
    const lb = Math.hypot(bx, by)
    if (la < 1e-9 || lb < 1e-9) continue
    const cos = 夹((ax * bx + ay * by) / (la * lb), -1, 1)
    const ang = (Math.acos(cos) * 180) / Math.PI
    if (ang >= 折角阈) {
      θ.push(ang / 180)
      位置.push(i)
    }
  }
  const g = []
  for (let i = 1; i < 位置.length; i++) {
    const 距 = Math.abs(位置[i] - 位置[i - 1]) / Math.max(1, pts.length - 1)
    g.push(总 > 1e-9 ? 距 : 0)
  }
  return { θ, 折数: 位置.length, g }
}

function dtw(a, b) {
  if (!a.length || !b.length) return null
  const n = a.length
  const m = b.length
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(Infinity))
  dp[0][0] = 0
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const c = Math.abs(数(a[i - 1]) - 数(b[j - 1]))
      dp[i][j] = c + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[n][m] / Math.max(n, m, 1)
}

// 形状距离：D = w角·D角 + w数·D数 + w距·D距
export function 形状(曲线) {
  const v = 曲线.map(数)
  const 折 = 折点(v)
  return { θ: 折.θ, 折数: 折.折数, g: 折.g, 路径: 路径长度(v), 点: v }
}
export function 形状距离(a, b, 权重 = 先验权重) {
  const w = { ...先验权重, ...(权重 || {}) }
  const 角a = a.θ || []
  const 角b = b.θ || []
  // 两边都没折点：视为同形（不是空序列）；只有一边空：给中性 0.5
  const d角 = !角a.length && !角b.length ? 0 : 角a.length && 角b.length ? dtw(角a, 角b) : 0.5
  const na = 数(a.折数)
  const nb = 数(b.折数)
  const d数 = Math.abs(na - nb) / Math.max(na, nb, 1)
  const la = 数(a.路径)
  const lb = 数(b.路径)
  const d距 = la + lb <= 1e-12 ? 0 : Math.abs(la - lb) / Math.max(la, lb, 1) // Q12：长度差÷较长者
  const D = 夹(数(w.角) * d角 + 数(w.数) * d数 + 数(w.距) * d距, 0, 1)
  return { 角: d角, 数: d数, 距: d距, D, 相似度: 1 - D }
}
export function 新尺(相似度, 基线) {
  const b = 夹(数(基线), 0, 0.999)
  const s = 夹(数(相似度), 0, 1)
  return s <= b ? 0 : 夹((s - b) / (1 - b), 0, 1)
}

// —— 状态判定（单轴 + 三轴合成）——

export function 状态判定(v, 门槛 = {}, 斜率门 = 0.02) {
  const 单 = 单步中位(v)
  const 跳 = 跳变(v)
  const { 斜率, R2 } = 回归(v)
  const 基 = 数(门槛.基线)
  const 趋 = 数(门槛.趋势)
  let 状态
  if (跳 >= 数(门槛.跳变) && 数(门槛.跳变) > 0) 状态 = '跳变'
  else if (v.length >= 4 && R2 >= 趋 && Math.abs(斜率) >= 数(斜率门)) 状态 = '趋势'
  else if (单 < 基 && R2 < 趋) 状态 = '基线'
  else 状态 = '波动'
  return { 状态, 单步中位: 单, 跳变: 跳, 斜率, R2 }
}
// 口径（2026-11-18 定死）：状态优先级 跳变 > 趋势 > 波动 > 基线。
//   跳变：同轮 (>=2) 轴各自的单步最大跳 (>=) 门槛（0.60），单轴不判；
//   趋势：R² >= 趋势门（0.4844）且 |斜率| >= 斜率门；
//   基线：单步中位 **<** 基线门（0.20，严格小于）且 R² < 趋势门；其余为波动。
// 突变=同轮 >=2 个轴的单步最大跳 >= 门槛（段点量化在 0.1 网格，
// 单轴分位会把同分全算进来，单轴率 11-13%、三轴并集 26%；改为两轴后实测 6.0%）。
// 单轴仍各自算 状态判定 供展示，但合成时若同跳轴数 <2，跳变轴降级为「非跳变」分类。
export const 同跳轴数 = 2
export function 三轴状态(轴曲线, 门槛 = {}, 斜率门 = 0.02) {
  const 轴 = {}
  const 原 = {}
  let 跳轴 = 0
  for (const k of 轴们) {
    const v = (轴曲线 && 轴曲线[k]) || []
    const r = v.length >= 2 ? 状态判定(v, 门槛, 斜率门) : { 状态: '基线', 单步中位: 0, 跳变: 0, 斜率: 0, R2: 0 }
    原[k] = r
    if (r.状态 === '跳变') 跳轴++
  }
  const 真跳 = 跳轴 >= 同跳轴数
  let 最 = '基线'
  for (const k of 轴们) {
    const r = { ...原[k] }
    if (r.状态 === '跳变' && !真跳) {
      // 不足两轴同跳：该轴降级（趋势 > 基线 > 波动）
      const v = (轴曲线 && 轴曲线[k]) || []
      const 次 = 状态判定(v, { ...门槛, 跳变: 0 }, 斜率门)
      r.状态 = 次.状态
      r.跳变降级 = true
    }
    轴[k] = r
    if (状态优先[r.状态] > 状态优先[最]) 最 = r.状态
  }
  return { 状态: 最, 轴, 同跳轴: 跳轴 }
}

// —— 二分检索表：3 问 8 片，只从「趋势态」开始走 ——

export const 检索根 = [
  { 问: '有方向吗？', 判: '方向' },
  { 问: '往正方向还是负方向？', 判: '正负' },
  { 问: '回落了吗？', 判: '回落' },
]
export function 叶子名(路) {
  return 路.join('|')
}
// 走表：返回叶子 id 与各问题答案（生长节点额外判断）
export function 走表(v, 池中位路径 = 0, 生长 = []) {
  const 净 = 净位移(v)
  if (Math.abs(净) >= 方向阈) {
    const 方向 = 净 >= 0 ? '正' : '负'
    const 回 = 回落(v, 净 >= 0 ? 1 : -1)
    const 路 = ['有方向', 方向, 回 >= 回落阈 ? '回落' : '未回落']
    return { 叶子: 叶子名(路), 路, 净位移: 净, 回落: 回 }
  }
  const 抖 = 路径长度(v) >= 数(池中位路径)
  const 折 = 折返(v) >= 2
  const 路 = ['无方向', 抖 ? '抖大' : '抖小', 折 ? '折返' : '单向']
  return { 叶子: 叶子名(路), 路, 净位移: 净, 路径: 路径长度(v), 折返: 折返(v) }
}
// 自动生长：样本 ≥30 且两侧各 ≥10、两侧平均形状距离 > 0.25 → 在该叶子下加一问
export function 生长分叉(样本, 选项 = {}) {
  const 少 = 数(选项.生长最少) || 生长最少
  const 每 = 数(选项.生长每侧) || 生长每侧
  const 距阈 = 选项.生长距离 != null ? 数(选项.生长距离) : 生长距离
  if (!Array.isArray(样本) || 样本.length < 少) return null
  const 净们 = 样本.map((s) => 净位移(s.曲线 || s))
  const 阈 = 中位(净们)
  const 左 = 样本.filter((s, i) => 净们[i] < 阈)
  const 右 = 样本.filter((s, i) => 净们[i] >= 阈)
  if (左.length < 每 || 右.length < 每) return null
  const 形们 = 样本.map((s) => 形状(s.曲线 || s))
  const 分 = (s) => 形状(s.曲线 || s)
  const 左形 = 左.map(分)
  const 右形 = 右.map(分)
  let 和 = 0
  let 次 = 0
  for (let i = 0; i < Math.min(左形.length, 8); i++) {
    for (let j = 0; j < Math.min(右形.length, 8); j++) {
      和 += 形状距离(左形[i], 右形[j]).D
      次++
    }
  }
  if (!次 || 和 / 次 <= 距阈) return null
  return { 问: '净位移 ≥ ' + 阈.toFixed(2) + '？', 阈值: Number(阈.toFixed(4)), 左: 左.length, 右: 右.length, 距离: 和 / 次 }
}

// 三层归属
export function 判归属(新尺度, 变体数 = 0) {
  const x = 数(新尺度)
  if (x >= 归属阈) return { 层: '归入', 提示: null }
  if (x >= 待命名阈) return { 层: '变体', 提示: 数(变体数) > 变体提示 ? '变体超过 20，要不要拆？' : null }
  return { 层: '待命名', 提示: null }
}
export function 取名字(叶子, 枝名表) {
  // 名字挂枝：从叶子往上爬，取最近一个有名字的祖先
  const 表 = 枝名表 || {}
  const 段 = String(叶子 || '').split('|')
  for (let n = 段.length; n >= 0; n--) {
    const id = 段.slice(0, n).join('|')
    if (id && 表[id]) return { 名: 表[id], 枝: id }
  }
  return { 名: null, 枝: null }
}
export function 未命名枝(叶子, 轮数 = 0) {
  const 段 = String(叶子 || '').split('|')
  return '未命名（第 ' + (段.length || 1) + ' 丛 · ' + 数(轮数) + ' 轮）'
}

// —— 三轴定名（任务单-20261118-2210）：E/S/P 各取一段点，各算一份形状 ——
export function 三轴签名(点们) {
  const o = {}
  for (const k of 轴们) {
    const v = (点们 || []).map((p) => Number(p && p[k]) || 0)
    o[k] = v.length >= 2 ? 形状(v) : null
  }
  return o
}
// 两套三轴签名取「共同轴」的平均相似度；旧单轴原型（顶层 θ）当只有 E 轴
export function 平均相似度(形A, 形B, w) {
  if (!形A || !形B) return null
  const 乙 = 形B && 形B.θ ? { E: 形B } : 形B
  let 和 = 0
  let 次 = 0
  const 逐轴 = {}
  for (const k of 轴们) {
    if (!形A[k] || !乙[k]) continue
    const d = 形状距离(形A[k], 乙[k], w)
    逐轴[k] = Number(d.相似度.toFixed(4))
    和 += d.相似度
    次++
  }
  if (!次) return null
  return { 相似度: 和 / 次, 轴数: 次, 逐轴 }
}
// 最烈轴：路径最长的一轴（与 calib 校准口径一致）
export function 最烈轴(轴曲线) {
  let 最 = null
  let 幅 = -1
  for (const k of 轴们) {
    const v = (轴曲线 && 轴曲线[k]) || []
    if (!Array.isArray(v) || v.length < 2) continue
    const p = 路径长度(v)
    if (p > 幅) { 幅 = p; 最 = v }
  }
  return 最
}
// 8 片固定顺序：片 1..8
export const 片们 = ['有方向|正|回落', '有方向|正|未回落', '有方向|负|回落', '有方向|负|未回落', '无方向|抖大|折返', '无方向|抖大|单向', '无方向|抖小|折返', '无方向|抖小|单向']
export function 片号(叶子) {
  const i = 片们.indexOf(String(叶子 || ''))
  return i >= 0 ? i + 1 : null
}
export function 叶枝(叶子) {
  const 段 = String(叶子 || '').split('|').filter(Boolean)
  return 段.length > 1 ? 段.slice(0, 段.length - 1).join('|') : null
}
