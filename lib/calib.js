// 0.2.7 校准：池内分位门槛 / 逆标准差权重 / 相似度基线 / 轮画像环形缓冲
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join , dirname } from 'node:path'
import { 轴们, 先验门槛, 先验权重, 中位, 百分位, 形状, 形状距离, 夹, 回归, 单步中位, 跳变 } from './shape.js'

export const 分位 = 百分位
export const 先验样本门槛 = 500
export const 环形上限 = 2000
export const 基线对 = 300
export const 权重对 = 200
export const 权重下限 = 0.05
export const 变化阈 = 0.03
export const 分位设定 = { 基线: 0.3, 趋势: 0.2, 跳变: 0.05 }

// 0.2.7 收尾：种子冷启动（去标识段点曲线，500 轮）
export const 种子文件名 = '情绪池-种子-500.json'
export const 种子轮数 = 500
// 2026-11-18 任务单 2250：种子随包发布——先读 HOME，读不到回退插件目录 assets\seed-500.json
const 插件种子路径 = () => process.env.EP_SEED_PATH || join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'seed-500.json')
function 解析种子(p) {
  try {
    if (!p || !existsSync(p)) return null
    const o = JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, ''))
    const 曲线 = (Array.isArray(o && o.曲线) ? o.曲线 : [])
      .map((c) => (c && (c.轴 || c)) || null)
      .filter((a) => a && 轴们.every((k) => Array.isArray(a[k]) && a[k].length >= 2))
    if (!曲线.length) return null
    return { 曲线, n0: Number(o.n0) || 种子轮数, 格式: o.格式 || null }
  } catch {
    return null
  }
}
export function 读种子(home) {
  if (home) {
    const 自 = 解析种子(join(home, 种子文件名))
    if (自) return 自
  }
  return 解析种子(插件种子路径())
}

export const 轮画像目录 = (home) => join(home, '情绪池-轮画像')

