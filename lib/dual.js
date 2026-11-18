// v0.8 双轨：点数 → Δ、认知度、K、两轨合成。
// 纯函数，不读文件、不写日志，方便单测。

export const 轴们 = ['E', 'S', 'P']
export const 基准 = 0.05
export const 冷启动K = 1.0
export const 门槛 = 15 // 0.15 × 100，避免浮点边界

// 2026-11-16 C 量纲归一：分身曲线点已 ÷9 成 ±1 制。下面两个阈原本按 ±9 点制写，
// 等比 ÷9 换到归一制，语义不变（A 段点本来就是 ±1 制，阈值不动）。
export const 归一相邻差阈 = 1 / 9 // 原「相邻差 ≥1 点」
export const 归一反向阈 = 0.5 / 9 // 原「|它点| >0.5 点」

// 点数 × 基准 × 认知度
// 认知度三档（2026-11-15 判分口径）：<0.5 不确信不自信；0.5~1 确信但不自信；>1 确信且自信。
// 上限 1.5（全链，轨Δ 也跟着放大）。
export function 认知度(K, q1, q2) {
  const k = Number(K)
  const a1 = q1 === null || q1 === undefined || q1 === '' ? NaN : Number(q1)
  const a2 = q2 === null || q2 === undefined || q2 === '' ? NaN : Number(q2)
  const kk = Number.isFinite(k) && k > 0 ? k : 冷启动K
  const v = kk *
    (Number.isFinite(a1) ? a1 : 0.7) *
    (0.7 + 0.6 * (Number.isFinite(a2) ? a2 : 0.7))
  // 2026-11-15 补丁：平时夹 1.0 一分不变；只有「确信且自信」三条件同时满足才 ×1.5（罕见）
  const 确信 = kk >= 0.95 && Number.isFinite(a1) && a1 >= 0.9 && Number.isFinite(a2) && a2 >= 0.9
  if (!确信) return Math.min(1.0, v)
  return Math.min(1.5, v * 1.5)
}

// 超阈时按两轨认知度分四支（2026-11-15 判分口径）
// <0.5 严格小于；[0.5,1] 含两端；>1 严格大于。
// 两轨都 <0.5 → 取认知度高者（不取中点）；跨档 → 取高者；平手取它。
export function 四支(认我, 认它) {
  const a = Number(认我)
  const b = Number(认它)
  if (!Number.isFinite(a) && !Number.isFinite(b)) return '它'
  if (!Number.isFinite(a)) return '它'
  if (!Number.isFinite(b)) return '我'
  if (a < 0.5 && b < 0.5) return b >= a ? '它' : '我'
  if (a < 0.5) return '它'
  if (b < 0.5) return '我'
  return b >= a ? '它' : '我'
}

// 点数（±9）→ 该轨三轴 Δ
export function 轨Δ(点数, 认) {
  const 出 = {}
  for (const k of 轴们) 出[k] = (Number(点数 && 点数[k]) || 0) * 基准 * (Number(认) || 0)
  return 出
}

function 全轴(轨) {
  return 轨Δ(轨.点数, 轨.认知度)
}