function seed(str) {
  let h = 2166136261
  for (const ch of String(str)) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
function rand(状态) {
  let x = 状态.s |= 0
  x ^= x << 13
  x ^= x >>> 17
  x ^= x << 5
  状态.s = x
  return ((x >>> 0) % 1000000) / 1000000
}

// 池内分位门槛：波动比最静 30% / R² 最直 20% / 单步最猛 5%（Q6：基线直接对单步中位取分位）
// 0.1 网格分位的工具：算出的分位值若与样本同分，往上取一格 0.1。
// 规矩（2026-11-18）：以后凡在 0.1 网格上取分位（新增的门槛/分位）都要考虑同分；
// 但基线按策划间当日决定**不**上取（放宽会把正常波动吞成基线），跳变改用「≥2 轴同跳」也不上取。
export function 分位上取(样本, p) {
  const 值 = 百分位(样本, p)
  const 格 = 0.1
  // 段点量化在 0.1 网格：若算出的值本身就在网格上且同分存在，取下一格
  const 下一 = Number((值 + 格).toFixed(10))
  const 有上限 = 样本.some((x) => Number(x) >= 下一 - 1e-9)
  return 有上限 ? 下一 : 值
}

export function 算门槛(样本, 选项 = {}) {
  const 行 = Array.isArray(样本) ? 样本 : []
  const 单步们 = []
  const r2们 = []
  const 跳们 = []
  const 斜们 = []
  // 2026-11-18 收尾：R²/斜率只吃 n>=4 的曲线（2 点直线 R² 恒为 1，会把趋势门顶到 0.64）；
  // 基线（单步中位）与跳变仍全取。
  const 吃 = (单, R2, 跳, 斜, 长) => {
    单步们.push(Number(单) || 0)
    跳们.push(Number(跳) || 0)
    if (!长 || Number(长) >= 4) {
      r2们.push(Number(R2) || 0)
      斜们.push(Math.abs(Number(斜) || 0))
    }
  }
  for (const s of 行) {
    const 轴 = s && s.轴
    if (轴) {
      for (const k of 轴们) {
        const a = 轴[k]
        if (!a) continue
        吃(a.单步中位, a.R2, a.跳变, a.斜率, a.点数)
      }
      continue
    }
    // 没有逐轴统计时，从曲线现算（每轮多轴，逐轴入样）
    const 曲线 = (s && s.曲线) || {}
    for (const k of 轴们) {
      const v = 曲线[k]
      if (!Array.isArray(v) || v.length < 2) continue
      const r = 回归(v)
      吃(单步中位(v), r.R2, 跳变(v), r.斜率, v.length)
    }
  }
  const n = 单步们.length
  const 先验 = { ...先验门槛, ...(选项.先验 || {}) }
  if (n < (Number(选项.最少样本) || 先验样本门槛)) {
    return {
      ...先验,
      样本数: n,
      先验: true,
      分位: { ...分位设定 },
    }
  }
  // 2026-11-18 策划间定：基线**不做**同分上取（上取会让带宽 17.3%→38.8%，把正常波动吞成基线）。
  // 段点量化在 0.1 网格，基线实测 17.3%，低于设计目标 30%，如实写报告。
  const 基线 = 百分位(单步们, 1 - 分位设定.基线)
  const 趋势 = 百分位(r2们, 1 - 分位设定.趋势)
  // 跳变门：分位值按 0.1 网格**向下取整格**（0.6475 → 0.60）。段点量化在 0.1 网格，
  // 85 分位若落在 0.6–0.7 之间，门槛升到 0.6475 会把整格 0.6 的样本排除，跳变率从 6% 掉到 1.7%。
  const 跳变门 = Number((Math.floor(百分位(跳们, 1 - 分位设定.跳变) * 10 + 1e-9) / 10).toFixed(4))
  const 斜率门 = 百分位(斜们, 0.5)
  return {
    基线: Number(基线.toFixed(4)),
    趋势: Number(趋势.toFixed(4)),
    跳变: Number(跳变门.toFixed(4)),
    斜率门: Number(斜率门.toFixed(4)),
    样本数: n,
    先验: false,
    分位: { ...分位设定 },
  }
}

// 相似度基线：池内随机 300 对相似度的中位数
export function 算基线(曲线们, 选项 = {}) {
  const 形们 = (曲线们 || []).filter(Boolean).map((c) => 形状(c))
  if (形们.length < 2) return { 基线: 0, 对: 0 }
  const 对 = Math.min(Number(选项.对数) || 基线对, 形们.length * 2)
  const 状态 = { s: seed(String(选项.种子 || 'esp')) }
  const 相似 = []
  for (let i = 0; i < 对; i++) {
    const a = 形们[Math.floor(rand(状态) * 形们.length)]
    const b = 形们[Math.floor(rand(状态) * 形们.length)]
    if (a === b) continue
    相似.push(形状距离(a, b).相似度)
  }
  return { 基线: Number(中位(相似).toFixed(4)), 对: 相似.length }
}

// 逆标准差权重 + 冷启动收缩（先验 1/3，m=500）
export function 算权重(曲线们, 选项 = {}) {
  const 形们 = (曲线们 || []).filter(Boolean).map((c) => 形状(c))
  if (形们.length < 3) {
    return { ...先验权重, 样本数: 0, 先验: true }
  }
  const 对 = Math.min(Number(选项.对数) || 权重对, 形们.length * 3)
  const 状态 = { s: seed(String(选项.种子 || 'espw')) }
  const 角 = []
  const 数 = []
  const 距 = []
  for (let i = 0; i < 对; i++) {
    const a = 形们[Math.floor(rand(状态) * 形们.length)]
    const b = 形们[Math.floor(rand(状态) * 形们.length)]
    if (a === b) continue
    const d = 形状距离(a, b)
    角.push(d.角)
    数.push(d.数)
    距.push(d.距)
  }
  const n = 角.length
  if (!n) return { ...先验权重, 样本数: 0, 先验: true }
  const st = (a) => {
    const m = a.reduce((s, x) => s + x, 0) / a.length
    return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length)
  }
  const σ = { 角: st(角), 数: st(数), 距: st(距) }
  const inv = {}
  for (const k of ['角', '数', '距']) inv[k] = 1 / Math.max(权重下限, σ[k] || 0)
  const 和 = inv.角 + inv.数 + inv.距
  const 数据 = { 角: inv.角 / 和, 数: inv.数 / 和, 距: inv.距 / 和 }
  const m = 500
  const 合并 = {}
  for (const k of ['角', '数', '距']) 合并[k] = (n * 数据[k] + m * 先验权重[k]) / (n + m)
  const 总 = 合并.角 + 合并.数 + 合并.距
  return {
    角: Number((合并.角 / 总).toFixed(4)),
    数: Number((合并.数 / 总).toFixed(4)),
    距: Number((合并.距 / 总).toFixed(4)),
    样本数: n,
    先验: false,
  }
}

// 读轮画像（不存在 → 空）
export function 读轮画像(池名, home) {
  const p = join(轮画像目录(home), String(池名 || '总') + '.json')
  try {
    if (!existsSync(p)) return { 格式: 'EPN-rounds', 版本: 1, 池: 池名, 上限: 环形上限, 记录: [] }
    const o = JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, ''))
    return { 格式: 'EPN-rounds', 版本: 1, 池: 池名, 上限: 环形上限, ...(o || {}), 记录: Array.isArray(o && o.记录) ? o.记录 : [] }
  } catch {
    return { 格式: 'EPN-rounds', 版本: 1, 池: 池名, 上限: 环形上限, 记录: [] }
  }
}