// 2026-11-14：K 改混合窗口——只取近 7 天、半衰 3 天加权、最多 40 条。
// 冷启动门槛：有效样本 Σw < 3 → K=1.0（主人 21:18 拍板：1 条错权重 1.0，门槛 2 太脆；门槛 5 与样例一 3.5 冲突，取 3。）
export function 算K(轮s, 选项 = {}, now = Date.now()) {
  const 窗 = Number(选项 && 选项.窗口天) > 0 ? Number(选项.窗口天) : 7
  const 半 = Number(选项 && 选项.半衰天) > 0 ? Number(选项.半衰天) : 3
  const 上限 = Number(选项 && 选项.上限) > 0 ? Math.trunc(Number(选项.上限)) : 40
  const 起 = now - 窗 * 86400000
  const 原 = Array.isArray(轮s) ? 轮s : []
  const 有t = 原.some((r) => r && Number.isFinite(Date.parse(r.t)))
  if (!有t) {
    // 兼容旧数据/旧测试：整组都没有 t 时沿用等权、近 20 条、<5 条回 1.0
    const 取旧 = 原.slice(-20)
    const n旧 = 取旧.length
    const 否旧 = 取旧.filter((r) => r && r.被否).length
    const 坏旧 = 取旧.filter((r) => r && r.不可靠).length
    const 中旧 = 取旧.filter((r) => r && r.中点).length
    if (n旧 < 5) return { K: 冷启动K, 样本: n旧, 有效样本: 0, 窗口天: 窗, 被否率: 0, 不可靠率: 0, 中点一致率: 0, 被否: 否旧, 不可靠: 坏旧, 中点: 中旧 }
    const 否率旧 = 否旧 / n旧, 坏率旧 = 坏旧 / n旧
    const K旧 = Math.max(0.5, Math.min(1.0, 1 - 0.6 * 否率旧 - 0.3 * 坏率旧))
    return { K: Number(K旧.toFixed(4)), 样本: n旧, 有效样本: n旧, 窗口天: 窗, 被否率: 否率旧, 不可靠率: 坏率旧, 中点一致率: 中旧 / n旧, 被否: 否旧, 不可靠: 坏旧, 中点: 中旧 }
  }
  const 取 = 原
    .filter((r) => r && Number.isFinite(Date.parse(r.t)) && Date.parse(r.t) >= 起)
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t))
    .slice(-上限)
  let sw = 0, 否w = 0, 坏w = 0, 中w = 0
  for (const r of 取) {
    const w = Math.pow(0.5, Math.max(0, (now - Date.parse(r.t)) / 86400000) / 半)
    sw += w
    if (r.被否) 否w += w
    if (r.不可靠) 坏w += w
    if (r.中点) 中w += w
  }
  const n = 取.length
  const 被否 = 取.filter((r) => r && r.被否).length
  const 不可靠 = 取.filter((r) => r && r.不可靠).length
  const 中点 = 取.filter((r) => r && r.中点).length
  const 有效样本 = Number(sw.toFixed(2))
  if (sw < 3) return { K: 冷启动K, 样本: n, 有效样本, 窗口天: 窗, 被否率: 0, 不可靠率: 0, 中点一致率: 0, 被否, 不可靠, 中点 }
  const 被否率 = 否w / sw
  const 不可靠率 = 坏w / sw
  const K = Math.max(0.5, Math.min(1.0, 1 - 0.6 * 被否率 - 0.3 * 不可靠率))
  return { K: Number(K.toFixed(4)), 样本: n, 有效样本, 窗口天: 窗, 被否率, 不可靠率, 中点一致率: 中w / sw, 被否, 不可靠, 中点 }
}

// 两轨合成。我/它 = { 点数:{E,S,P}, 裁决度:K, 认知度 }
// 裁决只用「点数 × 裁决度(K)」；q 不参与差值与取谁，只影响最终写入的 Δ。
// 返回 { 点, 采用, 超区间, 不可靠, 差值, 轴, 裁决度:{我,它}, 中点 }
export function 合成(我, 它, 阈值 = 0.15) {
  // 裁决度优先用 K；老调用只传认知度时按认知度兼容（生产路径显式传 裁决度=K）
  const 裁我 = Number(我 && (我.裁决度 != null ? 我.裁决度 : 我.认知度)) || 0
  const 裁它 = Number(它 && (它.裁决度 != null ? 它.裁决度 : 它.认知度)) || 0
  const 差 = {}
  let 超 = false
  let 轴 = null
  let 最大 = -1
  for (const k of 轴们) {
    const a = (Number(我.点数 && 我.点数[k]) || 0) * 基准 * 裁我
    const b = (Number(它.点数 && 它.点数[k]) || 0) * 基准 * 裁它
    const dd = Math.abs(a - b)
    差[k] = Number(dd.toFixed(4))
    if (Math.round(dd * 100) > Math.round(阈值 * 100)) 超 = true
    if (dd > 最大) { 最大 = dd; 轴 = k }
  }
  const 点 = (x) => ({ E: Number(x.E) || 0, S: Number(x.S) || 0, P: Number(x.P) || 0 })
  const 中点 = () => ({
    E: ((Number(我.点数.E) || 0) + (Number(它.点数.E) || 0)) / 2,
    S: ((Number(我.点数.S) || 0) + (Number(它.点数.S) || 0)) / 2,
    P: ((Number(我.点数.P) || 0) + (Number(它.点数.P) || 0)) / 2,
  })
  const 底 = { 差值: 差, 轴, 裁决度: { 我: 裁我, 它: 裁它 } }
  const 出 = (p, 裁) => ({ ...底, 点: p, delta: 轨Δ(p, 裁) })
  if (!超) {
    const p = 中点()
    return { ...出(p, (裁我 + 裁它) / 2), 采用: '中点', 超区间: false, 不可靠: false, 中点: true, 原因: '三轴差都 ≤ 阈值' }
  }
  const 认我 = Number(我 && 我.认知度 != null ? 我.认知度 : 裁我)
  const 认它 = Number(它 && 它.认知度 != null ? 它.认知度 : 裁它)
  if (Math.abs(认我 - 认它) <= 0.05) {
    const p = 中点()
    return { ...出(p, (裁我 + 裁它) / 2), 采用: '中点', 超区间: true, 不可靠: false, 中点: true, 原因: '认知度差 ≤0.05，取中点' }
  }
  const 用我 = 四支(认我, 认它) === '我'
  const 不靠 = (用我 && 裁我 < 0.6) || (!用我 && 裁它 < 0.6)
  return { ...出(点(用我 ? 我.点数 : 它.点数), 用我 ? 裁我 : 裁它), 采用: 用我 ? '我' : '它', 超区间: true, 不可靠: 不靠, 中点: false, 原因: '超阈按认知度四支：' + (用我 ? '我' : '它') }
}


// v0.23 A2：两条曲线（每段 E/S/P 点数）的对比
export function 比曲线(我点s, 它点s, 阈 = 0.15, K我 = 1, K它 = 1) {
  const A = (Array.isArray(我点s) ? 我点s : []).filter((p) => p && Number.isFinite(Number(p.E)) && Number.isFinite(Number(p.S)) && Number.isFinite(Number(p.P)))
  const B = (Array.isArray(它点s) ? 它点s : []).filter((p) => p && Number.isFinite(Number(p.E)) && Number.isFinite(Number(p.S)) && Number.isFinite(Number(p.P)))
  const n = Math.min(A.length, B.length)
  if (!n) return null
  const 轴们 = ['E', 'S', 'P']
  const 偏 = { E: 0, S: 0, P: 0 }
  for (let i = 0; i < n; i++) for (const k of 轴们) 偏[k] += Math.abs(Number(A[i][k]) - Number(B[i][k]))
  for (const k of 轴们) 偏[k] = Number((偏[k] / n).toFixed(3))
  const 最大偏 = Math.max(偏.E, 偏.S, 偏.P)
  let 同 = 0, 共 = 0
  for (let i = 1; i < n; i++) for (const k of 轴们) {
    const da = Number(A[i][k]) - Number(A[i - 1][k]), db = Number(B[i][k]) - Number(B[i - 1][k])
    // da 是段点（±1 制）的相邻差，仍按 ≥1；db 是已归一的它点，原 ±9 制 ≥1 点等比换成 1/9。
    if (Math.abs(da) >= 1 && Math.abs(db) >= 归一相邻差阈) { 共++; if ((da > 0) === (db > 0)) 同++ }
  }
  const 对齐率 = 共 ? Number((同 / 共).toFixed(3)) : null
  const 末 = { E: Math.abs(Number(A[n - 1].E) - Number(B[n - 1].E)), S: Math.abs(Number(A[n - 1].S) - Number(B[n - 1].S)), P: Math.abs(Number(A[n - 1].P) - Number(B[n - 1].P)) }
  const 最大末 = Math.max(末.E, 末.S, 末.P)
  // 0.2 口径：分身为主、分歧不折中。超阈一律采用分身；K 只标不可靠，不反选。
  let 采用 = '中点'
  if (最大偏 > 阈) 采用 = '它'
  const 点 = {}
  for (const k of 轴们) {
    const a = Number(A[n - 1][k]), b = Number(B[n - 1][k])
    点[k] = 采用 === '中点' ? Math.round((a + b) / 2) : 采用 === '我' ? a : b
  }
  const 不可靠 = !!(K它 < 0.6 && 最大偏 > 阈)
  return { 对齐率, 平均偏移: 偏, 最大偏移: 最大偏, 差: 末, 最大末差: 最大末, 采用, 不可靠, 点, 段数: n }
}