// 追加一轮（环形截断到 2000）
export function 追加轮画像(池名, 记录, home, 上限 = 环形上限) {
  const o = 读轮画像(池名, home)
  o.记录.push(记录)
  const 顶 = Number(上限) || 环形上限
  if (o.记录.length > 顶) o.记录 = o.记录.slice(o.记录.length - 顶)
  写轮画像(池名, home, o)
  return o
}
export function 写轮画像(池名, home, o) {
  const 目录 = 轮画像目录(home)
  mkdirSync(目录, { recursive: true })
  const p = join(目录, String(池名 || '总') + '.json')
  const 临时 = p + '.tmp'
  writeFileSync(临时, JSON.stringify({ ...o, 格式: 'EPN-rounds', 版本: 1, 池: 池名, 上限: 环形上限 }, null, 1), 'utf8')
  renameSync(临时, p)
  return p
}

// 最剧烈一轴（与池内「曲线们」口径一致：每轮取路径最长的那一轴）
function 最烈轴(轴) {
  let 最 = null
  let 幅 = -1
  for (const k of 轴们) {
    const v = 轴 && 轴[k]
    if (!Array.isArray(v) || v.length < 2) continue
    const 形 = 形状(v)
    if (形.路径 > 幅) {
      幅 = 形.路径
      最 = v
    }
  }
  return 最
}

// 校准结果（不写盘）：门槛 + 权重 + 相似度基线
export function 校准(记录们, 选项 = {}) {
  const 行 = (记录们 || []).filter(Boolean)
  const 曲线们 = 行.map((r) => {
    const 轴 = r.曲线 || {}
    // 取「最剧烈」一轴的曲线参与距离/权重/基线
    let 最 = null
    let 幅 = -1
    for (const k of 轴们) {
      const v = 轴[k]
      if (!Array.isArray(v) || v.length < 2) continue
      const 形 = 形状(v)
      const 变化 = 形.路径
      if (变化 > 幅) {
        幅 = 变化
        最 = v
      }
    }
    return 最
  }).filter(Boolean)
  let 门 = 算门槛(行, 选项)
  let 权 = 算权重(曲线们, 选项)
  let 基 = 算基线(曲线们, 选项)
  let 种子数 = 0
  let 混合比 = 1
  const 种子 = 选项 && 选项.种子
  if (种子 && Array.isArray(种子.曲线) && 种子.曲线.length) {
    // s = (n·s_own + n0·s_seed) / (n + n0)：n = 本池轮数，n0 = 种子轮数（500）
    const n0 = Number(种子.n0) || 种子轮数
    const n = 行.length
    const 种行 = 种子.曲线.map((a) => ({ 曲线: a }))
    const 种门 = 算门槛(种行)
    const 种曲 = 种子.曲线.map(最烈轴).filter(Boolean)
    const 种权 = 算权重(种曲)
    const 种基 = 算基线(种曲)
    种子数 = n0
    混合比 = n / (n + n0)
    const 混 = (a, b) => Number(((n * Number(a) + n0 * Number(b)) / (n + n0)).toFixed(4))
    门 = {
      ...门,
      基线: 混(门.基线, 种门.基线),
      趋势: 混(门.趋势, 种门.趋势),
      跳变: Number((Math.floor(混(门.跳变, 种门.跳变) * 10 + 1e-9) / 10).toFixed(4)),
      斜率门: 混(门.斜率门, 种门.斜率门),
      先验: false,
      种子: true,
      种子样本: 种门.样本数,
    }
    const w = {
      角: 混(权.角, 种权.角),
      数: 混(权.数, 种权.数),
      距: 混(权.距, 种权.距),
    }
    const 总 = w.角 + w.数 + w.距
    权 = {
      角: Number((w.角 / 总).toFixed(4)),
      数: Number((w.数 / 总).toFixed(4)),
      距: Number((w.距 / 总).toFixed(4)),
      样本数: 权.样本数,
      先验: false,
      种子: true,
    }
    基 = { ...基, 基线: 混(基.基线, 种基.基线) }
  }
  return { 门槛: 门, 权重: 权, 相似度基线: 基.基线, 基线对数: 基.对, 样本数: 行.length, 种子数, 混合比: Number(混合比.toFixed(4)) }
}

// 是否该落盘：任一门槛/权重变化 > 0.03
export function 该落盘(旧, 新) {
  const 比 = (a, b) => {
    const x = Number(a)
    const y = Number(b)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false
    return Math.abs(x - y) > 变化阈
  }
  for (const k of ['基线', '趋势', '跳变', '斜率门']) if (比(旧 && 旧[k], 新[k])) return true
  for (const k of ['角', '数', '距']) if (比(旧 && 旧[k], 新[k])) return true
  return false
}