// v0.24 A2（2026-11-14）：主曲线——分身（第二轨）为主，聊天轨迹只作参照。
// 返回 { 点, 来源:'分身'|'单轨', 单轨, 偏移, 分歧, 反向 }
export function 主曲线(我点s, 它点s, K我 = 1, K它 = 1, 阈 = 0.15, 选项 = {}) {
  const 轴们 = ['E', 'S', 'P']
  const 整 = (xs) => (Array.isArray(xs) ? xs : []).filter((p) => p && 轴们.every((k) => Number.isFinite(Number(p[k]))))
  const A = 整(我点s)
  const B = 整(它点s)
  if (!B.length) return { 点: A, 来源: '单轨', 单轨: true, 偏移: 0, 分歧: false, 反向: false }
  const n = Math.min(A.length, B.length)
  if (!n) return { 点: B, 来源: '分身', 单轨: false, 偏移: 0, 分歧: false, 反向: false }
  let 偏 = 0
  for (let i = 0; i < n; i++) {
    let d0 = 0
    for (const k of 轴们) d0 += Math.abs(Number(B[i][k]) - Number(A[i][k]))
    偏 += d0 / 3
  }
  偏 = 偏 / n
  let 接管 = false
  let 权重 = Number(选项.分身权重)
  if (!Number.isFinite(权重)) 权重 = 0.7
  权重 = Math.max(0.5, Math.min(0.9, 权重))
  const 接管中 = !!选项.接管中
  const 反轴0 = 轴们.filter((k) => {
    const a = Number(A[A.length - 1][k]) || 0, b = Number(B[B.length - 1][k]) || 0
    return Math.abs(a) > 0.5 && Math.abs(b) > 归一反向阈 && Math.sign(a) !== Math.sign(b)
  })
  const 取我 = () => {
    const 点0 = {}
    for (const k of 轴们) 点0[k] = Math.round(Number(A[A.length - 1][k]) || 0)
    return { 点: 点0, 来源: '我', 采用: '我', 单轨: false, 偏移: Number(偏.toFixed(4)), 分歧: 偏 > 阈, 反向: 反轴0.length >= 2, 接管: true, 权重 }
  }
  const 认我 = Number(选项.认我 != null ? 选项.认我 : K我)
  const 认它 = Number(选项.认它 != null ? 选项.认它 : K它)
  const 接管态 = 接管中 ? !(Number(K它) >= 0.75) : Number(K它) < 0.6
  const 不可靠 = Number(K它) < 0.6
  const 末A = A[A.length - 1], 末B = B[B.length - 1]
  const 反轴 = 轴们.filter((k) => {
    const a = Number(末A[k]) || 0, b = Number(末B[k]) || 0
    return Math.abs(a) > 0.5 && Math.abs(b) > 归一反向阈 && Math.sign(a) !== Math.sign(b)
  })
  if (偏 <= 阈) {
    const 点0 = {}
    for (const k of 轴们) 点0[k] = Math.round(权重 * (Number(末B[k]) || 0) + (1 - 权重) * (Number(末A[k]) || 0))
    return { 点: 点0, 来源: '加权', 采用: '加权', 单轨: false, 偏移: Number(偏.toFixed(4)), 分歧: false, 反向: 反轴.length >= 2, 接管: 接管态, 不可靠: 不可靠, 权重 }
  }
  const 选 = 四支(认我, 认它)
  if (选 === '我') return { ...取我(), 不可靠: 不可靠 }
  return { 点: B, 来源: '分身', 采用: '它', 单轨: false, 偏移: Number(偏.toFixed(4)), 分歧: true, 反向: 反轴.length >= 2, 接管: 接管, 不可靠: 不可靠, 权重 }
}
