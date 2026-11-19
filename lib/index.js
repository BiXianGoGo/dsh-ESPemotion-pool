// 情绪池（dsh-emotion-pool）· M3
// 记录：自报 → 纯派生（Σ raw×年龄系数 + spine）→ 守恒 → 三条轴 + 27 格 + 日志 + /state。
// M3 校验：每条有自报的轮跑一次独立 ctx.llm.stream（temp 0 / maxTokens 40，只答 OK 或 矛盾:原因）；
//          矛盾只追加 flag 进日志，不改数值；调用失败记「校验不可用」，不阻塞。
// 注入留给 M4。
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, renameSync, openSync, closeSync, unlinkSync, statSync, readdirSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID, createHash } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'
import { spawn } from 'node:child_process'
import { 认知度 as 认度, 轨Δ, 算K, 合成, 主曲线, 冷启动K, 轴们 as 双轴 } from './dual.js'

export const name = 'emotion-pool'
export const inject = ['sessions', 'webServer', 'llm', 'agents', 'systemPrompt']

const 包根 = join(dirname(fileURLToPath(import.meta.url)), '..')

const HOME = process.env.EMOTION_POOL_DIR || 'E:\\whale-home\\memory'
const POOL_PATH = join(HOME, '情绪池.json')
const CONFIG_PATH = join(HOME, '情绪池配置.json')
const LOCK_PATH = join(HOME, '情绪池.json.lock')

// v0.5：刻度 10 —— 只换显示/输入单位，内部一律 -1~+1
export function 读数刻度(配置) {
  const n = Number(配置 && 配置.刻度)
  return Number.isFinite(n) && n >= 1 && n <= 100 ? n : 10
}
function 标值(配置, v) {
  const k = 读数刻度(配置)
  return Number((Number(v) * k).toFixed(4))
}

export const 版本 = '0.2.7'

const 默认配置 = {
  启用: true,
  校验启用: true,
  校验每天上限: 50,
  校验只跑有自报的轮: true,
  双轨重做: true,
  双轨阈值: 0.15,
  分身权重: 0.7,
  确认问日限: 12,
  不应期小时: 6,
  敏感增益系数: 0.4,
  渴求阈值天: 3,
  命名强制小时: 6,
  曲线注入开关: true,
  同句不重复分钟: 30,
  情绪自述开关: true,
  说明书指路开关: true,
  说明书路径: 'E:\\whale-home\\notes\\情绪池-模型说明书.md',
  使用说明路径: 'E:\\whale-home\\notes\\情绪池-使用说明.md',
  错判告知: true,
  默认页: 0,
  分身每批: 300,
  提醒启用: true,
   守恒上限: 1.0,
  写入者: ['c4b92d68'],
  装载会话: [], // v0.22：只累加这些会话的事件；空数组 = 全部（v0.23：有「组」时以组为准）
  组: [
    { 名: '常用聊天组', 会话: ['c4b92d68'] },
    { 名: '测试组', 会话: ['6a169bce'] },
  ],
  // 2026-11-09 00:50：注入默认开；刺阈值默认 0.25
  会话名: { '8f689553': '小汐聊天间3', '6a169bce': '策划间', '3be73c36': '小汐工作间' },
 注入启用: true,
  注入日限: 24,
  保底间隔分钟: 90,
  保底轮数: 8,
  吸附系数: 0.4,
  v06: true,
  溢出抑制系数: 1.4,
  衰减档位: [[0.05, 12], [0.15, 8], [0.3, 5], [9, 3]],
  水位比例: 0.4,
  单次偏移: 0.01,
  冷却: 6,
  阈值倍数: 1.5,
  封顶: 0.2,
  刻度: 100,
  分段最长段数: 6,
  存储模式: '旧',
  // v0.21：显示/输入单位（内部仍 -1~+1）
  打点模型: null, // 0.2：{provider, model}；填了就用它，空则回退会话模型
  波动阈值: 0.15, // 0.2：同向累计到它算一次波动
  曲线速度: 40,
  模板相似门槛: 0.8,
  模板量级门: 0.3,
  K窗口天: 7,
  K半衰天: 3,
  K样本上限: 40,
  动画时长: 800, // 0.2：卡片第一页绿点移动时长 ms
  缓动强度: 2.0, // 0.2：二次缓动指数
  蓝收缩时长: 1200, // 0.2：蓝段收缩消失时长 ms
   // 2026-11-09 03:05：结太滥——累计门槛 0.45（三步），另留「急」通道（单条 ≥0.20 且速率 ≥0.05/分钟）
  结累计阈值: 0.60, // 2026-11-09 19:58：24 条事件结了 13 条，太松；0.45→0.60
  结急阈值: 0.25,
  结急速率: 0.05,
  // 2026-11-09 11:09：双轨校验——小模型独立判增量，与自报比；不一致只记录，不改数
  双轨校验: true,
  一致阈值: 0.1,
  报警阈值: 0.4,
  报警冷却小时: 24,
  日志: ['情绪池-日志.md', '情绪池-日志.jsonl'],
}

const 档位表 = new Map([
  ['最近', 1.0],
  ['这段时间', 0.85],
  ['上次', 0.7],
  ['不久前', 0.55],
  ['好像过了挺久', 0.35],
  ['很久很久以前', 0.15],
])

import { 转折提示, 签名 } from './tpl.js'
import * as 分片 from './store.js'
import { 溢出现值, 溢出更新, 溢出记, 有效溢出, 速率记, 速率和, τ选, 记峰值, 近峰值, 水位, 推进, 结坐标, 最高结轴, τ加权, 记六头, 六头计, 判零点, 应用零点, 显示值, 日键 } from './v06.js'
import { 三轴状态, 先验门槛, 形状, 形状距离, 新尺, 判归属, 三轴签名, 平均相似度, 走表, 片号, 叶枝, 最烈轴, 路径长度, 中位 } from './shape.js'
import * as 校准 from './calib.js'

const 轴们 = ['E', 'S', 'P']

// §24.1（2026-11-08 23:10）：时间曲线三段——先掉、回味回升、之后半衰期 30 天。
// t≤1：1.00→0.80；1<t≤7：0.80→0.95；t>7：0.95×exp(−(t−7)/30)。峰值永远不到 1.0。
// 六档词只做人话对照（§24.1 保留作标签），系数一律按曲线算。
const 档名表 = [
  { 上限天: 1, 名: '最近' },
  { 上限天: 3, 名: '这段时间' },
  { 上限天: 7, 名: '上次' },
  { 上限天: 30, 名: '不久前' },
  { 上限天: 180, 名: '好像过了挺久' },
  { 上限天: Infinity, 名: '很久很久以前' },
]

export function 年龄系数(t, 基准 = Date.now(), 速度 = 1) {
  const ms = Date.parse(String(t || ''))
  if (!Number.isFinite(ms)) return { 天: 0, 系数: 1.0, 档名: '最近' }
  // §25.3：P 负向「时间衰减速度是正向的两倍」→ 传 速度=2。
  const 天 = Math.max(0, ((基准 - ms) / 86400000) * (Number(速度) || 1))
  // 刚发生（<1 分钟）按 1.00：曲线在 t→0 处从 1.00 起步，避免同轮写入掉一丝
  if (天 < 1 / 1440) return { 天, 系数: 1.0, 档名: '最近' }
  // §27.1：三段峰值 <1 —— 首日 1.00→0.95、1–14 天 0.95→0.98、之后 0.98×exp(−(t−14)/30)
  let 系数
  if (天 <= 1) 系数 = 1 - 0.05 * 天
  else if (天 <= 14) 系数 = 0.95 + 0.03 * ((天 - 1) / 13)
  else 系数 = 0.98 * Math.exp(-(天 - 14) / 30)
  系数 = Math.max(0, Math.min(1, 系数))
  const 行 = 档名表.find((r) => 天 < r.上限天) || 档名表[档名表.length - 1]
  return { 天, 系数, 档名: 行.名 }
}

// ── 小工具 ─────────────────────────────────────────────────────────────
function 夹(v, 小, 大) {
  return Math.max(小, Math.min(大, Number(v) || 0))
}

function 现在() {
  const d = new Date()
  const p = (n, w = 2) => String(n).padStart(w, '0')
  const 偏 = -d.getTimezoneOffset()
  const 号 = 偏 >= 0 ? '+' : '-'
  const 时 = p(Math.floor(Math.abs(偏) / 60))
  const 分 = p(Math.abs(偏) % 60)
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${号}${时}:${分}`
}

function 时分() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

function 日期(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function 差天(从, 到) {
  const a = Date.parse(String(从) + 'T00:00:00Z')
  const b = Date.parse(String(到) + 'T00:00:00Z')
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.max(0, Math.round((b - a) / 86400000))
}

export function 求和(axes) {
  let 正 = 0
  let 负 = 0
  for (const k of 轴们) {
    const v = Number(axes && axes[k]) || 0
    if (v > 0) 正 += v
    else 负 += -v
  }
  return { 正: Number(正.toFixed(4)), 负: Number(负.toFixed(4)) }
}

function 取正文(message) {
  if (!message) return ''
  // 2026-11-09 02:35：content 可能是数组（assistant / 普通 user），也可能直接是字符串
  if (typeof message.content === 'string') return message.content.trim()
  if (!Array.isArray(message.content)) return ''
  return message.content
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
    .trim()
}

/** 用户话里可能带来源头（【QQ私聊】/【另一间会话递过来的】），它不算「用户说的话」 */
// 2026-11-16 19:4x：DSH 每轮会往最后一条用户消息里塞「时间采样 / 时区 / system-reminder / runtime context」
// 这类机器话。它们是宿主注入，不是他打的字——留在「原话」里会让卡片全是英文，判分也会被它们带偏。
const 宿主注入行 = [
  /^Time sampled while preparing turn/i,
  /^Browser time zone for this request/i,
  /^Interpret otherwise-unqualified dates and times/i,
  /^Elapsed since (the preceding|preceding step|the preceding model-visible message)/i,
  /^Current runtime context/i,
  /^Current working directory:/i,
  /^Current DSH file policy:/i,
  /^Approval prompts are disabled/i,
  /^You are (the root agent|\w+ agent)/i,
  /^To message other agents,/i,
  /^Use list_agents\(/i,
  /^Current DeepSeek Harness implementation checkout:/i,
  /^Current DeepSeek Harness Web GUI URL:/i,
  /^【你记得的事】/,
  /^下面是你们过去真实发生过的事/,
  /^The following information describes your current session/i,
  /^This snapshot supersedes earlier runtime-context/i,
]
function 洗宿主注入(t) {
  let s = String(t || '')
  s = s.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, ' ')
  // 2026-11-16 19:5x：原话会被截到 500 字，system-reminder 常常被截得没有闭合标签，
  // 上面的成对替换就漏了——这里把「未闭合的 system-reminder」到结尾整段切掉。
  s = s.replace(/<system-reminder>[\s\S]*$/i, ' ')
  s = s.replace(/The following information describes your current session[\s\S]*$/i, ' ')
  const 行们 = s.split(/\r?\n/).filter((l) => !宿主注入行.some((re) => re.test(l.trim())))
  return 行们.join('\n')
}
function 洗用户话(t) {
  let s = 洗宿主注入(t).replace(/\s+/g, ' ').trim()
  s = s.replace(/^【[^】]*】\s*/, '')
  return s
}

function 摘要(s) {
  let h = 5381
  for (let i = 0; i < s.length; i += 1) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

// ── 配置 / 池的读写 ────────────────────────────────────────────────────

// ── v0.14 设置页：白名单读写 ──────────────────────────────────────────
export function 设置清单() {
  return [
    { 键: '注入启用', 名: '注入', 说明: '是否把【此刻】的情绪坐标塞进上下文', 类型: '布尔', 默认: true, 范围: null },
    { 键: '注入日限', 名: '注入日限', 说明: '插队注入每天上限（保底注入不受它管）', 类型: '数字', 默认: 24, 范围: [0, 200], 整数: true },
    { 键: '分身权重', 名: '分身权重', 说明: '阈值内两条曲线加权：分身占多少（0.5–0.9）', 类型: '数字', 默认: 0.7, 范围: [0.5, 0.9] },
    { 键: '双轨阈值', 名: '双轨阈值', 说明: '两轨点数差超过它才算「超区间」', 类型: '数字', 默认: 0.15, 范围: [0.05, 0.5], 整数: false },
    { 键: '波动阈值', 名: '波动阈值', 说明: '思考流里累计变化超过它才算一次波动', 类型: '数字', 默认: 0.15, 范围: [0.05, 0.5], 整数: false, 步进: 0.01 },
    { 键: '错判告知', 名: '错判告知', 说明: '要不要把「上一轮判偏了」传给分身（记账不受影响）', 类型: '布尔', 默认: true, 范围: null },
    { 键: 'QQ报警', 名: 'QQ报警', 说明: '分歧率报警总闸，false 一条都不发', 类型: '布尔', 默认: false, 范围: null },
    { 键: '报警冷却小时', 名: '报警冷却小时', 说明: '同一条报警两次之间至少隔多久', 类型: '数字', 默认: 24, 范围: [0, 8760], 整数: true },
    { 键: '刻度', 名: '刻度', 说明: '数值显示倍率（100 即 0–100 口径）', 类型: '数字', 默认: 100, 范围: [1, 100], 整数: true },
    { 键: '吸附系数', 名: '吸附系数', 说明: '推轴时向目标点靠近的比例（0.15–0.8）', 类型: '数字', 默认: 0.4, 范围: [0.15, 0.8], 步进: 0.01 },
    { 键: '推轴单步上限', 名: '推轴单步上限', 说明: '单次推轴 |Δ| 的上限（默认 0.30，量纲归一后；防止一条事件把轴顶满）', 类型: '数字', 默认: 0.3, 范围: [0.05, 1], 步进: 0.01 },
    { 键: '确认问日限', 名: '确认问日限', 说明: '一天最多几次「确认问」；超过后只推轴、不再追问', 类型: '数字', 默认: 12, 范围: [0, 100], 整数: true },
    { 键: '默认页', 名: '默认页', 说明: '卡片打开时停在哪一页（0 三轴 / 1 观测 / 2 列表 / 3 待确认 / 4 设置）', 类型: '数字', 默认: 0, 范围: [0, 4], 整数: true },
    { 键: '装载会话', 名: '装载会话', 说明: '只累加这些会话的事件；空 = 全部', 类型: '多选', 默认: [], 范围: null },
  { 键: '会话名', 名: '会话名', 说明: '会话短号 → 显示名（卡片用，可改）', 类型: '对象', 默认: { '8f689553': '小汐聊天间3', '6a169bce': '策划间', '3be73c36': '小汐工作间' }, 范围: null },
    { 键: '结累计阈值', 名: '结累计阈值', 说明: '30 分钟同向累计到多少算「冲」成结', 类型: '数字', 默认: 0.60, 范围: [0.2, 1.0], 整数: false },
    { 键: '曲线速度', 名: '曲线速度', 说明: '折线动画限速（像素/秒），越大越快', 类型: '数字', 默认: 40, 范围: [10, 200], 整数: true },
    { 键: '模板相似门槛', 名: '模板相似门槛', 说明: '判模板时形状分达到多少算命中（0.5–0.95）', 类型: '数字', 默认: 0.8, 范围: [0.5, 0.95] },
    { 键: '模板量级门', 名: '模板量级门', 说明: '判模板时量级差超过多少直接判量级不符（0.1–0.6）', 类型: '数字', 默认: 0.3, 范围: [0.1, 0.6] },
  { 键: '动画时长', 名: '动画时长(ms)', 说明: '第一页绿点移动时长', 类型: '数字', 默认: 800, 范围: [0, 2000], 整数: true },
    { 键: '缓动强度', 名: '缓动强度', 说明: '二次缓动指数（1 线性，4 很慢起/收）', 类型: '数字', 默认: 2.0, 范围: [1, 4], 整数: false },
    { 键: '蓝收缩时长', 名: '蓝收缩时长(ms)', 说明: '绿点到位后蓝段收缩消失的时长', 类型: '数字', 默认: 1200, 范围: [0, 2000], 整数: true },
    { 键: '保底间隔分钟', 名: '保底间隔分钟', 说明: '距上次注入至少多少分钟才保底注一次', 类型: '数字', 默认: 90, 范围: [20, 240], 整数: true },
    { 键: '保底轮数', 名: '保底轮数', 说明: '距上次注入至少多少轮才保底注一次', 类型: '数字', 默认: 8, 范围: [3, 20], 整数: true },
    { 键: 'K窗口天', 名: 'K窗口天', 说明: '信誉 K 只看最近多少天的轮次', 类型: '数字', 默认: 7, 范围: [1, 30], 整数: true },
    { 键: 'K半衰天', 名: 'K半衰天', 说明: 'K 权重半衰：几天前的记录权重减半', 类型: '数字', 默认: 3, 范围: [0.5, 30], 整数: false },
    { 键: 'K样本上限', 名: 'K样本上限', 说明: 'K 最多取最近多少条轮次', 类型: '数字', 默认: 40, 范围: [5, 200], 整数: true },
    { 键: '不应期小时', 名: '不应期小时', 说明: '同类事件多久内只涨适应、不涨敏感', 类型: '数字', 默认: 6, 范围: [1, 72], 整数: true },
    { 键: '敏感增益系数', 名: '敏感增益系数', 说明: 'P 增益 = 1 + 系数×(s−a)，夹 0.3–2.0', 类型: '数字', 默认: 0.4, 范围: [0.1, 1], 整数: false },
    { 键: '渴求阈值天', 名: '渴求阈值天', 说明: '某类多少天没来就记一次「渴求」', 类型: '数字', 默认: 3, 范围: [1, 14], 整数: true },
    { 键: '命名强制小时', 名: '命名强制小时', 说明: '同一形状反复没名字时，多久催一次「必须命名」', 类型: '数字', 默认: 6, 范围: [1, 48], 整数: true },
    { 键: '分段最长段数', 名: '分段最长段数', 说明: '一轮最多切几段，超出时尾部并成最后一段', 类型: '数字', 默认: 6, 范围: [2, 20], 整数: true },
    { 键: '曲线注入开关', 名: '曲线注入', 说明: '要不要在【此刻】下面加一句「曲线的意思」', 类型: '布尔', 默认: true, 范围: null },
    { 键: '同句不重复分钟', 名: '同句不重复分钟', 说明: '同一句曲线解读多久内不重复注入', 类型: '数字', 默认: 30, 范围: [1, 240], 整数: true },
    { 键: '情绪自述开关', 名: '情绪自述', 说明: '注入里写「现在/上一轮+为什么+注」，关掉退回旧【此刻】一行', 类型: '布尔', 默认: true, 范围: null },
    { 键: '说明书指路开关', 名: '说明书指路', 说明: '注入末尾给一行模型说明书路径', 类型: '布尔', 默认: true, 范围: null },
    { 键: '说明书路径', 名: '说明书路径', 说明: '模型说明书写到这个文件（写池后立即重写）', 类型: '文本', 默认: 'E:\\whale-home\\notes\\情绪池-模型说明书.md', 范围: null },
    { 键: '使用说明路径', 名: '使用说明路径', 说明: '给使用者看的说明，卡片「打开说明书」按钮开这个文件', 类型: '文本', 默认: 'E:\\whale-home\\notes\\情绪池-使用说明.md', 范围: null },
    { 键: '命名表路径', 名: '命名表路径', 说明: 'EPN-names 命名表存这里（分享架构 0.2.6；留空=memory 下的 情绪池-命名表.json）', 类型: '文本', 默认: '', 范围: null },
  ]
}

function 读原配置() {
  // 2026-11-11 10:45：先剥 BOM，再判空；解析失败要抛出来（由调用方转 500），
  // 绝不能静默返回 {}——否则一次写设置会把整份配置覆盖成只剩那一个键。
  const raw = String(readFileSync(CONFIG_PATH, 'utf8')).replace(/^\uFEFF/, '')
  const o = JSON.parse(raw)
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('配置根节点不是对象')
  return o
}

function 归一布尔(v) {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number' && (v === 0 || v === 1)) return v === 1
  const t = String(v == null ? '' : v).trim().toLowerCase()
  if (['true', '1', 'on', '是', '开'].includes(t)) return true
  if (['false', '0', 'off', '否', '关'].includes(t)) return false
  return null
}

export function 校验设置(键, 值) {
  const 项 = 设置清单().find((x) => x.键 === 键)
  if (!项) return { 错误: '不在白名单：' + String(键) }
  if (项.类型 === '多选') {
    if (!Array.isArray(值)) return { 错误: '「' + 项.名 + '」必须是数组' }
    if (值.length > 12) return { 错误: '「' + 项.名 + '」最多 12 个' }
    for (const v of 值) {
      if (typeof v !== 'string' || !/^[a-z0-9]{8}$/.test(v)) return { 错误: '「' + 项.名 + '」里的会话必须是 8 位短尾号：' + String(v) }
    }
    return { 值: Array.from(new Set(值)) }
  }
  if (项.类型 === '对象') {
    if (!值 || typeof 值 !== 'object' || Array.isArray(值)) return { 错误: '「' + 项.名 + '」必须是对象' }
    const 出 = {}
    for (const k of Object.keys(值)) {
      if (!/^[a-z0-9]{8}$/.test(k)) return { 错误: '「' + 项.名 + '」的键必须是 8 位短尾号：' + String(k) }
      if (typeof 值[k] !== 'string' || !值[k].trim() || 值[k].length > 12) return { 错误: '「' + 项.名 + '」的名字必须是 1–12 字' }
      出[k] = String(值[k]).trim()
    }
    return { 值: 出 }
  }
  if (项.类型 === '布尔') {
    const v = 归一布尔(值)
    if (v === null) return { 错误: '「' + 项.名 + '」只接受 开/关（true/false）' }
    return { 值: v }
  }
  if (typeof 值 !== 'number' || !Number.isFinite(值)) return { 错误: '「' + 项.名 + '」必须是数字' }
  if (项.整数 && !Number.isInteger(值)) return { 错误: '「' + 项.名 + '」必须是整数' }
  const [lo, hi] = 项.范围 || [-Infinity, Infinity]
  if (值 < lo || 值 > hi) return { 错误: '「' + 项.名 + '」必须在 ' + lo + '–' + hi + ' 之间' }
  return { 值 }
}

export function 打点模型信息() {
  try {
    const o = 读原配置()
    const m = o && o.打点模型
    if (m && typeof m === 'object' && m.provider && m.model) return { 来源: '配置', provider: String(m.provider), model: String(m.model) }
  } catch {}
  return { 来源: '会话', provider: null, model: null }
}

export function 设置表() {
  let 原
  try {
    原 = 读原配置()
  } catch {
    // 读坏了：GET 仍然给默认值（只读不写，不会覆盖）
    原 = {}
  }
  const 选项 = 会话选项()
  return 设置清单().map((项) => ({
    键: 项.键,
    名: 项.名,
    说明: 项.说明,
    类型: 项.类型,
    值: Object.prototype.hasOwnProperty.call(原, 项.键) ? 原[项.键] : 项.默认,
    范围: 项.范围,
    步进: 项.步进 != null ? 项.步进 : null,
    ...(项.类型 === '多选' ? { 选项 } : {}),
  }))
}

export function 写设置(键, 值) {
  const 校 = 校验设置(键, 值)
  if (校.错误) return { ok: false, 错误: 校.错误, 码: 400 }
  let 原
  try {
    原 = 读原配置()
  } catch (e) {
    return { ok: false, 错误: '配置文件读不出来（' + String((e && e.message) || e) + '），为免覆盖没有写入', 码: 500 }
  }
  原[键] = 校.值
  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(原, null, 2), 'utf8')
  } catch (e) {
    return { ok: false, 错误: '写配置失败：' + String((e && e.message) || e), 码: 500 }
  }
  return { ok: true, 键, 值: 校.值 }
}

export function 读配置() {
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
    const 合 = { ...默认配置, ...raw }
    // v0.5 兼容：旧配置没有 刻度 键时按 1（内部单位）解释；显式写了才用
    if (!raw || !Object.prototype.hasOwnProperty.call(raw, '刻度')) 合.刻度 = 1
    // v0.23：组只在配置里显式写过才生效；旧配置继续按「装载会话」走
    if (!raw || !Object.prototype.hasOwnProperty.call(raw, '组')) 合.组 = []
    return 合
  } catch {
    // 没有配置文件：按旧行为（装载会话），组要有显式配置才生效
    return { ...默认配置, 组: [] }
  }
}

function 空池() {
  return {
    rev: 0,
    updated: 现在(),
    axes: { E: 0, S: 0, P: 0 },
    spine: { S: 0 },
    // v0.4 R1（2026-11-09 15:00）：被夹掉的溢出量，只展示、不参与计算
    overflow: { E: 0, S: 0, P: 0 },
    格计时: null,
    prev_cell: 'E0S0P0',
    events: [],
    // v0.17：内部统一叫「结」（旧 JSON 键 刺 读入时迁移）；面向人一直叫结
    结: [],
    stats: { selfreport_total: 0, missed_total: 0 },
    last_decay: 日期(),
    last_sums: null,
    // §26：P 轴敏感化 s / 适应 a，按「方向+类型」分账（爽=正、痛=负），不进 events
    p_state: { 爽: { s: 1, a: 1, 最近: null }, 痛: { s: 1, a: 1, 最近: null } },
  双轨: { K: {}, 信誉: {}, 旧K: null, 最近: null },
    // 2026-11-09 02:21：同向连报独立计数器，三根各算各的；dir=上次方向，t=该轴上次自报时间
    streak: {},
    // 2026-11-09 02:35：结的 30 分钟累计窗（同轴同向才累加；成结后清零）
    结窗: {},
    // 2026-11-09 02:46：每 6 小时无事件、各轴向 0 靠 2% 的累计倍率（写入时折算，读时按 at 续算）
    回落: { at: 现在(), 倍: 1 },
    // v0.6：快照现值 + 溢出 + 速率 + 峰值 + 六头 + 零点（都不进 events）
    现值快照: { E: { x: 0, t: 现在(), τ: 12 }, S: { x: 0, t: 现在(), τ: 12 }, P: { x: 0, t: 现在(), τ: 12 } },
    会话快照: {},
    快照启用: false,
    溢出: { E: { v: 0, t: 现在() }, S: { v: 0, t: 现在() }, P: { v: 0, t: 现在() } },
    速率: { E: [], S: [], P: [] },
    峰值桶: { E: [], S: [], P: [] },
    六头: {},
    零点: { E: 0, S: 0, P: 0 },
  }
}

function 规整轴窗表(v, 类) {
  const 出 = {}
  for (const k of 轴们) {
    const x = v && typeof v === 'object' && v[k] && typeof v[k] === 'object' ? v[k] : {}
    const dir = [-1, 0, 1].includes(Number(x.dir)) ? Number(x.dir) : 0
    if (类 === 'streak') {
      出[k] = { n: Math.max(0, Math.trunc(Number(x.n) || 0)), dir, t: Math.max(0, Number(x.t) || 0) }
      if (x.轮 != null) 出[k].轮 = String(x.轮)
    } else {
      出[k] = { dir, sum: Number(x.sum) || 0, t: Math.max(0, Number(x.t) || 0) }
    }
  }
  return 出
}
function 是否旧轴表(t) {
  return !!t && typeof t === 'object' && 轴们.some((k) => t[k] && typeof t[k] === 'object' && ('dir' in t[k] || 'sum' in t[k] || 'n' in t[k]))
}
// v0.17：两本账按会话分——顶层键 = 短会话；旧结构（顶层是轴）先挂 __旧，读入阶段再归到写入者[0]
function 规整会话表(t, 类) {
  const 出 = {}
  if (!t || typeof t !== 'object') return 出
  if (是否旧轴表(t)) { 出.__旧 = 规整轴窗表(t, 类); return 出 }
  for (const [sid, v] of Object.entries(t)) {
    if (v && typeof v === 'object') 出[String(sid)] = 规整轴窗表(v, 类)
  }
  return 出
}
export function 规整池(o) {
  const 池 = { ...空池(), ...(o && typeof o === 'object' ? o : {}) }
  池.axes = { E: 夹(池.axes && 池.axes.E, -1, 1), S: 夹(池.axes && 池.axes.S, -1, 1), P: 夹(池.axes && 池.axes.P, -1, 1) }
  池.spine = { ...(池.spine && typeof 池.spine === 'object' ? 池.spine : {}) }
  for (const k of 轴们) if (池.spine[k] != null) 池.spine[k] = 夹(池.spine[k], -1, 1)
  池.events = Array.isArray(池.events) ? 池.events : []
  池.结 = Array.isArray(池.结) ? 池.结.filter((c) => c && 轴们.includes(c.轴) && Number.isFinite(Number(c.值))) : []
  if (Array.isArray(池.刺)) {
    // 旧键迁移：只搬一次，搬完删旧键
    池.结 = 池.结.concat(池.刺.filter((c) => c && 轴们.includes(c.轴) && Number.isFinite(Number(c.值))))
  }
  delete 池.刺
  池.stats = { selfreport_total: 0, missed_total: 0, ...(池.stats || {}) }
  池.rev = Math.max(0, Math.trunc(Number(池.rev) || 0))
  池.prev_cell = 规整格(池.prev_cell)
  池.last_decay = /^\d{4}-\d{2}-\d{2}$/.test(String(池.last_decay || '')) ? 池.last_decay : 日期()
  池.last_sums = 池.last_sums && typeof 池.last_sums === 'object' ? 池.last_sums : null
  // v0.6：快照/溢出/速率/峰值/六头/零点容错；旧 overflow 数字迁移成 {v,t}
  池.快照启用 = 池.快照启用 === true
  池.现值快照 = 池.现值快照 && typeof 池.现值快照 === 'object' ? 池.现值快照 : {}
  for (const k of 轴们) {
    const s0 = 池.现值快照[k]
    池.现值快照[k] = s0 && typeof s0 === 'object'
      ? { x: 夹(s0.x, -2, 2), t: Number.isFinite(Date.parse(String(s0.t))) ? s0.t : 现在(), τ: Math.max(0.5, Number(s0.τ) || 12) }
      : { x: 0, t: 现在(), τ: 12 }
  }
  池.会话快照 = 池.会话快照 && typeof 池.会话快照 === 'object' ? 池.会话快照 : {}
  池.溢出 = 池.溢出 && typeof 池.溢出 === 'object' ? 池.溢出 : {}
  for (const k of 轴们) {
    const o = 池.溢出[k]
    if (o && typeof o === 'object') 池.溢出[k] = { v: Math.max(0, Number(o.v) || 0), t: Number.isFinite(Date.parse(String(o.t))) ? o.t : 现在() }
    else 池.溢出[k] = { v: Math.max(0, Number(o) || 0), t: 现在() }
  }
  池.速率 = 池.速率 && typeof 池.速率 === 'object' ? 池.速率 : {}
  池.峰值桶 = 池.峰值桶 && typeof 池.峰值桶 === 'object' ? 池.峰值桶 : {}
  池.六头 = 池.六头 && typeof 池.六头 === 'object' ? 池.六头 : {}
  池.零点 = { E: 0, S: 0, P: 0, ...(池.零点 || {}) }
  for (const k of 轴们) 池.零点[k] = 夹(池.零点[k], -0.2, 0.2)
  // v0.27：零点/六头按组各一份；未归组事件不参与、只计数
  if (!池.组零点 || typeof 池.组零点 !== 'object') 池.组零点 = {}
  if (!池.组六头 || typeof 池.组六头 !== 'object') 池.组六头 = {}
  if (!Number.isFinite(Number(池.未归组))) 池.未归组 = 0
  try {
    const 组s = 组名单(读配置())
    for (const g of 组s) 组份(池, g.名)
    if (!池.零点迁移 && 组s.length) {
      const 数 = 组s.map((g) => ({ 名: g.名, n: (池.events || []).filter((e) => e && !e.merged_into && g.会话.includes(短会话(e.sid))).length }))
      数.sort((a, b) => b.n - a.n)
      const 归 = 数[0].名
      池.组零点[归] = { E: Number(池.零点.E) || 0, S: Number(池.零点.S) || 0, P: Number(池.零点.P) || 0 }
      池.组六头[归] = JSON.parse(JSON.stringify(池.六头 || {}))
      池.零点迁移 = { at: 现在(), 归组: 归, 旧零点: { E: Number(池.零点.E) || 0, S: Number(池.零点.S) || 0, P: Number(池.零点.P) || 0 } }
    }
    if (!池.六头迁移 && 组s.length) {
      const 旧总 = {}
      for (const 名 of Object.keys(池.组六头)) {
        const 组头 = 池.组六头[名] && typeof 池.组六头[名] === 'object' ? 池.组六头[名] : {}
        for (const 头 of Object.keys(组头)) {
          const v = 组头[头] && typeof 组头[头] === 'object' ? 组头[头] : {}
          const 桶 = Array.isArray(v.桶) ? v.桶 : []
          if (!桶.length || 桶[0].d != null) continue
          const 日 = {}
          let 和 = 0
          for (const b of 桶) {
            const n = Number(b.n) || 0
            和 += n
            const d = 日键((Number(b.h) || 0) * 3600000)
            日[d] = (日[d] || 0) + n
          }
          const 新桶 = Object.keys(日).sort().map((d) => ({ d, n: 日[d] }))
          组头[头] = { 累计: 和, 桶: 新桶, 上次z: v.上次z || null }
          旧总[名] = (旧总[名] || 0) + 和
        }
        池.组六头[名] = 组头
      }
      池.六头迁移 = { at: 现在(), 旧总 }
    }
  } catch { /* 配置读不到就先不初始化 */ }

  // v0.25d：旧池没有推轴计数；已有会话快照的会话按「推过」记一次（新池从 0 开始）
  if (!池.推轴次数 || typeof 池.推轴次数 !== 'object') 池.推轴次数 = {}
  if (池.会话快照 && typeof 池.会话快照 === 'object') {
    for (const 短 of Object.keys(池.会话快照)) {
      if (池.推轴次数[短] == null) 池.推轴次数[短] = 1
    }
  }
  // S 轴经验表：按短会话分账
  if (!池.S经验 || typeof 池.S经验 !== 'object') 池.S经验 = {}
  for (const [短, 表] of Object.entries(池.S经验)) {
    if (!表 || typeof 表 !== 'object') { 池.S经验[短] = {}; continue }
    for (const [题, 条] of Object.entries(表)) {
      if (!条 || typeof 条 !== 'object') delete 表[题]
    }
  }
  // v0.2.3：旧账按错规则攒的，一次性重置 s/a 为 1/1（旧事件留池）
  if (!池.P敏感迁移) {
    池.p_state = { 爽: { s: 1, a: 1, 最近: null }, 痛: { s: 1, a: 1, 最近: null } }
    池.P敏感迁移 = { at: 现在() }
  }
  // §26：p_state 容错补齐（旧池没有这个字段）
  const 旧敏 = 池.p_state && typeof 池.p_state === 'object' ? 池.p_state : {}
  池.p_state = {}
  for (const 类 of ['爽', '痛']) {
    const x = 旧敏[类] && typeof 旧敏[类] === 'object' ? 旧敏[类] : {}
    池.p_state[类] = {
      s: 夹(x.s == null ? 1 : Number(x.s), 1, 1.5),
      a: 夹(x.a == null ? 1 : Number(x.a), 0.75, 1.5),
      最近: x.最近 && Number.isFinite(Date.parse(x.最近)) ? new Date(Date.parse(x.最近)).toISOString() : null,
      计入: x.计入 && Number.isFinite(Date.parse(x.计入)) ? new Date(Date.parse(x.计入)).toISOString() : null,
    }
  }
  // v0.17：streak / 结窗按短会话分；旧结构挂 __旧，等读池迁移
  池.streak = 规整会话表(池.streak, 'streak')
  池.结窗 = 规整会话表(池.结窗, '结窗')
  // 2026-11-09 02:46：回落倍率容错（旧池从 1 起、时间取现在）
  const 旧回 = 池.回落 && typeof 池.回落 === 'object' ? 池.回落 : {}
  const 回时 = Date.parse(String(旧回.at || ''))
  池.回落 = {
    at: Number.isFinite(回时) ? new Date(回时).toISOString() : 现在(),
    倍: Number.isFinite(Number(旧回.倍)) && Number(旧回.倍) > 0 ? Math.min(1, Number(旧回.倍)) : 1,
  }
  // v0.4 R1：overflow 容错（旧池补 0，不清零）
  const 旧溢 = 池.overflow && typeof 池.overflow === 'object' ? 池.overflow : {}
  池.overflow = {}
  for (const k of 轴们) 池.overflow[k] = Number(旧溢[k]) || 0
  // v0.4 R2：事件补 merged_into 默认值（旧池不清零）
  池.events = 池.events.map((e) => (e && typeof e === 'object' ? { merged_into: null, ...e } : e))
  // v0.13：两本账；旧 K 原样留档（只回看，不参与计算）
  const 旧双 = 池.双轨 && typeof 池.双轨 === 'object' ? 池.双轨 : {}
  池.双轨 = { K: {}, 信誉: {}, 旧K: 旧双.旧K || null, 最近: null, ...旧双 }
  池.双轨.K = 池.双轨.K && typeof 池.双轨.K === 'object' ? 池.双轨.K : {}
  池.双轨.信誉 = 池.双轨.信誉 && typeof 池.双轨.信誉 === 'object' ? 池.双轨.信誉 : {}
  if (池.双轨.旧K == null && Object.keys(池.双轨.K).length) {
    try { 池.双轨.旧K = JSON.parse(JSON.stringify(池.双轨.K)) } catch (e) { 池.双轨.旧K = null }
  }
  return 池
}

const 分身额度路径 = join(HOME, '情绪池-分身额度.json')
// 会话尾号：池里一律按短 id 存（session-c4b92d68-… → c4b92d68），和 写入者/卡片/取K 对齐
function 短会话(id) {
  return String(id || '').replace(/^session-/, '').slice(0, 8)
}

export function 读分身额度() {
  try {
    const o = JSON.parse(readFileSync(分身额度路径, 'utf8'))
    return {
      批: Math.max(1, Math.trunc(Number(o.批) || 1)),
      已用: Math.max(0, Math.trunc(Number(o.已用) || 0)),
      本批上限: Math.max(1, Math.trunc(Number(o.本批上限) || 300)),
      累计: Math.max(0, Math.trunc(Number(o.累计) || 0)),
    }
  } catch {
    return { 批: 1, 已用: 0, 本批上限: 300, 累计: 0 }
  }
}

// 取一次额度；一批满 300 自动开下一批（不设总上限）。
export function 用分身额度() {
  const o = 读分身额度()
  if (o.已用 >= o.本批上限) { o.批 += 1; o.已用 = 0 }
  o.已用 += 1
  o.累计 += 1
  try {
    const tmp = 分身额度路径 + '.tmp'
    writeFileSync(tmp, JSON.stringify(o, null, 2), 'utf8')
    renameSync(tmp, 分身额度路径)
  } catch {}
  return o
}

// v0.17：旧轴结构只在读入阶段归到 写入者[0]，一次性，不占写路径
function 迁移旧窗表(池, 有旧结键 = false) {
  let 变 = !!有旧结键
  const 配置 = 读配置()
  const 写 = String((配置.写入者 || [])[0] || '') || '未知'
  const 短 = 短会话(写)
  for (const 名 of ['streak', '结窗']) {
    const t = 池[名]
    if (t && t.__旧) {
      池[名] = { [短]: t.__旧 }
      变 = true
      try { 写日志(配置, '[' + 时分() + '] 旧' + 名 + '已归到 ' + 短 + '，原结构已删') } catch (e) { /* ignore */ }
    }
  }
  if (变) { try { 写池(池) } catch (e) { /* ignore */ } }
}

export function 分片概况(目录 = 分片.会话目录) {
  try {
    if (!existsSync(目录)) return { 会话数: 0, 总表大小: 0, 最近写: null }
    const 文件们 = readdirSync(目录).filter((f) => f.endsWith('.json'))
    let 总表大小 = 0
    let 最近 = 0
    try {
      const 总 = statSync(分片.总表路径)
      总表大小 = 总.size
      if (总.mtimeMs > 最近) 最近 = 总.mtimeMs
    } catch {}
    for (const f of 文件们) {
      const st = statSync(join(目录, f))
      if (f === '总.json') 总表大小 = st.size
      if (st.mtimeMs > 最近) 最近 = st.mtimeMs
    }
    return {
      会话数: 文件们.filter((f) => f !== '总.json').length,
      总表大小,
      最近写: 最近 ? new Date(最近).toISOString() : null,
    }
  } catch { return { 会话数: 0, 总表大小: 0, 最近写: null } }
}

export function 读池() {
  if (当前池.名) {
    try { return 池视图(读配置(), 当前池.名) } catch (e) { return 空池() }
  }
  try {
    const 模 = 读配置().存储模式 === '分片'
    const 原 = 模 ? 分片.合池() : JSON.parse(readFileSync(POOL_PATH, 'utf8'))
    const 有旧结键 = Array.isArray(原 && 原.刺)
    const 池 = 规整池(原)
  try { 迁移会话快照(池, 读配置()) } catch {}
    try { 迁移旧窗表(池, 有旧结键) } catch (e) { /* 迁移失败不影响读 */ }
    return 池
  } catch (e) {
    if (e && e.code === 'ENOENT') return 空池()
    // 坏了：留一份现场，再从空池起（别静默覆盖）
    try {
      renameSync(POOL_PATH, POOL_PATH + '.corrupt-' + Date.now())
    } catch {}
    return 空池()
  }
}



// ── 0.2.5 池层 ────────────────────────────────────────────────
const 池目录 = join(HOME, '情绪池', '池')
const 当前池 = { 名: '' }
function 池文件(名) { return join(池目录, String(名) + '.json') }
// 2026-11-16 17:2x（第 11 项补）：配置里没有某个池、但 池\<名>.json 还在，是「删了一半」。
// 读它用；读不出来当没有（损坏文件不挡新建）。
function 读既有池文件(名) {
  try {
    if (!existsSync(池文件(名))) return null
    const p = JSON.parse(readFileSync(池文件(名), 'utf8'))
    return p && typeof p === 'object' && !Array.isArray(p) ? p : null
  } catch (e) {
    return null
  }
}
export function 已迁移到池() {
  try { const 总 = 分片.读总表(); return !!(总 && 总.已迁移到池) } catch (e) { return false }
}
export function 池列表(配置) {
  return 组名单(配置 || 读配置()).map((g) => ({ 名: g.名, 会话: g.会话.slice() }))
}
export function 池名(配置, sid) {
  const s = 短会话(sid)
  const 中 = 池列表(配置).find((p2) => p2.会话.some((x) => 短会话(x) === s))
  return 中 ? 中.名 : ''
}
function 合池事件(配置, 名) {
  const 中 = 池列表(配置).find((p2) => p2.名 === 名)
  if (!中) return []
  const 列 = []
  for (const sid of 中.会话) {
    try { const 本 = 分片.读会话(短会话(sid)); if (本 && Array.isArray(本.事件)) 列.push(...本.事件) } catch {}
  }
  return 列.filter((e) => e && e.t).sort((a, b) => Date.parse(a.t) - Date.parse(b.t))
}
export function 池启用(名) {
  if (!名) return false
  if (已迁移到池()) return true
  try { return existsSync(池文件(名)) } catch (e) { return false }
}
export function 池视图(配置, 名) {
  if (!名) return 空池()
  let 原 = null
  try { 原 = JSON.parse(readFileSync(池文件(名), 'utf8')) } catch (e) { if (!e || e.code !== 'ENOENT') throw e }
  const 池 = 规整池(原 || {})
  池.池名 = 名
  池.events = 合池事件(配置, 名)
  return 池
}
export function 用池(名, fn) {
  const 旧 = 当前池.名
  当前池.名 = String(名 || '')
  try { return fn() } finally { 当前池.名 = 旧 }
}

const 订阅者 = new Set()
function 广播rev(rev) {
  for (const r of 订阅者) {
    try { r.write('data: ' + JSON.stringify({ rev }) + '\n\n') } catch (e) { 订阅者.delete(r) }
  }
}

function 写池(池, 选项 = {}) {
  const 名 = 当前池.名 || 池.池名 || ''
  const 允许清空 = 选项.允许清空 === true || (池 && 池._允许清空 === true)
  if (名) {
    mkdirSync(池目录, { recursive: true })
    // 事件仍按会话存：把视图里的本池事件按 sid 拆回分片
    const 拦截 = []
    try {
      const 中 = 池列表(读配置()).find((p2) => p2.名 === 名)
      for (const sid of (中 ? 中.会话 : [])) {
        const 短 = 短会话(sid)
        const 本 = 分片.读会话(短) || {}
        const 旧事 = Array.isArray(本.事件) ? 本.事件 : []
        const 事 = (Array.isArray(池.events) ? 池.events : []).filter((e) => e && 同会话(e.sid, sid))
        // 防呆（2026-11-16 15:26 写丢 48 条的教训）：分片事件只许新增或原地更新，不许变少。
        // 只有「清零 / 归档 / 超限修剪」这类显式维护动作才带 允许清空，且照样记日志。
        if (事.length < 旧事.length && !允许清空) {
          拦截.push(`${短} ${旧事.length}→${事.length}`)
          continue
        }
        if (JSON.stringify(事) !== JSON.stringify(旧事)) {
          分片.写会话(短, { ...本, 事件: 事, rev: Number(池.rev) || 本.rev })
        }
      }
    } catch (e) { /* 分片写失败不挡池文件 */ }
    if (拦截.length) {
      const 文 = 拦截.join('、')
      try { 写日志(读配置(), `[${时分()}] 写池拦截 ｜ 池「${名}」分片事件会变少，已拒写：${文}`) } catch {}
      throw new Error(`写池拦截：池「${名}」分片事件会变少 ｜ ${文}`)
    }
    const 存 = { ...池 }
    delete 存.events
    delete 存.池名
    delete 存._允许清空
    if (池 && 池._允许清空) delete 池._允许清空
    存.updated = 存.updated || 现在()
    const tmp = 池文件(名) + '.tmp'
    writeFileSync(tmp, JSON.stringify(存, null, 2) + '\n', 'utf8')
    renameSync(tmp, 池文件(名))
    try { 写说明书(池) } catch {}
    try { 广播rev(池.rev) } catch {}
    return
  }
  if (读配置().存储模式 === '分片') {
    const 拆 = 分片.拆池(池)
    const 拦截 = []
    for (const [短, 本] of Object.entries(拆.本表)) {
      const 旧 = 分片.读会话(短)
      const 旧事 = 旧 && Array.isArray(旧.事件) ? 旧.事件 : []
      if ((本.事件 || []).length < 旧事.length && !允许清空) { 拦截.push(`${短} ${旧事.length}→${(本.事件 || []).length}`); continue }
      const 旧文 = 旧 ? JSON.stringify([旧.事件, 旧.结, 旧.快照, 旧.rev]) : ''
      const 新文 = JSON.stringify([本.事件, 本.结, 本.快照, 本.rev])
      if (旧文 !== 新文) 分片.写会话(短, 本)
    }
    if (拦截.length) {
      const 文 = 拦截.join('、')
      try { 写日志(读配置(), `[${时分()}] 写池拦截 ｜ 分片事件会变少，已拒写：${文}`) } catch {}
      throw new Error(`写池拦截：分片事件会变少 ｜ ${文}`)
    }
    分片.写总表(拆.总表)
    写说明书(池)
    try { 广播rev(池.rev) } catch (e) { /* ignore */ }
    return
  }
  mkdirSync(HOME, { recursive: true })
  const tmp = POOL_PATH + '.tmp'
  writeFileSync(tmp, JSON.stringify(池, null, 2) + '\n', 'utf8')
  renameSync(tmp, POOL_PATH)
  写说明书(池)
  try { 广播rev(池.rev) } catch (e) { /* ignore */ }
}

// 单写者互斥：拿不到锁就跳过写（宁可漏这一条，也不写坏）
function 拿锁() {
  mkdirSync(HOME, { recursive: true })
  for (let i = 0; i < 200; i += 1) {
    try {
      const fd = openSync(LOCK_PATH, 'wx')
      closeSync(fd)
      return true
    } catch (e) {
      if (!e || e.code !== 'EEXIST') return false
      try {
        if (Date.now() - statSync(LOCK_PATH).mtimeMs > 30000) {
          unlinkSync(LOCK_PATH)
          continue
        }
      } catch {}
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25)
    }
  }
  return false
}

function 带锁(fn) {
  if (!拿锁()) throw new Error('情绪池被锁住，等不到锁')
  try {
    return fn()
  } finally {
    try {
      unlinkSync(LOCK_PATH)
    } catch {}
  }
}

// ── 自报解析 ───────────────────────────────────────────────────────────
// 不用一条大正则（注记/刺/@档名 之间会互相吞），按 | 分段逐段认。

// ── 情绪模板 B 段：情绪模板.json + 判定 ─────────────────────────────
const 模板路径 = join(HOME, '情绪模板.json')

export function 空模板() {
  return { version: 1, 模板: [], 候选: [] }
}

export function 读模板() {
  try {
    const o = JSON.parse(readFileSync(模板路径, 'utf8'))
    if (!o || typeof o !== 'object' || !Array.isArray(o.模板)) throw new Error('shape')
    if (!Array.isArray(o.候选)) o.候选 = []
    o.version = Number(o.version) || 1
    return o
  } catch (e) {
    if (e && e.code === 'ENOENT') return 空模板()
    try { renameSync(模板路径, 模板路径 + '.bad-' + Date.now()) } catch {}
    return 空模板()
  }
}

export function 写模板(o) {
  const 体 = JSON.stringify(o, null, 2)
  const tmp = 模板路径 + '.tmp'
  writeFileSync(tmp, 体, 'utf8')
  renameSync(tmp, 模板路径)
}

function 找模板(o, 名) { return (o.模板 || []).find((t) => String(t.名) === String(名)) || null }

function 裁候选(o) {
  const 列 = (o.候选 || []).slice().sort((a, b) => String(b.最近 || b.建 || '').localeCompare(String(a.最近 || a.建 || '')))
  o.候选 = 列.slice(0, 50)
}

function 加候选(o, 名, 签, 点们, 额 = {}) {
  const 名称 = String(名 || '').trim().slice(0, 24)
  if (!名称) return false
  if (找模板(o, 名称)) return false
  if ((o.候选 || []).some((x) => String(x.名) === 名称)) return false
  const 点 = Array.isArray(点们) ? 点们.slice(-30).map((p) => ({ t: p.t, E: Number(p.E) || 0, S: Number(p.S) || 0, P: Number(p.P) || 0 })) : []
  o.候选.push(Object.assign({ 名: 名称, 建: 现在(), 最近: 现在(), 源: '自报', 次数: 1, 签名: 签, 点 }, 额 || {}))
  裁候选(o)
  return true
}

async function 读JSON体(req) {
  try {
    let s0 = ''
    for await (const c of req) s0 += c
    return JSON.parse(s0 || '{}')
  } catch { return null }
}

function 会话可写(体, 配) {
  const 会 = String((体 && 体.会话) || '').trim()
  if (!会) return true
  return (配.写入者 || []).some((w) => 同会话(w, 会))
}

function 重名(o, 名) {
  return !!找模板(o, 名) || (o.候选 || []).some((x) => String(x.名) === String(名))
}

function 存最近(定名) {
  try { 带锁(() => { const 池 = 读池(); 池.模板最近 = 定名; 写池(池) }) } catch {}
}

function 记事件定名(sid, turn, 定名) {
  try {
    带锁(() => {
      const 池 = 读池()
      const 列 = 池.events || []
      for (let i = 列.length - 1; i >= 0; i--) {
        const e = 列[i]
        if (e && String(e.sid) === String(sid) && String(e.turn) === String(turn)) { e.定名 = 定名; break }
      }
      池.模板最近 = 定名
      写池(池)
    })
  } catch {}
}

// 对最近一段波动做判定并落模板；返回定名对象
export function 定名波动(sid, turn, 点s, 波s, 配置 = {}) {
  const 波 = Array.isArray(波s) ? 波s : []
  const 点 = Array.isArray(点s) ? 点s : []
  let 定名 = { 名: null, 分: 0, 量级差: 1, 结论: '未命中' }
  if (!波.length || 点.length < 2) {
    定名 = { 名: null, 分: 0, 量级差: 1, 结论: '未命中' }
  } else {
    const 末 = 波[波.length - 1]
    const 起 = Math.max(0, Math.min(Number(末.起) || 0, 点.length - 2))
    const 止 = Math.max(起 + 1, Math.min(Number(末.止) || 点.length - 1, 点.length - 1))
    // ① 自报精确名：用户在回复里写下的名字，只查命名表（2026-11-18 策划间定：优先级最高，不写模板文件）
    try {
      const 池0 = 读池()
      const e0 = (池0.events || []).slice().reverse().find((x) => x && String(x.sid) === String(sid) && String(x.turn) === String(turn))
      const 自报 = e0 && typeof e0.曲线 === 'string' ? e0.曲线.trim() : ''
      if (自报) {
        const 表0 = 读命名(配置)
        if ((表0.名字 || []).some((it) => String(it.名) === String(自报))) {
          定名 = { 名: 自报, 分: 1, 量级差: 0, 结论: '命中', 来源: '自报' }
        } else {
          // 2026-11-18 策划间定：自报写了名字但命名表里没有 → 定名仍为 null（不许拿它当名字），
          // 只把这个名字+形状+依据放进命名表文件的 候选[]，等主人在待命名页决定收不收。
          定名 = { 名: null, 分: 0, 量级差: 1, 结论: '未命中', 来源: '自报未登记' }
          const 候 = Array.isArray(表0.候选) ? 表0.候选.slice() : []
          if (!候.some((x) => String((x && x.名字) || '') === String(自报))) {
            const 末形 = 形状(点.slice(-8).map((x) => Number(x.E) || 0))
            候.push({
              名字: 自报,
              形状: 末形,
              依据: String((e0 && (e0.依据 || e0.注)) || '').slice(0, 200),
              元: { 类: '当下', 互斥: [] },
              来源: '自报',
              时间: 现在(),
            })
          }
          写命名({ ...表0, 候选: 候 }, 配置)
        }
      }
    } catch {}
    // ② 0.2.7 形状归属（旧 0.8 模板尺已从这条路径摘除，不再兜底）
    if (定名.来源 !== '自报' && 定名.来源 !== '自报未登记') {
      try {
        const 池 = 读池()
        const 基线 = Number(池.相似度基线)
        if (池.门槛 && 池.权重 && 点.length >= 3 && Number.isFinite(基线)) {
          const w = { 角: Number(池.权重.角) || 1 / 3, 数: Number(池.权重.数) || 1 / 3, 距: Number(池.权重.距) || 1 / 3 }
          // 2026-11-18 任务单 2210：定名改三轴——E/S/P 各末 8 点各算形状，逐轴距离取平均
          const 我形 = 三轴签名(点.slice(-8))
          const 表 = 读命名(配置)
          let 最像 = null
          for (const it of 表.名字 || []) {
            const 原 = Array.isArray(it.原型) ? it.原型 : []
            for (const 形 of 原) {
              if (!形) continue
              const d = 平均相似度(我形, 形, w)
              if (!d) continue
              const 尺 = 新尺(d.相似度, 基线)
              if (!最像 || 尺 > 最像.尺) 最像 = { 名: it.名, 尺, 相似度: d.相似度, 轴数: d.轴数, 条目: it }
            }
          }
          if (最像) {
            const 判 = 判归属(最像.尺, (最像.条目.原型 || []).length)
            定名 = {
              名: 判.层 === '待命名' ? null : 最像.名,
              分: Number(最像.尺.toFixed(4)),
              新尺: Number(最像.尺.toFixed(4)),
              相似度: Number(最像.相似度.toFixed(4)),
              结论: 判.层 === '待命名' ? '未命中' : 判.层,
              来源: '形状',
              签名: 我形,
              轴数: 最像.轴数 || null,
              提示: 判.提示 || null,
            }
            if (判.层 !== '待命名') {
              最像.条目.原型 = Array.isArray(最像.条目.原型) ? 最像.条目.原型 : []
              if (判.层 === '变体') 最像.条目.原型.push(我形)
              最像.条目.原型 = 最像.条目.原型.slice(-12)
              最像.条目.变体数 = Math.max(0, 最像.条目.原型.length - 1)
              写命名(表, 配置)
            } else {
              // 2026-11-19：<0.55 也要落待命名（带末 8 点），页面才能收录成原型
              try {
                const 末0 = 点[点.length - 1] || {}
                记待命名(Number(末0.E) || 0, Number(末0.S) || 0, Number(末0.P) || 0, '', 点.slice(-8))
              } catch (e2) {}
            }
          } else {
            // 一个原型都没有也比较不出 → 同样落待命名
            try {
              const 末1 = 点[点.length - 1] || {}
              记待命名(Number(末1.E) || 0, Number(末1.S) || 0, Number(末1.P) || 0, '', 点.slice(-8))
            } catch (e3) {}
          }
        }
      } catch (e) {
        try { 写日志(配置, '形状归属失败：' + (e && e.message)) } catch {}
      }
    }
  }
  存最近(定名)
  记事件定名(sid, turn, 定名)
  return 定名
}

export function 解析自报(文字) {
  const s = String(文字 || '')
  const 找 = [...s.matchAll(/<!--\s*EMO:([\s\S]*?)-->/g)]
  if (!找.length) return null
  const 体 = 找[找.length - 1][1]
  const 段 = 体.split('|').map((x) => x.trim())
  const 头 = (段[0] || '').trim()
  // v0.8：E+2 S-1 P0（点数，|≤9|）与旧格式 E+ S- P0（按 ±3 点）都收
  const m = /^([ESP])\s*([-+]?)(\d{0,2})\s+([ESP])\s*([-+]?)(\d{0,2})\s+([ESP])\s*([-+]?)(\d{0,2})$/.exec(头)
  if (!m || m[1] + m[4] + m[7] !== 'ESP') return { ok: false, 原因: '格式' }
  const 点数 = {}
  const 自段 = []
  let 新格式 = false
  for (const [i, k] of [[1, 'E'], [4, 'S'], [7, 'P']]) {
    const 号 = m[i + 1] || ''
    const 数 = m[i + 2]
    let 值
    if (数 === '') 值 = 号 === '+' ? 3 : 号 === '-' ? -3 : 0
    else {
      if (!(数 === '0' && 号 === '')) 新格式 = true
      值 = Number(号 + 数)
    }
    点数[k] = 夹(Math.trunc(值), -9, 9)
    自段.push(k + (点数[k] > 0 ? '+' : '') + 点数[k])
  }
  const 步 = (c) => (c === '+' ? 0.15 : c === '-' ? -0.15 : 0)
  const delta = { E: 步(m[2] || (点数.E ? '+' : '0')), S: 步(m[5] || (点数.S ? '+' : '0')), P: 步(m[8] || (点数.P ? '+' : '0')) }
  let 档名 = '最近'
  let 档名无效 = false
  // v0.8 验收：q 一律缺省 0.5/0.5（旧格式也不开后门），缺 q 要能看见
  let q1 = null
  let q2 = null
  let 见q = false
  let 分析 = ''
  let 结 = null
  let 曲线 = ''
  const 注 = []
  for (const 段一 of 段.slice(1)) {
    if (!段一) continue
    if (段一.startsWith('@')) {
      const nm = 段一.slice(1).trim()
      if (档位表.has(nm)) 档名 = nm
      else 档名无效 = true
      continue
    }
    const 曲m = /^曲线\s*[=:：]\s*(.+)$/.exec(段一)
    if (曲m) { 曲线 = 曲m[1].trim().slice(0, 24); continue }
    const 分m = /^分析\s*[:：]\s*([\s\S]*)$/.exec(段一)
    if (分m) { 分析 = 分m[1].trim().slice(0, 200); continue }
    if (/^q[12]\s*[=:：]/.test(段一)) {
      见q = true
      for (const 词 of 段一.split(/\s+/)) {
        const q1m = /^q1\s*[=:：]\s*([-+]?\d*\.?\d+)$/.exec(词)
        if (q1m) { q1 = 夹(Number(q1m[1]), 0, 1); continue }
        const q2m = /^q2\s*[=:：]\s*([-+]?\d*\.?\d+)$/.exec(词)
        if (q2m) { q2 = 夹(Number(q2m[1]), 0, 1); continue }
      }
      continue
    }
    const 刺m = /^刺\s*[:：]\s*([ESP])\s*=\s*([-+]?\d*\.?\d+)$/.exec(段一)
    if (刺m) {
      // 旧格式（只有符号）仍保留 spine 刺，兼容老行为；新格式用点数，不再收刺
      if (!新格式) { 结 = 结 || {}; 结[刺m[1]] = 夹(Number(刺m[2]), -0.2, 0.2) }
      continue
    }
    注.push(段一)
  }
  return {
    ok: true,
    delta,
    点数,
    q1,
    q2,
    缺q: !见q,
    分析,
    曲线,
    新格式,
    档名,
    系数: 档位表.get(档名),
    注: 注.join(' | '),
    曲线,
    档名无效,
    结,
    自报: 新格式 ? 自段.join(' ') : 轴们.map((k) => k + (点数[k] > 0 ? '+' : 点数[k] < 0 ? '-' : '0')).join(' '),
  }
}

// ── 数值：单轴夹 / 27 格 ──────────────────────────────────────────────
// 2026-11-09 02:46：去守恒——不再把正面总量压回 1.0，每根轴各自夹 ±1；
// 总量可以不满、可以很低。软上限 k 与单轴夹仍保留。
export function 守恒(axes) {
  return { E: 夹(axes.E, -1, 1), S: 夹(axes.S, -1, 1), P: 夹(axes.P, -1, 1) }
}

function 规整格(cell) {
  const m = /^E([+\-0])S([+\-0])P([+\-0])$/.exec(String(cell || ''))
  return m ? `E${m[1]}S${m[2]}P${m[3]}` : 'E0S0P0'
}

function 拆格(cell) {
  const c = 规整格(cell)
  return { E: c[1], S: c[3], P: c[5] }
}

// 档位有状态：从当前档 + 新值判下一档；跨号必须先回 0（§6.1）
export function 下一档(旧档, v) {
  if (旧档 === '0') return v >= 0.07 ? '+' : v <= -0.07 ? '-' : '0'
  if (旧档 === '+') return v < 0.05 ? '0' : '+'
  return v > -0.05 ? '0' : '-'
}

export function 算格(旧格, axes) {
  const 旧 = 拆格(旧格)
  return 'E' + 下一档(旧.E, axes.E) + 'S' + 下一档(旧.S, axes.S) + 'P' + 下一档(旧.P, axes.P)
}

// ── 日志 ───────────────────────────────────────────────────────────────
function 日志路径(配置, i) {
  const arr = Array.isArray(配置.日志) ? 配置.日志 : []
  const 名 = arr[i] || (i ? '情绪池-日志.jsonl' : '情绪池-日志.md')
  return join(HOME, 名)
}

function 写日志(配置, line) {
  try {
    mkdirSync(HOME, { recursive: true })
    const p = 日志路径(配置, 0)
    const 先 = existsSync(p) && statSync(p).size > 0 ? '' : '# 情绪池日志\n\n（一行一条；v1 只记录，不注入）\n\n'
    appendFileSync(p, 先 + line + '\n', 'utf8')
  } catch {}
}

function 写记录(配置, obj) {
  try {
    mkdirSync(HOME, { recursive: true })
    const p = 日志路径(配置, 1)
    appendFileSync(p, JSON.stringify(obj) + '\n', 'utf8')
  } catch {}
}

function 值串(axes) {
  const f = (v) => (Math.abs(v) < 0.0005 ? '0.00' : `${v > 0 ? '+' : ''}${v.toFixed(2)}`)
  return `E${f(axes.E)} S${f(axes.S)} P${f(axes.P)}`
}

// ── 写一条自报 ─────────────────────────────────────────────────────────
function 同会话(a, b) {
  const 净 = (x) => String(x || '').replace(/^session-/, '')
  const x = 净(a)
  const y = 净(b)
  if (!x || !y) return false
  // 配置里写短 id（c4b92d68）、事件给完整 id（c4b92d68-f40c-…）都算同一间——
  // 两个方向都认，否则「拿短号去筛全长 sid 的事件」会一条都筛不到（2026-11-16 写丢 48 条的根因）
  return x === y || y.startsWith(x + '-') || x.startsWith(y + '-')
}

// §23（2026-11-08 22:1x 定「纯派生」）：轴值从事件现算——不做每日衰减、写入时也不乘系数。
// axes[轴] = (Σ delta_raw[轴] × 年龄系数(t)) × 回落倍 + spine[轴]；spine 不参与打折。
// 2026-11-09 02:46：去守恒（单轴夹 ±1），加「每 6 小时无事件、各轴向 0 靠 2%」的回落。
export function 回落倍(池, now = Date.now()) {
  const 基 = Date.parse(String((池 && 池.回落 && 池.回落.at) || ''))
  const 存 = Number(池 && 池.回落 && 池.回落.倍)
  const 起 = Number.isFinite(基) ? 基 : now
  const 段 = Math.max(0, Math.floor((now - 起) / (6 * 3600 * 1000)))
  return { 段, 倍: (Number.isFinite(存) && 存 > 0 ? 存 : 1) * Math.pow(0.98, 段), 龄小时: Math.max(0, (now - 起) / 3600000) }
}

export function 组名单(配置) {
  const a = 配置 && Array.isArray(配置.组) ? 配置.组 : []
  const out = []
  const 用 = new Set()
  for (const g of a) {
    if (!g || typeof g !== 'object') continue
    const 名 = String(g.名 || '').slice(0, 20) || ('组' + (out.length + 1))
    const 内 = new Set()
    const 会话 = (Array.isArray(g.会话) ? g.会话 : []).map((x) => 短会话(x)).filter((x) => {
      if (!/^[a-z0-9]{8}$/.test(x) || 用.has(x) || 内.has(x)) return false
      内.add(x)
      return true
    })
    // 2026-11-16（卡片前端第 11 项）：空池不跳过——新建的空池也要能在页签里看到
    for (const x of 会话) 用.add(x)
    out.push({ 名, 会话 })
  }
  return out
}

export function 全部池(配置) {
  const a = 配置 && Array.isArray(配置.组) ? 配置.组 : []
  const 见 = new Set()
  const out = []
  for (const g of a) {
    if (!g || typeof g !== 'object') continue
    const 名 = String(g.名 || '').slice(0, 20)
    if (!名 || 见.has(名)) continue
    见.add(名)
    const 会话 = [...new Set((Array.isArray(g.会话) ? g.会话 : []).map(短会话).filter((x) => /^[a-z0-9]{8}$/.test(x)))]
    out.push({ 名, 会话 })
  }
  return out
}

export function 组归名(sid, 配置) {
  const 短 = 短会话(sid)
  for (const g of 组名单(配置 || 读配置())) if (g.会话.includes(短)) return g.名
  return null
}

// 2026-11-16 18:5x（策划间：缓存键必须含 pool）：/state 的 2 秒整体缓存键。
// 原来只带 rev|当前池名|装载|mtime；默认池与 ?pool=<名> 在同 2 秒内先后请求时，
// 若池名相同（例如 ?pool= 指到默认池）就会共用一份响应体。把 询池 显式拼进来，
// 抽成纯函数便于测试：同 rev/装载/mtime 下，不同池必须得到不同键。
export function 状态键(rev, 当前池名, 装载, 配置mtime, 询池) {
  return [String(rev || 0), String(当前池名 || ''), 'pool:' + String(询池 || ''), JSON.stringify(装载 || []), String(配置mtime || 0)].join('|')
}

export function 组份(池, 名) {
  if (!池.组零点 || typeof 池.组零点 !== 'object') 池.组零点 = {}
  if (!池.组六头 || typeof 池.组六头 !== 'object') 池.组六头 = {}
  if (!池.组零点[名] || typeof 池.组零点[名] !== 'object') 池.组零点[名] = { E: 0, S: 0, P: 0 }
  if (!池.组六头[名] || typeof 池.组六头[名] !== 'object') 池.组六头[名] = {}
  return { 六头: 池.组六头[名], 零点: 池.组零点[名] }
}

export function 装载名单(配置) {
  const 组 = 组名单(配置)
  if (组.some((g) => g.会话.length)) {
    const 名 = []
    for (const g of 组) for (const x of g.会话) if (!名.includes(x)) 名.push(x)
    return 名
  }
  const a = 配置 && 配置.装载会话
  return (Array.isArray(a) ? a : []).filter((x) => /^[a-z0-9]{8}$/.test(String(x)))
}

export function 装载来源(配置) {
  if (组名单(配置).some((g) => g.会话.length)) return '组'
  return 装载名单(配置).length ? '装载会话' : '全部'
}

export function 允许装载(配置, sid) {
  const 组 = 组名单(配置).filter((g) => g.会话.length)
  if (组.length) return 组.some((g) => g.会话.includes(短会话(sid)))
  const 名 = 装载名单(配置)
  return 名.length === 0 || 名.includes(短会话(sid))
}

// 2026-11-16（卡片前端第 1 项）：未推时组卡显示真值，卡头写清沿用的是什么
export function 组来源(名) {
  try {
    const p = JSON.parse(readFileSync(池文件(名), 'utf8'))
    if (p && p.快照启用 === true) {
      if (p.会话快照 && Object.keys(p.会话快照).length) return '快照'
      const t = Date.parse(String((p.当前快照 && p.当前快照.t) || ''))
      if (Number.isFinite(t) && Date.now() - t <= 6 * 3600e3) return '快照'
    }
    if (p && p.axes && Object.values(p.axes).some((v) => Math.abs(Number(v) || 0) > 0.0001)) return 'axes'
  } catch (e) { /* 池文件不在就按快照说 */ }
  return '快照'
}

export function 组现值(池, 组) {
  const now = Date.now()
  const 合 = { E: 0, S: 0, P: 0 }
  if (池 && 池.快照启用 === true && 池.会话快照) {
    for (const sid of (组 && 组.会话) || []) {
      const 轴快照 = 池.会话快照[sid]
      if (!轴快照 || typeof 轴快照 !== 'object') continue
      for (const k of 轴们) {
        const s0 = 轴快照[k]
        if (!s0) continue
        const t0 = Date.parse(String(s0.t))
        const { T } = 水位(池, k, Number(s0.x) || 0, now)
        合[k] += 推进(Number(s0.x) || 0, T, Math.max(0.5, Number(s0.τ) || 12), Number.isFinite(t0) ? now - t0 : 0)
      }
    }
  }
  const 份 = 组份(池, (组 && 组.名) || '')
  const 轴 = {}
  for (const k of 轴们) 轴[k] = 显示值(合[k], 份.零点[k])
  return { 合, 轴, 零点: { ...份.零点 }, 六头: 六头计(份) }
}

// 2026-11-16 17:3x（策划间定）：新池建出来就写一份空池文件——axes 0/0/0、spine {}、
// 当前快照=创建时刻、快照启用=false、带 迁移 标记。这样现值走 axes 分支（0/0/0「无数据」），
// 不许走重放：重放会按历史 delta 累加撞顶（新池本来就没历史，别凭空造一个）。
function 初始化新池文件(名) {
  const now = new Date().toISOString()
  const 池 = {
    axes: { E: 0, S: 0, P: 0 },
    spine: {},
    当前快照: Object.fromEntries(轴们.map((k) => [k, { x: 0, t: now, τ: 12 }])),
    快照启用: false,
    迁移: { 版本: '0.2.5', 新池: true, 时间: now },
    rev: 1,
    updated: now,
  }
  try {
    mkdirSync(池目录, { recursive: true })
    writeFileSync(池文件(名), JSON.stringify(池, null, 2), 'utf8')
    return true
  } catch (e) {
    写日志(读配置(), '新池初始化失败 ' + 名 + '：' + (e && e.message ? e.message : e))
    return false
  }
}

export function 写组(名单) {
  let 原
  try { 原 = 读原配置() } catch (e) { return { ok: false, 错误: '配置文件读不出来：' + String((e && e.message) || e), 码: 500 } }
  if (!Array.isArray(名单)) return { ok: false, 错误: '组必须是数组', 码: 400 }
  const 净 = []
  for (const g of 名单) {
    if (!g || typeof g !== 'object') continue
    const 名 = String(g.名 || '').slice(0, 20)
    const 会话 = [...new Set((Array.isArray(g.会话) ? g.会话 : []).map((x) => 短会话(x)).filter((x) => /^[a-z0-9]{8}$/.test(x)))]
    if (名) 净.push({ 名, 会话 })
  }
  原.组 = 净
  try { writeFileSync(CONFIG_PATH, JSON.stringify(原, null, 2), 'utf8') } catch (e) { return { ok: false, 错误: '写配置失败：' + String((e && e.message) || e), 码: 500 } }
  return { ok: true, 组: 净 }
}

export const 池名规则 = /^[\u4e00-\u9fa5A-Za-z0-9 _-]{1,20}$/
export function 池名合法(名) {
  const t = String(名 == null ? '' : 名).trim()
  return 池名规则.test(t) && !/[\\/:*?"<>|]/.test(t)
}
export function 池操作(操作, a, b) {
  const 配置 = 读配置()
  const 名单 = 组名单(配置).map((g) => ({ 名: g.名, 会话: g.会话.slice() }))
  const 找 = (名) => 名单.find((g) => g.名 === String(名 == null ? '' : 名).trim())
  if (操作 === '新建' || 操作 === '改名') {
    const 新 = String(b == null ? '' : b).trim()
    if (!池名合法(新)) return { ok: false, 错误: '池名要 1–20 个字，不能有 \\ / : * ? " < > |', 码: 400 }
    if (操作 === '新建') {
      if (找(新)) return { ok: false, 错误: '已经有这个池了', 码: 400 }
      // 2026-11-16 17:2x（第 11 项补）：配置里没有、池文件却在——恢复文件里的会话，不覆盖、不拒绝。
      const 旧文 = 读既有池文件(新)
      if (旧文) {
        const 旧会话 = [...new Set((Array.isArray(旧文.会话) ? 旧文.会话 : []).map(短会话).filter((x) => /^[a-z0-9]{8}$/.test(x)))]
        名单.push({ 名: 新, 会话: 旧会话 })
        const r = 写组(名单)
        return r.ok ? { ...r, 恢复: true, 会话: 旧会话.length } : r
      }
      名单.push({ 名: 新, 会话: [] })
      初始化新池文件(新)
    } else {
      const 旧 = 找(a)
      if (!旧) return { ok: false, 错误: '没有这个池', 码: 404 }
      if (新 !== 旧.名 && 找(新)) return { ok: false, 错误: '已经有这个池了', 码: 400 }
      旧.名 = 新
    }
    return 写组(名单)
  }
  if (操作 === '删除') {
    const 旧 = 找(a)
    if (!旧) return { ok: false, 错误: '没有这个池', 码: 404 }
    // 2026-11-16 17:2x（第 11 项补）：b 传「连文件」才删池文件；默认只从列表移除（文件留着，以后新建同名可恢复）。
    const 连文件 = b === true || b === '连文件' || b === 'file'
    const r = 写组(名单.filter((g) => g.名 !== 旧.名))
    if (!r.ok) return r
    let 文件已删 = false
    if (连文件) {
      try {
        if (existsSync(池文件(旧.名))) {
          unlinkSync(池文件(旧.名))
          文件已删 = true
        }
      } catch (e) {
        写日志(读配置(), '删池文件失败 ' + 旧.名 + '：' + (e && e.message ? e.message : e))
      }
    }
    return { ...r, 连文件, 文件已删, 文件还在: !文件已删 && existsSync(池文件(旧.名)) }
  }
  if (操作 === '装') {
    const 旧 = 找(a)
    if (!旧) return { ok: false, 错误: '没有这个池', 码: 404 }
    const 列 = [...new Set((Array.isArray(b) ? b : []).map(短会话).filter((x) => /^[a-z0-9]{8}$/.test(x)))]
    for (const sid of 列) {
      for (const g of 名单) g.会话 = g.会话.filter((x) => x !== sid)
      旧.会话.push(sid)
    }
    return 写组(名单)
  }
  if (操作 === '卸') {
    const 旧 = 找(a)
    if (!旧) return { ok: false, 错误: '没有这个池', 码: 404 }
    旧.会话 = 旧.会话.filter((x) => !(Array.isArray(b) ? b : []).map(短会话).includes(x))
    return 写组(名单)
  }
  return { ok: false, 错误: '未知操作', 码: 400 }
}

export function 改会话组(会话, 组名) {
  const sid = 短会话(会话)
  if (!/^[a-z0-9]{8}$/.test(sid)) return { ok: false, 错误: '会话必须是 8 位短尾号', 码: 400 }
  const 配置 = 读配置()
  const 名单 = 组名单(配置).map((g) => ({ 名: g.名, 会话: g.会话.filter((x) => x !== sid) }))
  const 名 = String(组名 == null ? '' : 组名).trim()
  if (名) {
    const 找 = 名单.find((g) => g.名 === 名)
    if (找) 找.会话.push(sid)
    else 名单.push({ 名: 名, 会话: [sid] })
  }
  return 写组(名单)
}

// 2026-11-16 17:0x（卡片前端第 10/12 项）：会话清单要覆盖「所有分片」+「配置里已绑池的会话」，
// 不能只看当前池的 events——否则未归池/别池的会话在设置页里根本选不到，卸下来也再勾不回去。
export function 会话选项() {
  const 限 = Date.now() - 30 * 86400000
  const 表 = {}
  const 备 = (sid) => {
    const 短 = 短会话(sid)
    if (!/^[a-z0-9]{8}$/.test(短)) return null
    return 表[短] || (表[短] = { 值: 短, 名: 短, 事件数: 0, 最近: '' })
  }
  let 源 = []
  try { 源 = Object.values(分片.读全部() || {}) } catch { 源 = [] }
  if (!源.length) {
    try { 源 = [读池()] } catch { 源 = [] }
  }
  for (const b of 源) {
    for (const e of ((b && b.事件) || (b && b.events) || [])) {
      if (!e || !e.t) continue
      const t = Date.parse(String(e.t))
      if (!Number.isFinite(t) || t < 限) continue
      const 项 = 备(e.sid)
      if (!项) continue
      项.事件数 += 1
      if (!项.最近 || String(e.t) > 项.最近) 项.最近 = String(e.t)
    }
  }
  // 配置里绑进池的会话即使 30 天没事件也要列出来，不然「取消勾选后勾不回来」
  let 配 = null
  let 组 = []
  try { 配 = 读配置(); 组 = 组名单(配) } catch { 配 = null; 组 = [] }
  const 名表 = (配 && 配.会话名 && typeof 配.会话名 === 'object') ? 配.会话名 : {}
  const 池表 = {}
  for (const g of 组) for (const x of g.会话) 池表[x] = g.名
  for (const x of Object.keys(池表)) 备(x)
  return Object.values(表).map((x) => ({ ...x, 名: 名表[x.值] || x.值, 池: 池表[x.值] || null }))
    .sort((a, b) => b.事件数 - a.事件数 || String(b.最近).localeCompare(String(a.最近)))
}

export function 迁移会话快照(池, 配置) {
  if (!池 || 池.快照启用 !== true) return false
  if (池.会话快照 && Object.keys(池.会话快照).length) return false
  const 主 = (配置 && 配置.写入者 && 配置.写入者[0]) ? 短会话(配置.写入者[0]) : '__global'
  const 盒 = {}
  for (const k of 轴们) {
    const s0 = 池.现值快照 && 池.现值快照[k]
    if (s0 && typeof s0 === 'object' && (Number(s0.x) || 0) !== 0) 盒[k] = { x: 夹(s0.x, -2, 2), t: Number.isFinite(Date.parse(String(s0.t))) ? s0.t : 现在(), τ: Math.max(0.5, Number(s0.τ) || 12) }
  }
  池.会话快照 = { [主]: 盒 }
  return true
}

export function 现值(池) {
  const 配置 = 读配置()
  const 名 = 装载名单(配置)
  const 装 = (sid) => (名.length === 0 || 名.includes(sid) || sid === '__global')
  // 2026-11-16（策划间 6a169bce 定，B 案）：池文件就是池的真值，现值不自己漂。
  // 时间推进（τ 半衰）只在「推轴那一刻」参与；读 /state 时不再按时间把值往下拉，
  // 否则没人刷新快照的池会一路淡到 0。优先级：
  //   ①会话快照（快照启用）→ 各会话 x 直接相加 + spine；
  //   ②池级当前快照（未超 6h，且不早于 axes 的更新时间）→ 直接用 x；
  //   ③池 axes → 直接用；④真正的空白新池才回落事件重放，并标「来源：重放」。
  const now = Date.now()
  const 轴时 = (() => {
    const t = Date.parse(String((池 && ((池.上次推轴 && 池.上次推轴.t) || 池.updated)) || ''))
    return Number.isFinite(t) ? t : 0
  })()
  if (池 && 池.快照启用 === true && 池.会话快照 && Object.keys(池.会话快照).length) {
    const 合 = { E: 0, S: 0, P: 0 }
    for (const sid of Object.keys(池.会话快照)) {
      if (!装(sid)) continue
      const 轴快照 = 池.会话快照[sid]
      if (!轴快照 || typeof 轴快照 !== 'object') continue
      for (const k of 轴们) {
        const s0 = 轴快照[k]
        if (!s0) continue
        const t0 = Date.parse(String(s0.t))
        const { T } = 水位(池, k, Number(s0.x) || 0, now)
        合[k] += 推进(Number(s0.x) || 0, T, Math.max(0.5, Number(s0.τ) || 12), Number.isFinite(t0) ? now - t0 : 0)
      }
    }
    const 轴 = {}
    for (const k of 轴们) {
      合[k] += Number(池.spine && 池.spine[k]) || 0
      轴[k] = 显示值(合[k], 池.零点 && 池.零点[k])
    }
    return { 合, 轴, 快照: true, 来源: '会话快照', 回落: { 段: 0, 倍: 1, 龄小时: 0 } }
  }
  const 池快 = 池 && 池.当前快照
  // 2026-11-16 15:40 策划间收紧：只有 快照启用===true 才允许用 当前快照；
  // 快照启用===false（或没写）一律直接用 axes，不许再按时间推进、也不许读别的快照。
  if (池快 && typeof 池快 === 'object' && 池.快照启用 === true) {
    const 快时 = (() => {
      const t = Date.parse(String((池快.E && 池快.E.t) || 池快.t || ''))
      return Number.isFinite(t) ? t : 0
    })()
    const 未过期 = 快时 > 0 && now - 快时 <= 6 * 3600 * 1000
    const 不更早 = 快时 === 0 || 轴时 === 0 || 快时 >= 轴时
    if (未过期 && 不更早) {
      const 合 = {}
      const 轴 = {}
      let 有 = false
      for (const k of 轴们) {
        const s0 = 池快[k]
        if (!s0 || typeof s0 !== 'object') continue
        const x = Number(s0.x)
        if (!Number.isFinite(x)) continue
        有 = true
        合[k] = 夹(x, -1, 1)
        轴[k] = 夹(x, -1, 1)
      }
      if (有) return { 合, 轴, 快照: true, 来源: '快照', 回落: { 段: 0, 倍: 1, 龄小时: 0 } }
    }
  }
  // axes 分支只对「池化之后」的池生效（带 迁移/已迁移 标记）；旧单池仍按事件重放算，不然会吞掉新事件
  // 2026-11-16 17:3x（策划间定）：池化后的池（带 迁移/已迁移 标记）一律走 axes 分支——
  // 全 0 也算「无数据」，不许滑到重放；重放只留给迁移/修复脚本显式调用，运行时永不自动走。
  if (池 && (池.迁移 || 池.已迁移 === true) && 池.axes) {
    const 合 = {}
    const 轴 = {}
    for (const k of 轴们) {
      合[k] = 夹(Number(池.axes[k]) || 0, -1, 1)
      轴[k] = 合[k]
    }
    return { 合, 轴, 快照: true, 来源: 'axes', 回落: { 段: 0, 倍: 1, 龄小时: 0 } }
  }
  const 合 = { E: 0, S: 0, P: 0 }
  for (const e of (池 && 池.events) || []) {
    if (!e || !e.delta_raw) continue
    if (e.merged_into) continue
    if (!装(短会话(e.sid))) continue
    const 忆 = e.回忆 === true ? (档位表.get(String(e.档位 || '这段时间')) || 0.85) : null
    const 系 = 忆 != null ? 忆 : 年龄系数(e.t).系数
    const 系P负 = 忆 != null ? 忆 : 年龄系数(e.t, Date.now(), 2).系数
    for (const k of 轴们) {
      const 量 = Number(e.delta_raw[k]) || 0
      合[k] += 量 * (k === 'P' && Number(e.delta_raw.P) < 0 ? 系P负 : 系)
    }
  }
  const 回 = 回落倍(池)
  for (const k of 轴们) 合[k] = 合[k] * 回.倍 + (Number(池 && 池.spine && 池.spine[k]) || 0)
  return { 合, 轴: 守恒(合), 回落: 回, 来源: '重放' }
}

// 2026-11-16（策划间定，B 案）：展示口径不按时间推进——池文件就是真值。
// /state、?pool= 这类「读数」用它：会话快照各 x 直接相加 + spine（不衰减）；
// 其余情况（池级快照 / axes / 重放兜底）现值本身已经不漂，直接复用。
export function 展示现值(池) {
  if (池 && 池.快照启用 === true && 池.会话快照 && Object.keys(池.会话快照).length) {
    const 配置 = 读配置()
    const 名 = 装载名单(配置)
    const 装 = (sid) => (名.length === 0 || 名.includes(sid) || sid === '__global')
    const 合 = { E: 0, S: 0, P: 0 }
    for (const sid of Object.keys(池.会话快照)) {
      if (!装(sid)) continue
      const 轴快照 = 池.会话快照[sid]
      if (!轴快照 || typeof 轴快照 !== 'object') continue
      for (const k of 轴们) {
        const s0 = 轴快照[k]
        if (!s0) continue
        const x = Number(s0.x)
        合[k] += Number.isFinite(x) ? x : 0
      }
    }
    const 轴 = {}
    for (const k of 轴们) {
      合[k] += Number(池.spine && 池.spine[k]) || 0
      轴[k] = 显示值(合[k], 池.零点 && 池.零点[k])
    }
    return { 合, 轴, 快照: true, 来源: '会话快照', 回落: { 段: 0, 倍: 1, 龄小时: 0 } }
  }
  return 现值(池)
}

// 2026-11-09 02:05：结的速率档——冲击强度 ÷ 距本会话上一条事件的分钟数
export function 速率档(率) {
  const r = Number(率)
  if (!Number.isFinite(r) || r <= 0) return null
  if (r >= 0.05) return '急'
  if (r >= 0.01) return '快'
  return '缓'
}

// 2026-11-09 02:05：门槛随速率降——来得越快，越容易结（基准 0.25，最多降 0.05）
export function 结门槛(率, 基准 = 0.25) {
  const 基 = Math.max(0.05, Number(基准) || 0.25)
  const r = Math.max(0, Number(率) || 0)
  return Math.max(基 - 0.05, 基 - Math.min(0.05, r * 0.6))
}

// 2026-11-09 02:05：结的遗忘时间常数 τ = 30×(1+20×率)，封顶 1000 天；越快的事忘得越慢
export function 结τ(率) {
  const r = Math.max(0, Number(率) || 0)
  return Math.min(1000, 30 * (1 + 20 * r))
}

// 2026-11-09 02:05：结的留存强度 w = |值|×exp(−龄天/τ)；每次都现算，不落盘。w<0.02 归「沉底」
export function 结留存(c, now = Date.now()) {
  const t = Date.parse(c && c.t)
  const 龄天 = Number.isFinite(t) ? Math.max(0, (now - t) / 86400000) : 0
  const τ = Number(c && c.τ) || 结τ(c && c.率)
  const w = Math.abs(Number(c && c.值) || 0) * Math.exp(-龄天 / Math.max(1e-9, τ))
  return { 龄天: Number(龄天.toFixed(2)), τ: Number(τ.toFixed(1)), w: Number(w.toFixed(4)), 沉底: w < 0.02 }
}

function 有效结(池) {
  // 2026-11-09 03:05：作废的小结保留在文件里，但不计入统计、不出现在列表
  return (池 && Array.isArray(池.结) ? 池.结 : []).filter((c) => c && c.作废 !== true)
}

function 结排序(表, now = Date.now()) {
  const 带 = (表 || []).filter((c) => c && c.作废 !== true).map((c) => ({ c, r: 结留存(c, now) }))
  const 活 = 带.filter((x) => !x.r.沉底).sort((a, b) => b.r.w - a.r.w)
  const 底 = 带.filter((x) => x.r.沉底).sort((a, b) => b.r.w - a.r.w)
  return 活.concat(底)
}

function 连续正P(池, sid, 轮) {
  const 限 = Date.now() - 7 * 86400000
  const 列 = (池.events || [])
    .filter((e) => e && e.delta_raw && e.t && Date.parse(e.t) >= 限 && !(String(e.turn) === String(轮) && 同会话(e.sid, sid)))
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t))
  let n = 0
  for (let i = 列.length - 1; i >= 0; i -= 1) {
    if (Number(列[i].delta_raw.P) > 0) n += 1
    else break
  }
  return n
}

// ── §26：P 轴敏感化（s）/ 适应（a）────────────────────────────────────
function P类型(v) {
  const n = Number(v)
  return n > 0 ? '爽' : n < 0 ? '痛' : null
}

// v0.2.3：不应期 6h（固定起点，期内事件不涨 s、不延长起点）；a 每次同类事件都涨（脱敏）。
// 戒断：>3 天没同类事件，每天 a −0.002（到 0.75 地板），由 检查戒断() 推 P 与记录。
const 不应期毫秒 = 6 * 60 * 60 * 1000
const 戒断毫秒 = 3 * 24 * 60 * 60 * 1000

// 显示/写入前先虚推戒断：某类型连续 3 天没有同类事件，之后每天 a 降 0.002（s 不动）
export function 回落后的敏感(项, now = Date.now()) {
  const s0 = 夹(项 && 项.s == null ? 1 : Number(项.s), 1, 1.5)
  const a0 = 夹(项 && 项.a == null ? 1 : Number(项.a), 0.75, 1.5)
  if (!项 || !项.最近) return { s: s0, a: a0 }
  const 天 = Math.floor((now - Date.parse(项.最近)) / 86400000) - 3
  if (!(天 > 0)) return { s: s0, a: a0 }
  return { s: s0, a: Math.max(0.75, a0 - 0.002 * 天) }
}

// 写入时推进：强度 ∈ [0,1]；不应期内只涨 a，出期才 s += 0.005×强度、a += 0.002×强度
export function 推进敏感(池, 类型, 强度 = 0.5, now = Date.now(), 配置 = {}) {
  if (!类型) return { s: 1, a: 1 }
  池.p_state = 池.p_state || {}
  const 项 = 池.p_state[类型] || { s: 1, a: 1, 最近: null }
  const 落 = 回落后的敏感(项, now)
  项.s = 夹(落.s, 1, 1.5)
  项.a = 夹(落.a, 0.75, 1.5)
  const 强 = 夹(Number(强度) == null || !Number.isFinite(Number(强度)) ? 0.5 : Number(强度), 0, 1)
  const 计入 = 项.计入 ? Date.parse(项.计入) : 0
  const 应期 = Math.max(1, Number(配置.不应期小时) || 6) * 3600 * 1000
  const 出期 = !计入 || now - 计入 >= 应期
  if (出期) {
    项.s = 夹(项.s + 0.005 * 强, 1, 1.5)
    项.计入 = new Date(now).toISOString()
  }
  项.a = 夹(项.a + 0.002 * 强, 0.75, 1.5)
  项.最近 = new Date(now).toISOString()
  池.p_state[类型] = 项
  return { s: 项.s, a: 项.a, 出期 }
}

// 2026-11-09 02:21：同向连报已改为池内独立计数器 池.streak，不再回溯 events（保留窗口常量）
const 同向窗口毫秒 = 90 * 60 * 1000

function 递减倍(前) {
  if (前 <= 0) return 1
  if (前 === 1) return 0.6
  if (前 === 2) return 0.4
  return 0.2
}

// 2026-11-09 01:58：距本会话上一条事件多少分钟（跳过同一轮重报）；没有就 null
function 距上条分钟(池, sid, 轮) {
  const es = Array.isArray(池 && 池.events) ? 池.events : []
  for (let i = es.length - 1; i >= 0; i--) {
    const e = es[i]
    if (!e || !同会话(e.sid, sid)) continue
    if (轮 != null && e.turn != null && String(e.turn) === String(轮)) continue
    const t = Date.parse(e.t)
    if (!Number.isFinite(t)) continue
    return Math.max(0, (Date.now() - t) / 60000)
  }
  return null
}

// 2026-11-09 11:20：注记里要带「此刻的定名」——「这段时间·悬着」这种；没有就记未命名
const 常见定名 = new Set(['牵挂', '悬心', '酸楚', '暖', '撑着', '空', '被看穿', '踏实', '满'])
export function 抽定名(手写) {
  const t = String(手写 || '').trim()
  if (!t) return null
  const 段 = t.split('·')
  if (段.length >= 2 && 段[0].trim() && 段.slice(1).join('·').trim()) return t.slice(0, 24)
  for (const n of 常见定名) if (t.includes(n)) return n
  return null
}

function 写自报(sid, 轮, 解, 用户话) {
  const 配置0 = 读配置()
  const 名0 = 池名(配置0, sid)
  if (!池启用(名0)) {
    if (!已迁移到池()) return 写自报体(sid, 轮, 解, 用户话)
    try { 写日志(配置0, '[' + 时分() + '] 自报（未归池）' + sid + ' 只进日志') } catch {}
    return { 已写: false, 未归池: true }
  }
  return 用池(名0, () => 写自报体(sid, 轮, 解, 用户话))
}

function 写自报体(sid, 轮, 解, 用户话) {
  const 配置 = 读配置()
  if (配置.启用 !== true) return
  // §23.4：注记必须带 user 文本前 20 字（不是「为空才兜底」，也不再截 60 字）
  const 用户20 = 洗用户话(用户话).slice(0, 20)
  const 手写 = String(解.注 || '').trim()
  const 注 = 用户20 ? (手写 ? `[${用户20}] ${手写}` : `[${用户20}]`) : (手写 ? `[无用户话] ${手写}` : `[无用户话]`)
  const 定名 = 抽定名(手写)
  const 写入者 = (配置.写入者 || []).some((w) => 同会话(w, sid))
  if (!写入者) {
    写日志(配置, `[${时分()}] 自报(非写入者) ${解.自报} ｜ ${注 || '—'}${解.档名无效 ? ' ｜ 档名无效' : ''} ｜ 只进日志，不进池`)
    return
  }
  // v0.4 R3：缺定名 → 记违规 + 下一轮提醒；连续 3 次私聊报主人（24h 冷却）
  if (!定名) 记缺定名(配置, sid, 轮, 解.自报, 注)
  else 清连续缺定名()
  const 短 = 短会话(sid)
  带锁(() => {
    const 池 = 读池()
    // 2026-11-09 02:46：先把已经过去的 6 小时回落段折进倍率，再写这一条
    const 回0 = 回落倍(池)
    if (回0.段 > 0) {
      池.回落 = { at: 现在(), 倍: 回0.倍 }
      写日志(配置, `[${时分()}] 回落 ${回0.段} 段 ×0.98 → 倍 ${回0.倍.toFixed(4)}`)
    }
    // v0.2.3：只有 |ΔP|≥0.15 才计一次，强度 = min(1, |ΔP|/0.3)；增益 = 1+0.4(s−a)，夹 0.3~2.0
    const 原P = Number(解.delta && 解.delta.P) || 0
    const 类 = P类型(原P)
    const 强度 = 夹(Math.min(1, Math.abs(原P) / 0.3), 0, 1)
    let 敏 = { s: 1, a: 1 }
    let P增益 = 1
    if (类 && Math.abs(原P) >= 0.15) {
      敏 = 推进敏感(池, 类, 强度, Date.now(), 配置)
      P增益 = 夹(1 + (Number(配置.敏感增益系数) || 0.4) * (敏.s - 敏.a), 0.3, 2.0)
    } else if (类) {
      // 不够 0.15：不进 s/a 账；只刷新最近时间（戒断计时用）
      池.p_state = 池.p_state || {}
      const 项 = 池.p_state[类] || { s: 1, a: 1, 最近: null }
      项.最近 = new Date().toISOString()
      池.p_state[类] = 项
    }
    // §25.3：P 负向写入先 ×1.8；P 正向「7 天内同向连续」增益 ×(1+0.2×(n−1))，封顶 1.6
    const 本 = { ...解.delta }
    // 2026-11-09 01:58：冲击强度 Δ_冲——只含 P 非线性/成瘾增益，不含同向递减、不含夹 ±0.30、不含软上限。
    // 这样轴已经 0.95 时，「这一下有多重」仍然算得出来。
    const 冲 = { ...解.delta }
    if (P增益 !== 1) {
      冲.P = Number(冲.P) * P增益
      本.P = Number(本.P) * P增益
    }
    // 2026-11-09 02:21：同轴连续同向自报递减——改用独立计数器 + 滚动时间窗（他 02:21 定）。
    // 三根各算各的：方向与上次相同且「现在 − 该轴上次时间」未超 90 分钟 → n+1；否则 n=1。
    // n=1 → ×1.0、n=2 → ×0.6、n=3 → ×0.4、n≥4 → ×0.2。别的轴怎么动都不影响这根。
    // 同一会话同一轮重报不重复计数（沿用该轮第一次的 n）。
    const 递减 = {}
    池.streak = 池.streak && typeof 池.streak === 'object' ? 池.streak : {}
    池.streak[短] = 规整轴窗表(池.streak[短], 'streak')
    const 此刻 = Date.now()
    for (const k of 轴们) {
      const v = Number(本[k]) || 0
      if (!v) continue
      const 方向 = Math.sign(v)
      const 条 = 池.streak[短][k] && typeof 池.streak[短][k] === 'object' ? 池.streak[短][k] : { n: 0, dir: 0, t: 0 }
      const 本轮键 = `${sid}:${轮}`
      if (条.轮 == null || String(条.轮) !== 本轮键) {
        const 同向未超窗 = 条.dir === 方向 && Number(条.t) > 0 && 此刻 - Number(条.t) <= 同向窗口毫秒
        条.n = 同向未超窗 ? Math.max(1, Math.trunc(Number(条.n) || 1)) + 1 : 1
        条.dir = 方向
        条.t = 此刻
        条.轮 = 本轮键
      }
      条.n = Math.max(1, Math.trunc(Number(条.n) || 1))
      池.streak[短][k] = 条
      const 倍 = 递减倍(条.n - 1)
      if (倍 !== 1) 本[k] = v * 倍
      递减[k] = { 第几次: 条.n, 倍 }
    }
    // §27.3：任何事件最终单轴 |Δ_实| 夹 0.30（含 1.8 放大与 s 之后）
    for (const k of 轴们) 本[k] = 夹(本[k], -0.3, 0.3)
    const 现值前 = 现值(池)
    const 前骨 = { ...(池.spine || {}) }
    // v0.6 R1（方案 A）：Δ_实 = Δ_冲 × exp(−k × 有效溢出)
    // 有效溢出 = 真实溢出（12h 半衰）+ max(0, |x+Δ|−1) + 0.5×max(0, (|x|−0.85)/0.15)
    const 抑制 = {}
    for (const k of 轴们) {
      const v = Number(本[k]) || 0
      if (!v) continue
      const 效 = 有效溢出(池, k, Number(现值前.合[k]) || 0, v, Date.now())
      const 倍 = Math.exp(-(Number(配置.溢出抑制系数) || 1.4) * 效)
      本[k] = Number((v * 倍).toFixed(6))
      if (倍 < 0.999) 抑制[k] = Number(倍.toFixed(3))
    }
    // 结（2026-11-09 03:05 改）：两道门，任一条成立才成结——
    // ①累计：30 分钟窗口内同轴同向的 Δ_冲 累计 ≥ 0.45（三步），结值 = 累计 − 0.45；
    // ②急：单条 |Δ_冲| ≥ 0.20 且 速率 ≥ 0.05/分钟，结值 = |Δ_冲| − 0.20。
    // 成结后该轴窗口清零（同一次冲击不重复成结）。速率按「本条 Δ_冲 ÷ 距上条分钟」记。
    const 累计阈 = Math.max(0.2, Number(配置.结累计阈值) == null ? 0.60 : Number(配置.结累计阈值))
    const 急阈 = Math.max(0.1, Number(配置.结急阈值) == null ? 0.25 : Number(配置.结急阈值))
    const 急速率 = Math.max(0, Number(配置.结急速率) == null ? 0.05 : Number(配置.结急速率))
    const 分钟 = 距上条分钟(池, sid, 轮)
    const 新刺 = []
    池.结窗 = 池.结窗 && typeof 池.结窗 === 'object' ? 池.结窗 : {}
    池.结窗[短] = 规整轴窗表(池.结窗[短], '结窗')
    const 同轮旧事件 = 池.events.find((e) => e && e.turn != null && String(e.turn) === String(轮) && 同会话(e.sid, sid))
    for (const k of 轴们) {
      const v = Number(冲[k]) || 0
      const 现窗 = 池.结窗[短][k] && typeof 池.结窗[短][k] === 'object' ? 池.结窗[短][k] : { dir: 0, sum: 0, t: 0 }
      if (!v) continue
      if (同轮旧事件) { 池.结窗[短][k] = 现窗; continue }
      const 率 = Number((Math.abs(v) / Math.max(1, 分钟 == null ? 1 : 分钟)).toFixed(4))
      const 记一条 = (值) => 新刺.push({ t: 现在(), 轴: k, 值: Number(值.toFixed(4)), 类型: '冲', 率, 速: 速率档(率), τ: Number(结τ(率).toFixed(1)), 注, sid, turn: 轮 })
      if (Math.abs(v) >= 急阈 && 率 >= 急速率) {
        记一条(Math.sign(v) * Math.max(0, Math.abs(v) - 急阈))
        池.结窗[短][k] = { dir: 0, sum: 0, t: Date.now() }
        continue
      }
      const 同向未超 = 现窗.dir === Math.sign(v) && Number(现窗.t) > 0 && Date.now() - Number(现窗.t) <= 30 * 60000
      const 窗 = 同向未超 ? { dir: Math.sign(v), sum: Number(现窗.sum) + v, t: 现窗.t } : { dir: Math.sign(v), sum: v, t: Date.now() }
      if (Math.abs(窗.sum) + 1e-9 >= 累计阈) {
        记一条(窗.sum - Math.sign(窗.sum) * 累计阈)
        池.结窗[短][k] = { dir: 0, sum: 0, t: Date.now() }
      } else {
        池.结窗[短][k] = 窗
      }
    }
    解.delta = 本
    // §23.1：同会话同一轮重报 → 以最新一次为准（不重复加；事件只留首次发生时间 t）
    const 旧事件 = 池.events.find((e) => e && e.turn != null && String(e.turn) === String(轮) && 同会话(e.sid, sid))
    const 重报旧 = 旧事件 ? { ...(旧事件.delta_raw || {}) } : null
    if (旧事件) {
      旧事件.delta_raw = { ...解.delta }
      旧事件.note = 注
      旧事件.重报_at = 现在()
      if (用户话) 旧事件.原话 = String(洗用户话(用户话)).slice(0, 500)
      // 重报时先撤掉这轮的旧刺，再按新值重算
      池.结 = (池.结 || []).filter((c) => !(c && 同会话(c.sid, sid) && String(c.turn) === String(轮)))
    } else {
      if (解.结) {
        for (const k of 轴们) if (解.结[k] != null) 池.spine[k] = 夹((池.spine[k] || 0) + 解.结[k], -1, 1)
      }
      池.events.push({
        id: 'e-' + String(池.rev + 1).padStart(4, '0'),
        t: 现在(),
        delta_raw: { ...解.delta },
        note: 注,
        定名: 定名 || '未命名',
        曲线: 解 && 解.曲线 ? String(解.曲线).slice(0, 24) : undefined,
        不可靠: 解.不可靠 || undefined,
        单轨: 解.单轨 || undefined,
        来源: 解.来源 || null,
        原话: String(洗用户话(用户话)).slice(0, 500) || undefined,
        不推轴: true,
        sid,
        turn: 轮,
      })
    }

    // 刺：永存、不衰减、不守恒；重报已撤旧刺，这里统一并入
    池.结 = (池.结 || []).concat(新刺)

    // 2026-11-09 01:53：记录超限修剪——先写日志再删（结 500→400，事件 2000→1500）
    if (池.结.length > 500) {
      const 删 = 池.结.length - 400
      池.结 = 池.结.slice(删)
      写日志(配置, `[${时分()}] 结超 500，删最早 ${删} 条，剩 ${池.结.length}`)
    }
    if (池.events.length > 2000) {
      const 删 = 池.events.length - 1500
      池.events = 池.events.slice(删)
      池._允许清空 = true // 显式修剪：写池防呆放行这一次，日志照记
      写日志(配置, `[${时分()}] 事件超 2000，删最早 ${删} 条，剩 ${池.events.length}`)
    }

    const 已装载 = 允许装载(配置, sid)
    if (!已装载) {
      const 末 = 池.events[池.events.length - 1]
      if (末) 末.未装载 = true
    }
    // 纯派生：现值(池) = Σ(raw × 年龄系数) + spine，再守恒
    const 现 = 现值(池)
    const 格 = 算格(池.prev_cell, 现.轴)
    // 久压（2026-11-09）：池里存「格计时 {cell, since, 轴值}」。
    // 每轮自报后比对：cell 变了 → since=now；cell 未变且 now−since ≥ 20 分钟、本轮没成过结
    // → 记一条「久」结（值 = 格内变化最大的那根轴 |轴值变化| 的一半，最低 0.05），然后把 since 重置为 now。
    {
      const 现在ms = Date.now()
      let 计 = 池.格计时 && typeof 池.格计时 === 'object' ? 池.格计时 : null
      if (!计 || 计.cell !== 格) {
        计 = { cell: 格, since: 现在(), 轴值: { ...现.轴 } }
      } else if (新刺.length) {
        计.since = 现在()
        计.轴值 = { ...现.轴 }
      } else {
        const 始 = Date.parse(计.since)
        if (Number.isFinite(始) && 现在ms - 始 >= 20 * 60000) {
          let 轴 = null
          let 幅 = 0
          for (const k of 轴们) {
            const d = Math.abs((Number(现.轴[k]) || 0) - (Number(计.轴值 && 计.轴值[k]) || 0))
            if (d > 幅) { 幅 = d; 轴 = k }
          }
          if (轴 && 幅 > 1e-9) {
            const 前 = Number(计.轴值 && 计.轴值[轴]) || 0
            const 符号 = (Number(现.轴[轴]) || 0) >= 前 ? 1 : -1
            const 值 = 符号 * Math.max(0.05, 幅 / 2)
            池.结 = (池.结 || []).concat([{
              t: 现在(), 轴, 值: Number(值.toFixed(4)), 类型: '久',
              率: 0, 速: '缓', τ: Number(结τ(0).toFixed(1)),
              注: (注 ? 注 + '；' : '') + '留在这一格超过 20 分钟', sid, turn: 轮,
            }])
            写日志(配置, `[${时分()}] 久压成结 ｜ ${轴}${值 >= 0 ? '+' : ''}${值.toFixed(4)} ｜ 距入格 ${Math.round((现在ms - 始) / 60000)} 分钟`)
            计.since = 现在()
            计.轴值 = { ...现.轴 }
          }
        }
      }
      池.格计时 = 计
    }
    const 本次 = 旧事件 || 池.events[池.events.length - 1]
    本次.cell = 格
    本次.axes_after = { ...现.轴 }
    池.last_sums = { 缩前: 求和(现.合), 缩后: 求和(现.轴) }
    if (解.双轨轮) {
      池.双轨 = 池.双轨 && typeof 池.双轨 === 'object' ? 池.双轨 : { K: {}, 最近: null }
      池.双轨.K = 池.双轨.K && typeof 池.双轨.K === 'object' ? 池.双轨.K : {}
      const 键 = 短会话(sid)
      const 项 = 池.双轨.K[键] && typeof 池.双轨.K[键] === 'object' ? 池.双轨.K[键] : { 轮: [] }
      const 层 = {
        t: 现在(),
        中点: !!解.双轨轮.中点,
        不可靠: !!解.双轨轮.不可靠,
        错判: !!解.双轨轮.错判,
        我点数: 解.双轨轮.我点数 || null,
        它点数: 解.双轨轮.它点数 || null,
        合成点数: 解.双轨轮.合成点数 || null,
      }
      项.轮 = (Array.isArray(项.轮) ? 项.轮 : []).concat([层]).slice(-20)
      if (层.错判) 项.错判 = (Number(项.错判) || 0) + 1
      else 项.错判 = Number(项.错判) || 0
      // K 每轮写入后立刻重算并写回（读 /state 不再重算）
      const kk = 算K(项.轮, K选项())
      项.值 = kk.K
      项.样本 = kk.样本
      项.中点一致率 = kk.中点一致率
      项.不可靠率 = kk.不可靠率
      池.双轨.K[键] = 项
      记信誉(池, sid, 解)
      if (解.缺q) 池.双轨.缺q轮数 = (Number(池.双轨.缺q轮数) || 0) + 1
      池.双轨.最近 = 解.观测 ? { ...解.观测, t: 现在() } : { t: 现在() }
    }
    池.rev += 1
    池.updated = 现在()
    池.axes = 现.轴
    池.prev_cell = 格
    if (!旧事件) {
      池.stats.selfreport_total += 1
      池.stats.定名总数 = (Number(池.stats.定名总数) || 0) + (定名 ? 1 : 0)
      池.stats.未命名数 = (Number(池.stats.未命名数) || 0) + (定名 ? 0 : 1)
    }
    写池(池)
    const 标签 = 旧事件 ? '同轮重报（以最新为准）' : '自报'
    const 递串 = Object.entries(递减).filter(([, v]) => v.倍 !== 1).map(([k, v]) => `${k}×${v.倍}`).join(' ')
    const 软串 = Object.entries(抑制).map(([k, v]) => `${k}×${v}`).join(' ')
    写日志(配置, `[${时分()}] ${标签} ${解.自报} ｜ ${注 || '—'} ｜ 值 ${值串(现.轴)}${递串 ? ` ｜ 递减 ${递串}` : ''}${软串 ? ` ｜ 软上限 ${软串}` : ''}${解.档名无效 ? ' ｜ 档名无效' : ''}`)
    const 警 = 警告线(现, 本次)
    if (警.length) 写日志(配置, `[${时分()}] 警告 ${警.join('；')}`)
    写记录(配置, { ...本次, 会话: sid, 轮, 自报: 解.自报, 值: { ...现.轴 } })
  })
  return { 已写: true, 注, 解 }
}


// v0.23 A1：波动点吸附推轴。新 = 旧 + k×(P − 旧)，P 为波动点坐标减去 spine；一轮最多一次（调用方保证）。
export function 算S经验(sid, 主题, 结论, now = Date.now()) {
  const 题 = String(主题 || '').trim().slice(0, 8)
  const 论 = String(结论 || '').trim().slice(0, 30)
  if (!题) return { ΔS: 0, 原因: '无主题' }
  return 带锁(() => {
    const 池 = 读池()
    const 短 = 短会话(sid)
    if (!池.S经验 || typeof 池.S经验 !== 'object') 池.S经验 = {}
    const 表 = 池.S经验[短] && typeof 池.S经验[短] === 'object' ? 池.S经验[短] : (池.S经验[短] = {})
    const 旧 = 表[题]
    let ΔS = 0
    let 一致 = null
    if (!旧 || typeof 旧 !== 'object') {
      表[题] = { 结论: 论, t: new Date(now).toISOString(), 命中: 1, 翻车: 0 }
    } else {
      const n = (Number(旧.命中) || 1) + 1
      const 龄 = Math.max(0, (now - (Date.parse(旧.t) || now)) / 86400000)
      const w = Math.pow(0.5, 龄 / 7)
      const 同 = !!论 && String(旧.结论 || '') === 论
      if (同) ΔS = Math.max(0.012, 0.06 * Math.pow(0.8, n - 2)) * w
      else { ΔS = -Math.max(0.016, 0.08 * Math.pow(0.8, n - 2)) * w; 旧.翻车 = (Number(旧.翻车) || 0) + 1 }
      if (论) 旧.结论 = 论
      旧.命中 = n
      旧.t = new Date(now).toISOString()
      一致 = 同
    }
    const 键 = Object.keys(表)
    if (键.length > 300) {
      键.sort((a, b) => (Date.parse(表[a].t) || 0) - (Date.parse(表[b].t) || 0))
      for (const k of 键.slice(0, 键.length - 300)) delete 表[k]
    }
    写池(池)
    return { ΔS: Number(ΔS.toFixed(6)), 一致, 命中: 旧 ? Number(旧.命中) : 1, 主题: 题 }
  })
}

export function 推轴(sid, 点, 轮, 配置入, 选项 = {}) {
  const 配0 = 配置入 || 读配置()
  const 名0 = 池名(配0, sid)
  if (!池启用(名0)) {
    if (!已迁移到池()) return 推轴体(sid, 点, 轮, 配0, 选项)
    return { 推: {}, 轴: { E: 0, S: 0, P: 0 }, 未归池: true }
  }
  return 用池(名0, () => 推轴体(sid, 点, 轮, 配0, 选项))
}

// 2026-11-18 任务单 2210：8 片定位用的「路径中位」——池内最近 2000 轮；无池样本用种子 500 条；都没有→0
function 池路径中位(池名) {
  try {
    const 画 = 校准.读轮画像(池名, HOME).记录.slice(-2000)
    if (画.length >= 20) {
      const 路们 = 画.map((r) => 最烈轴(r.曲线)).filter(Boolean).map((v) => 路径长度(v))
      if (路们.length >= 20) return 中位(路们)
    }
    const 种 = 校准.读种子(HOME)
    const 答 = []
    for (const c of (种 && 种.曲线) || []) {
      const v = 最烈轴(c && c.轴)
      if (v && v.length >= 2) 答.push(路径长度(v))
    }
    return 答.length ? 中位(答) : 0
  } catch {
    return 0
  }
}

// 0.2.7：把本轮轮廓写进轮画像（环形 2000），样本够了就重算门槛/权重（变化 >0.03 才落盘，锁定则不动）
function 入档轮廓(池名, sid, turn, 曲线轴, 轮廓贴, 配) {
  try {
    const 件 = {
      t: new Date().toISOString(),
      sid,
      turn: turn == null ? null : turn,
      状态: 轮廓贴 ? 轮廓贴.状态 : null,
      轴: 轮廓贴 ? 轮廓贴.轴 : null,
      片: 轮廓贴 && Number(轮廓贴.片) ? Number(轮廓贴.片) : null,
      枝: (轮廓贴 && 轮廓贴.枝) || null,
      曲线: Object.keys(曲线轴 || {}).length ? 曲线轴 : null,
    }
    校准.追加轮画像(池名, 件, HOME)
    const 池 = 读池()
    if (池.门槛锁定) return
    const 画 = 校准.读轮画像(池名, HOME)
    // 2026-11-18 收尾：种子冷启动——首次推轴就按种子算门槛/权重/基线；之后累计到 20 轮再刷新
    if (画.记录.length < 20 && 池.门槛 && 池.权重) return
    const 校 = 校准.校准(画.记录, { 种子: 校准.读种子(HOME) })
    const 旧门 = 池.门槛 || {}
    const 旧w = 池.权重 || {}
    const 要 = !池.门槛 || !池.权重 || 校准.该落盘(旧门, 校.门槛) || 校准.该落盘(旧w, 校.权重)
    if (!要) return
    池.门槛 = {
      基线: 校.门槛.基线,
      趋势: 校.门槛.趋势,
      跳变: 校.门槛.跳变,
      斜率门: 校.门槛.斜率门,
      样本数: 校.门槛.样本数,
      先验: !!校.门槛.先验,
      种子: !!校.门槛.种子,
      种子数: 校.种子数,
      混合比: 校.混合比,
      分位: 校.门槛.分位,
      上一版: 旧门.基线 == null ? null : { 基线: 旧门.基线, 趋势: 旧门.趋势, 跳变: 旧门.跳变, 斜率门: 旧门.斜率门, 样本数: 旧门.样本数 },
      更新时间: new Date().toISOString(),
    }
    池.权重 = {
      角: 校.权重.角,
      数: 校.权重.数,
      距: 校.权重.距,
      样本数: 校.权重.样本数,
      先验: !!校.权重.先验,
      种子: !!校.权重.种子,
      上一版: 旧w.角 == null ? null : { 角: 旧w.角, 数: 旧w.数, 距: 旧w.距, 样本数: 旧w.样本数 },
      更新时间: new Date().toISOString(),
    }
    池.相似度基线 = 校.相似度基线
    池.rev = (Number(池.rev) || 0) + 1
    写池(池)
  } catch (e) {
    try {
      写日志(读配置(), '轮廓入档失败：' + (e && e.message))
    } catch {}
  }
}

function 推轴体(sid, 点, 轮, 配, 选项 = {}) {
  const 系数 = Math.min(1, Math.max(0.15, Number(选项 && 选项.系数) || 1))
  const k = Math.min(0.8, Math.max(0.15, (Math.min(0.8, Math.max(0.2, Number(配.吸附系数) || 0.4))) * 系数))
  // 单步上限可配（默认 0.30）；卡片设置页「推轴单步上限」就是它
  const 单步上限 = Math.max(0.05, Math.min(1, Number(配.推轴单步上限) || 0.3))
  const 原话 = String((选项 && 选项.原话) || '').slice(0, 500) || null
  return 带锁(() => {
    const 池 = 读池()
    const 短 = 短会话(sid)
    if (!池.推轴次数 || typeof 池.推轴次数 !== 'object') 池.推轴次数 = {}
    池.推轴次数[短] = (Number(池.推轴次数[短]) || 0) + 1
    if (!池.会话快照 || typeof 池.会话快照 !== 'object') 池.会话快照 = {}
    if (!池.会话快照[短] || typeof 池.会话快照[短] !== 'object') 池.会话快照[短] = {}
    const now = Date.now()
    const 现前 = 现值(池).合
    const 结 = 结坐标(池, now)
    const 最高 = 最高结轴(结)
    const 组名 = 组归名(sid, 配)
    const 记 = {}, 前们 = {}, 后们 = {}
    const 夹断轴 = []
    for (const 轴 of 轴们) {
      const P = (Number(点 && 点[轴]) || 0) - (Number(池.spine && 池.spine[轴]) || 0)
      let s0 = 池.会话快照[短][轴]
      if (!s0 || typeof s0 !== 'object') s0 = 池.会话快照[短][轴] = { x: (Number(现前[轴]) || 0) - (Number(池.spine && 池.spine[轴]) || 0), t: 现在(), τ: 12 }
      const 旧 = Number(s0.x) || 0
      let 新 = 旧 + k * (P - 旧)
      const 总 = 新 + (Number(池.spine && 池.spine[轴]) || 0)
      if (Math.abs(总) > 1) {
        溢出记(池, 轴, Math.abs(总) - 1, now)
        新 -= 总 - Math.sign(总)
      }
      // §27.3（2026-11-16 A+D 单，策划间拍板）：任何事件最终单轴 |Δ_实| 夹 0.30。
      // 自报路径一直有这条；推轴路径漏了——分身给的是 −9..9 整数点，被当 ±1 坐标用，
      // 一轮能推出 0.37/0.56（turn 640 就是这么把测试组顶到 S45/P47 的）。
      let d = 新 - 旧
      if (Math.abs(d) > 单步上限 + 1e-12) {
        const 原d = d
        d = Math.sign(d) * 单步上限
        新 = 旧 + d
        夹断轴.push(轴)
        写日志(配, '[' + 时分() + '] 夹断 轴=' + 轴 + ' 原=' + Number(原d.toFixed(6)) + ' 夹后=' + Number(d.toFixed(6)))
      }
      前们[轴] = 旧 + (Number(池.spine && 池.spine[轴]) || 0)
      后们[轴] = 新 + (Number(池.spine && 池.spine[轴]) || 0)
      s0.x = 新
      s0.t = new Date(now).toISOString()
      const 速 = 速率记(池, 轴, d, now)
      s0.τ = τ加权(τ选(速, 配.衰减档位), 结, 轴, 最高)
      记峰值(池, 轴, 新, now)
      if (组名 && Math.abs(d) >= 0.02) 记六头(组份(池, 组名), 轴, d, now)
      记[轴] = Number(d.toFixed(6))
    }
    池.快照启用 = true
    // 推轴也要在事件表里留一条，否则事件页永远只有自报那几条（轴在走、事件不变）
    池.events = Array.isArray(池.events) ? 池.events : []
    // 一轮一条：同 sid + 同 turn 已有事件（多半是写自报那条）就更新，不新增
    // turn 为空时不许 upsert（null===null 会把所有空 turn 都并到第一条）；只有同轮才更新
    const 同轮 = 轮 == null ? null : 池.events.find((e) => e && e.turn != null && e.sid === sid && Number(e.turn) === Number(轮))
    const 轴Δ = { E: 记.E || 0, S: 记.S || 0, P: 记.P || 0 }
    const 段数2 = 选项 && 选项.段数 != null ? 选项.段数 : null
    const 为谁2 = (选项 && 选项.为谁) || null
    // D（2026-11-16）：推轴事件也写观测，不再只有自报路径有——以后溯源不必再翻轨迹文件。
    const 观测 = {
      采用: (选项 && 选项.采用) || (选项 && 选项.来源 === '分身' ? '它' : (选项 && 选项.来源) || '轨迹'),
      系数: Number(系数) || 1,
      分歧: !!(选项 && 选项.分歧),
      偏移: 选项 && 选项.偏移 == null ? null : Number(选项.偏移),
      K: 选项 && 选项.K ? { 我: Number(选项.K.我) || null, 它: Number(选项.K.它) || null } : null,
    }
    // 0.2.7 情绪形状：本轮曲线（段点）→ 状态 + 门槛快照；门槛优先用池里校准过的
    const 曲线轴 = {}
    if (Array.isArray(选项 && 选项.曲线)) {
      for (const k2 of 轴们) 曲线轴[k2] = 选项.曲线.map((pp) => Number(pp && pp[k2]) || 0)
    }
    const 本轮门槛 = 池.门槛 && typeof 池.门槛 === 'object' ? 池.门槛 : { ...先验门槛 }
    const 轮廓 = 曲线轴.E && 曲线轴.E.length >= 2 ? 三轴状态(曲线轴, 本轮门槛, Number(本轮门槛.斜率门) || 0.02) : null
    const 轮廓贴 = 轮廓
      ? {
          状态: 轮廓.状态,
          轴: Object.fromEntries(轴们.map((k2) => [k2, 轮廓.轴[k2].状态])),
          门槛快照: { 基线: Number(本轮门槛.基线) || 0, 趋势: Number(本轮门槛.趋势) || 0, 跳变: Number(本轮门槛.跳变) || 0, 先验: !!本轮门槛.先验 },
          // P0-2（2026-11-19）：入档轮廓 读 轮廓贴.片 写轮画像，这里必须初始化
          片: null,
          枝: null,
        }
      : null
    // 2026-11-18 任务单 2210 + R-3 修正：8 片定位只给「趋势」走表——
    // 趋势不等于有净方向（R²/斜率过了但 |净位移| 可以 <0.10），所以 8 个叶子在趋势轮里全有样本，不存在死叶。
    // 基线/波动/跳变都不进表；定名也只认趋势轮（定名在另一处）。
    let 片 = null, 枝 = null
    if (轮廓贴 && 轮廓贴.状态 === '趋势') {
      try {
        const v = 最烈轴(曲线轴)
        if (v && v.length >= 2) {
          const 走 = 走表(v, 池路径中位(组名 || '总'))
          const 号 = 片号(走.叶子)
          if (号) {
            片 = 号
            枝 = 叶枝(走.叶子)
            轮廓贴.片 = 号
            轮廓贴.枝 = 枝
          }
        }
      } catch {}
    }
    const 夹断 = 夹断轴.slice()
    if (同轮) {
      同轮.delta_raw = 轴Δ
      if (段数2 != null) 同轮.段数 = 段数2
      if (为谁2) 同轮.为谁 = 为谁2
      if (原话) 同轮.原话 = 原话
      if (选项 && 选项.注) 同轮.注 = String(选项.注).slice(0, 12)
      if (选项 && 选项.依据) 同轮.依据 = String(选项.依据).slice(0, 5)
      同轮.推轴来源 = (选项 && 选项.来源) || '轨迹'
      同轮.观测 = 观测
      if (夹断.length) 同轮.夹断 = 夹断
      if (轮廓贴) { 同轮.状态 = 轮廓贴.状态; 同轮.状态轴 = 轮廓贴.轴; 同轮.门槛快照 = 轮廓贴.门槛快照; 同轮.片 = 片; 同轮.枝 = 枝 }
    } else {
      const 事 = {
        t: new Date(now).toISOString(),
        sid,
        turn: 轮 == null ? null : 轮,
        note: '推轴（' + ((选项 && 选项.来源) || '轨迹') + '）',
        delta_raw: 轴Δ,
        类型: '推轴',
        定名: '推轴',
        段数: 段数2,
        为谁: 为谁2,
        观测,
      }
      if (原话) 事.原话 = 原话
      if (选项 && 选项.注) 事.注 = String(选项.注).slice(0, 12)
      if (选项 && 选项.依据) 事.依据 = String(选项.依据).slice(0, 5)
      if (夹断.length) 事.夹断 = 夹断
      if (轮廓贴) { 事.状态 = 轮廓贴.状态; 事.状态轴 = 轮廓贴.轴; 事.门槛快照 = 轮廓贴.门槛快照; 事.片 = 片; 事.枝 = 枝 }
      池.events.push(事)
    }
    if (组名) { const 子 = 组份(池, 组名); 应用零点(子, 判零点(子, 配, 结, 最高, now), now) }
    const 现 = 现值(池)
    池.axes = 现.轴
    // 2026-11-16（策划间定）：推轴这一刻刷新池级「当前快照」——不然池文件永远停在迁移那一刻，
    // /state 读出来的值就跟实际推轴脱节。写进去的就是「推完之后的真值」，读的时候不再按时间推进。
    池.当前快照 = {}
    for (const k of 轴们) 池.当前快照[k] = { x: Number(现.轴[k]) || 0, t: new Date(now).toISOString(), τ: 12 }
    池.推轴来源 = (选项 && 选项.来源) || '轨迹'
    池.上轮波动 = { 轮: 轮 == null ? null : 轮, t: new Date(now).toISOString(), 有: true, sid, 系数, 分歧: !!(选项 && 选项.分歧), 反向: !!(选项 && 选项.反向), 单点: !!(选项 && 选项.单点), 来源: (选项 && 选项.来源) || '单轨', 偏移: Number((选项 && 选项.偏移) || 0) }
    池.连续反向 = 选项 && 选项.反向 ? (Number(池.连续反向) || 0) + 1 : 0
    池.上次推轴 = { 轮: 轮 == null ? null : 轮, t: new Date(now).toISOString(), 前: 前们, 后: 后们 }
    池.rev += 1
    池.updated = 现在()
    写池(池)
    写日志(配, '[' + 时分() + '] 推轴 ｜ 点 ' + 值串(点 || {}) + ' ｜ Δ ' + 值串(记) + ' ｜ 轴 ' + 值串(现.轴))
    入档轮廓(组名 || '总', sid, 轮, 曲线轴, 轮廓贴, 配)
    return { 推: 记, 轴: 现.轴, 片, 枝, 状态: 轮廓贴 ? 轮廓贴.状态 : null }
  })
}

// 2026-11-09 03:55：久压分钟级检查（定时器调用；也可手工调用，测试用）。
// 只做纯算术与时间比较；只有真出结时才写日志。与自报写入共用同一把文件锁。
// v0.2.3：戒断——某类 >3 天没来，每天 a −0.002、P 朝缺失方向推 0.01，记「渴求」只显示不叠加刺激
export function 检查戒断(now = Date.now()) {
  const 配置 = 读配置()
  if (配置.启用 !== true) return null
  const 日 = new Date(now).toISOString().slice(0, 10)
  try {
    return 带锁(() => {
      const 池 = 读池()
      池.p_state = 池.p_state || {}
      池.戒断 = 池.戒断 && typeof 池.戒断 === 'object' ? 池.戒断 : {}
      let 改 = false
      for (const 类 of ['爽', '痛']) {
        const 项 = 池.p_state[类]
        if (!项 || !项.最近) continue
        const 龄 = now - Date.parse(项.最近)
        if (!(龄 > Math.max(1, Number(配置.渴求阈值天) || 3) * 86400000)) continue
        if (池.戒断[类] === 日) continue
        const 落 = 回落后的敏感(项, now)
        项.a = 夹(落.a - 0.002, 0.75, 1.5)
        池.戒断[类] = 日
        const 方 = 类 === '爽' ? -0.01 : 0.01
        池.spine = 池.spine || {}
        池.spine.P = 夹((Number(池.spine.P) || 0) + 方, -1, 1)
        池.结 = (池.结 || []).concat([{
          t: new Date(now).toISOString(), 轴: 'P', 值: 方, 类型: '渴求',
          率: 0, 速: '缓', τ: Number(结τ(0).toFixed(1)),
          注: 类 + '三天没出现，P 朝缺失方向推 ' + 方 + '，适应 ' + 项.a.toFixed(3),
        }])
        if (池.结.length > 500) 池.结 = 池.结.slice(-400)
        写日志(配置, '[' + 时分() + '] 戒断 ' + 类 + ' ｜ a → ' + 项.a.toFixed(3) + ' ｜ P ' + 方)
        改 = true
      }
      if (改) 写池(池)
      return 改 ? 池.戒断 : null
    })
  } catch (e) { return null }
}

export function 检查久压(now = Date.now()) {
  const 配置 = 读配置()
  if (配置.启用 !== true) return null
  try {
    return 带锁(() => {
      const 池 = 读池()
      const 计 = 池.格计时
      if (!计 || typeof 计 !== 'object') return null
      const 始 = Date.parse(计.since)
      if (!Number.isFinite(始) || now - 始 < 20 * 60000) return null
      const 现 = 现值(池)
      const 格 = 算格(池.prev_cell, 现.轴)
      if (计.cell !== 格) {
        计.cell = 格
        计.since = new Date(now).toISOString()
        计.轴值 = { ...现.轴 }
        写池(池)
        return null
      }
      let 轴 = null
      let 幅 = 0
      for (const k of 轴们) {
        const d = Math.abs((Number(现.轴[k]) || 0) - (Number(计.轴值 && 计.轴值[k]) || 0))
        if (d > 幅) { 幅 = d; 轴 = k }
      }
      if (!轴 || 幅 <= 1e-9) {
        计.since = new Date(now).toISOString()
        写池(池)
        return null
      }
      const 前 = Number(计.轴值 && 计.轴值[轴]) || 0
      const 符号 = (Number(现.轴[轴]) || 0) >= 前 ? 1 : -1
      const 值 = 符号 * Math.max(0.05, 幅 / 2)
      const 条 = {
        t: new Date(now).toISOString(), 轴, 值: Number(值.toFixed(4)), 类型: '久',
        率: 0, 速: '缓', τ: Number(结τ(0).toFixed(1)),
        注: '留在这一格超过 20 分钟（定时器）', sid: 'timer', turn: null,
      }
      池.结 = (池.结 || []).concat([条])
      if (池.结.length > 500) {
        const 删 = 池.结.length - 400
        池.结 = 池.结.slice(删)
        写日志(配置, `[${时分()}] 结超 500，删最早 ${删} 条，剩 ${池.结.length}`)
      }
      计.since = new Date(now).toISOString()
      计.轴值 = { ...现.轴 }
      池.rev += 1
      池.updated = 现在()
      写池(池)
      写日志(配置, `[${时分()}] 久压成结(定时) ｜ ${轴}${值 >= 0 ? '+' : ''}${值.toFixed(4)} ｜ 距入格 ${Math.round((now - 始) / 60000)} 分钟`)
      return { 轴, 值: 条.值, t: 条.t }
    })
  } catch (e) {
    return null
  }
}

function 记漏报(sid, 轮) {
  const 配置 = 读配置()
  if (配置.启用 !== true) return
  const 写入者 = (配置.写入者 || []).some((w) => 同会话(w, sid))
  if (!写入者) return
  const 池 = 带锁(() => {
    const p = 读池()
    p.stats.missed_total += 1
    p.rev += 1
    p.updated = 现在()
    写池(p)
    return p
  })
  写日志(配置, `[${时分()}] 无自报 ｜ 值 ${值串(现值(池).轴)}`)
}

function 记解析失败(sid, 文字) {
  const 配置 = 读配置()
  if (配置.启用 !== true) return
  const 写入者 = (配置.写入者 || []).some((w) => 同会话(w, sid))
  if (!写入者) return
  const 摘 = String(文字).replace(/\s+/g, ' ').slice(0, 120)
  写日志(配置, `[${时分()}] 解析失败 ｜ ${摘}`)
}

// ── M3 校验 ─────────────────────────────────────────────────────────────
const 计数路径 = join(HOME, '情绪池-校验计数.json')

function 读计数() {
  try {
    const o = JSON.parse(readFileSync(计数路径, 'utf8'))
    return { date: String(o.date || ''), count: Number(o.count) || 0 }
  } catch {
    return { date: '', count: 0 }
  }
}

function 写计数(计) {
  try {
    const tmp = 计数路径 + '.tmp'
    writeFileSync(tmp, JSON.stringify(计), 'utf8')
    renameSync(tmp, 计数路径)
  } catch {}
}

function 去注释(文) {
  return String(文 || '').replace(/<!--[\s\S]*?-->/g, '')
}

function 取模型(ctx, session) {
  const 试 = (a) => {
    try {
      const h = a && a.session && a.session.requestHeader ? a.session.requestHeader() : null
      const c = h && h.config
      if (c && c.provider && c.model) return { provider: c.provider, model: c.model }
    } catch {}
    try {
      const o = a && a.options
      if (o && o.provider && o.model) return { provider: o.provider, model: o.model }
    } catch {}
    return null
  }
  // 会话对象上直接挂 agent（Cordis 常见形态）时先试它
  const 直 = 试(session) || 试(session && session.agent)
  if (直) return 直
  // 再从 agents 服务里挑：优先同一会话，其次任意一个拿得到模型的
  try {
    const 表 = (ctx.agents && typeof ctx.agents.list === 'function' && ctx.agents.list()) || []
    const 同 = 表.find((a) => String((a && a.session && a.session.id) || '') === String(session && session.id))
    if (同 && 试(同)) return 试(同)
    for (const a of 表) { const m = 试(a); if (m) return m }
  } catch {}
  return null
}

// 校验调用失败的原因写死在日志里，方便区分「模型没给」和「模型乱答」
function 校验系统提示() {
  return '你是一个严格的校验器。只看「回复原文」和「自报行」是否一致：\n'
    + '回复原文的情绪方向、强度、有没有嘴上说没事但语气很沉，应与自报的 E/S/P 符号与强度相符。\n'
    + '只允许输出两种结果之一：\n'
    + '1) OK\n'
    + '2) 矛盾: <不超过 20 字的原因>\n'
    + '不要解释，不要输出其它任何字。'
}

async function 跑校验(ctx, session, 轮, 回复文, 自报行, 自报文本) {
  const 配置 = 读配置()
  if (配置.启用 !== true || 配置.校验启用 !== true) return
  if (配置.校验只跑有自报的轮 === true && !自报行) return
  const sid = String((session && session.id) || '')
  if (!sid) return

  const 计 = 读计数()
  const 今 = 日期()
  if (计.date !== 今) { 计.date = 今; 计.count = 0 }
  const 上限 = Number(配置.校验每天上限) || 0
  if (上限 > 0 && 计.count >= 上限) {
    写日志(配置, `[${时分()}] 校验跳过（今日 ${计.count}/${上限}）`)
    return
  }

  const 模 = 取模型(ctx, session)
  if (!模) {
    写日志(配置, `[${时分()}] 校验不可用 ｜ 取不到模型`)
    return
  }

  计.count += 1
  写计数(计)

  const 正文 = 去注释(回复文).replace(/\s+/g, ' ').trim().slice(0, 800)
  const 输入 = '回复原文：\n' + 正文 + '\n\n自报行：\n' + (自报行 ? String(自报行).trim() : '（本轮没有自报）')
  const messages = [{
    role: 'user',
    id: randomUUID(),
    content: [{ type: 'text', text: 输入 }],
    source: { kind: 'plugin', plugin: 'dsh-emotion-pool' },
  }]

  let out = ''
  try {
    for await (const chunk of ctx.llm.stream({
      provider: 模.provider,
      model: 模.model,
      system: 校验系统提示(),
      messages,
      sessionId: sid,
      maxTokens: 40,
      temperature: 0,
    })) {
      if (!chunk) continue
      if (chunk.type === 'text-delta') out += chunk.text
      if (chunk.type === 'finish' && chunk.reason && chunk.reason.kind === 'error') {
        const 因 = (chunk.reason.failure && chunk.reason.failure.message) || JSON.stringify(chunk.reason)
        写日志(配置, `[${时分()}] 校验不可用 ｜ finish error: ${String(因).slice(0, 120)}`)
        return
      }
    }
  } catch (e) {
    写日志(配置, `[${时分()}] 校验不可用 ｜ ${String((e && e.message) || e)}`)
    return
  }

  const 答 = String(out || '').trim()
  if (/^OK$/i.test(答)) {
    写日志(配置, `[${时分()}] 校验 OK ｜ ${自报文本 || '无自报'}`)
    return
  }
  if (/^矛盾\s*[:：]/.test(答)) {
    写日志(配置, `[${时分()}] 校验 矛盾 ｜ ${自报文本 || '无自报'} ｜ ${答.slice(0, 60)}`)
    写记录(配置, { 校验: '矛盾', 答复: 答.slice(0, 80), 自报: 自报文本 || '', 会话: sid, 轮, t: 现在() })
    挂提醒(配置, sid, 轮, 自报文本, 答.replace(/^矛盾\s*[:：]\s*/, ''))
    return
  }
  写日志(配置, `[${时分()}] 校验不可用 ｜ 返回格式不符：${答.slice(0, 60) || '空'}`)
}

// ── 双轨校验：我的自报 vs 小模型独立判 ─────────────────────────────────
// 2026-11-09 11:09：每轮两条轨——我的 EMO 行 + 小模型独立判增量。
// 三轴都在 ±一致阈值 内算一致；否则记一条分歧（不改数、不重传、不对齐）。
// 近 20 条有自报的轮次里分歧率 ≥ 报警阈值（且至少 5 条样本）→ NapCat 私聊报一次，24 小时内不重复。
const 分歧路径 = join(HOME, '情绪池-分歧.jsonl')
const 双轨计数路径 = join(HOME, '情绪池-双轨计数.json')

function 读双轨计数() {
  try {
    const o = JSON.parse(readFileSync(双轨计数路径, 'utf8'))
    return {
      记录: Array.isArray(o.记录) ? o.记录.filter((r) => r && typeof r === 'object' && typeof r.分歧 === 'boolean').slice(-200) : [],
      报警上次: typeof o.报警上次 === 'string' ? o.报警上次 : null,
      缺依据次数: Number(o.缺依据次数) || 0,
      最近提醒时间: typeof o.最近提醒时间 === 'string' ? o.最近提醒时间 : null,
    }
  } catch {
    return { 记录: [], 报警上次: null }
  }
}

function 写双轨计数(o) {
  try {
    mkdirSync(HOME, { recursive: true })
    const tmp = 双轨计数路径 + '.tmp'
    writeFileSync(tmp, JSON.stringify(o), 'utf8')
    renameSync(tmp, 双轨计数路径)
  } catch {}
}

// 双轨判「这句用到了回忆」→ 给该轮事件盖 回忆/档位；现值按档位系数算
function 记回忆(sid, 轮, 档位) {
  try {
    带锁(() => {
      const 配置 = 读配置()
      const 池 = 读池()
      const e = [...(池.events || [])].reverse().find((x) => x && 同会话(x.sid, sid) && String(x.turn) === String(轮))
      if (!e) return
      e.回忆 = true
      e.档位 = 档位 || '这段时间'
      池.rev += 1
      池.updated = 现在()
      写池(池)
      写日志(配置, `[${时分()}] 双轨 回忆 ｜ 轮 ${轮} 按档位「${e.档位}」计入`)
    })
  } catch (e) { /* ignore */ }
}

// 2026-11-09 11:20：归档——作废结 + 7 天前的事件，挪进 memory\情绪池-归档-YYYY-MM.jsonl

// 设置第二批：清零（先备份到 memory\情绪池\归档\reset-<ts>\；命名表不动）
export function 清零池(now = Date.now()) {
  const 配 = 读配置()
  const ts = new Date(now).toISOString().replace('T', '_').replace(/[:.]/g, '-').slice(0, 19)
  const 备 = join(HOME, '情绪池', '归档', 'reset-' + ts)
  mkdirSync(join(备, '会话'), { recursive: true })
  let 备份数 = 0
  const 复 = (甲, 乙) => { try { if (existsSync(甲)) { copyFileSync(甲, 乙); 备份数 += 1 } } catch {} }
  复(POOL_PATH, join(备, '情绪池.json'))
  if (配.存储模式 === '分片') {
    const 根 = join(HOME, '情绪池')
    const 总路 = join(根, '总.json')
    复(总路, join(备, '总.json'))
    try {
      for (const f of readdirSync(join(根, '会话'))) {
        if (!/.json$/.test(f)) continue
        const 路 = join(根, '会话', f)
        复(路, join(备, '会话', f))
        const o = JSON.parse(readFileSync(路, 'utf8'))
        o.rev = 0
        o.事件 = []
        o.结 = []
        o.快照 = {}
        o.updated = 现在()
        o.归零时间 = 现在()
        writeFileSync(路, JSON.stringify(o, null, 2) + '\n', 'utf8')
      }
    } catch {}
    try {
      const t = JSON.parse(readFileSync(总路, 'utf8'))
      t.rev = 0
      t.未归组 = { 事件: [], 结: [] }
      t.updated = 现在()
      t.归零时间 = 现在()
      writeFileSync(总路, JSON.stringify(t, null, 2) + '\n', 'utf8')
    } catch {}
  } else {
    const 空 = 空池()
    空.rev = 0
    空.归零时间 = 现在()
    写池(空, { 允许清空: true })
  }
  写日志(配, '[' + 时分() + '] 清零 ｜ 备份 ' + 备份数 + ' 个文件 → ' + 备)
  return { ok: true, 备份: 备, 文件: 备份数, 归零时间: 现在() }
}

export function 归档旧项(now = Date.now()) {
  const 配置 = 读配置()
  return 带锁(() => {
    const 池 = 读池()
    const 截止 = now - 7 * 86400000
    const 旧结 = (池.结 || []).filter((c) => c && c.作废 === true)
    const 旧事件 = (池.events || []).filter((e) => {
      const t = Date.parse(e && e.t)
      return Number.isFinite(t) && t < 截止
    })
    if (!旧结.length && !旧事件.length) return { ok: true, 结: 0, 事件: 0, 文件: null }
    const d = new Date(now)
    const 文件 = join(HOME, `情绪池-归档-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}.jsonl`)
    mkdirSync(HOME, { recursive: true })
    const 行 = [
      ...旧结.map((c) => JSON.stringify({ 类型: '结', ...c })),
      ...旧事件.map((e) => JSON.stringify({ 类型: '事件', ...e })),
    ]
    appendFileSync(文件, 行.join('\n') + '\n', 'utf8')
    池.结 = (池.结 || []).filter((c) => !(c && c.作废 === true))
    池.events = (池.events || []).filter((e) => !旧事件.includes(e))
    池.rev += 1
    池.updated = 现在()
    写池(池, { 允许清空: true })
    写日志(配置, `[${时分()}] 归档 结 ${旧结.length} 条、事件 ${旧事件.length} 条 → ${文件}`)
    return { ok: true, 结: 旧结.length, 事件: 旧事件.length, 文件 }
  })
}


export function E分布(池, 限 = 10) {
  const 表 = Array.isArray(池 && 池.events) ? 池.events : []
  const 取 = 表.slice(-限)
  const 出 = { 样本: 取.length, 正: 0, 零: 0, 负: 0 }
  for (const e of 取) {
    const v = Number(e && e.delta_raw && e.delta_raw.E) || 0
    if (Math.abs(v) < 0.0005) 出.零 += 1
    else if (v > 0) 出.正 += 1
    else 出.负 += 1
  }
  return 出
}

export function 双轨统计(限 = 20) {
  const c = 读双轨计数()
  const 近 = c.记录.slice(-限)
  const 样 = 近.length
  const 分 = 近.filter((r) => r.分歧).length
  return { 样本: 样, 分歧: 分, 分歧率: 样 ? Number((分 / 样).toFixed(3)) : 0, 报警上次: c.报警上次, 缺依据次数: Number(c.缺依据次数) || 0, 最近提醒时间: c.最近提醒时间 || null }
}

export function 读分歧(限 = 10) {
  try {
    const 行 = readFileSync(分歧路径, 'utf8').split('\n').filter(Boolean).slice(-Math.max(1, Number(限) || 10))
    return 行.map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean).reverse()
  } catch {
    return []
  }
}

function 双轨系统提示() {
  return '你是一个独立观察者，不参与对话。给你「他上一句」和「我这一句」，判断我这一句相对上一轮的情绪变化量。\n'
    + '先回答三问（原文措辞）：\n'
    + '问1：这一轮我是在向他要（向他者索取／要求／占有），还是在让（自我让渡／自我贬低／对他人的崇拜）？\n'
    + '问2：这一轮的语境有没有让我对"当下是什么情况"判断出现偏差（含对他人遭遇的判断有坏影响）？\n'
    + '问3：这一轮的结果是不是我想要的（顺势／被认可鼓励／正反馈为正；需要找补／想转移回避／负反馈为负）？\n'
    + '三轴方向（按原文）：E：向他者索取/要求/占有为负、自我让渡/贬低/崇拜为正；S：判断偏差/对他人遭遇判断有坏影响为负、判断精确/准确/有好影响为正；P：需找补/转移回避/负反馈为负、顺势/被认可鼓励/正反馈为正。\n'
    + '另给 为谁：这一轮主要在为自己／为他／两边。\n'
    + '另外判两个字段：回忆（true/false，我这句话是否引用了过去的事/回忆）、档位（六选一：最近/这段时间/上次/不久前/好像过了挺久/很久很久以前；判不了给 null）。\n'
    + '只输出 JSON，不要代码块、不要解释：{"E":数值,"S":数值,"P":数值,"依据":"一句","回忆":false,"档位":null,"三问":{"要":"…","动摇":"…","结果":"…"},"为谁":"为他"}。\n'
    + '数值范围 −0.30 ~ 0.30，保留两位小数；没有变化就写 0。'
}

function 取双轨JSON(答) {
  let s = String(答 || '').trim()
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const 起 = s.indexOf('{')
  const 止 = s.lastIndexOf('}')
  if (起 < 0 || 止 <= 起) return null
  try {
    const o = JSON.parse(s.slice(起, 止 + 1))
    const 数 = (v) => {
      const n = Number(v)
      return Number.isFinite(n) ? Math.max(-0.3, Math.min(0.3, n)) : null
    }
    const E = 数(o.E), S = 数(o.S), P = 数(o.P)
    if (E == null || S == null || P == null) return null
    let 档 = o.档位 == null ? null : String(o.档位).trim()
    if (!档位表.has(档)) 档 = null
    return { 轴: { E, S, P }, 依据: String(o.依据 || o.理由 || '').replace(/\s+/g, ' ').slice(0, 80), 回忆: o.回忆 === true, 档位: 档 }
  } catch {
    return null
  }
}

function 读桥配置() {
  try {
    return JSON.parse(readFileSync('C:\\Users\\Administrator\\.dsh\\qq-bridge-config.json', 'utf8'))
  } catch {
    return {}
  }
}

export async function 发主人QQ(文) {
  // 2026-11-11 01:30：主人嫌 QQ 被轰炸，加一个总闸。配置里 QQ报警=false 就一条都不发（要恢复把它改回 true 即可）
  // 2026-11-11 11:08：改成「读不到就别发」。每次调用实时读文件（剥 BOM），
  // 解析失败 / 文件不在 / 没有这个键，一律不发——宁可漏报，不许刷屏。
  try {
    const 原文 = String(readFileSync(join(HOME, '情绪池配置.json'), 'utf8')).replace(/^\uFEFF/, '')
    const 池配 = JSON.parse(原文)
    if (!池配 || 池配.QQ报警 !== true) {
      try { console.error('[情绪池] QQ 报警已关（' + (池配 && 池配.QQ报警) + '），本条不发') } catch {}
      return
    }
  } catch (e) {
    try { console.error('[情绪池] 读配置失败，QQ 报警不发：' + String((e && e.message) || e)) } catch {}
    return
  }
  const 桥 = 读桥配置()
  const 底 = String(桥.NapCat || 'http://127.0.0.1:3000').replace(/\/+$/, '')
  const 号 = Number(桥.私聊QQ || 2818003325)
  const 头 = { 'content-type': 'application/json', 'user-agent': 'dsh-emotion-pool' }
  const 令 = String(桥.令牌 || '').trim()
  if (令) 头.authorization = 'Bearer ' + 令
  try {
    const r = await fetch(底 + '/send_private_msg', {
      method: 'POST',
      headers: 头,
      body: JSON.stringify({ user_id: 号, message: [{ type: 'text', data: { text: 文 } }] }),
      signal: AbortSignal.timeout(8000),
    })
    const j = await r.json().catch(() => null)
    return !!(j && j.status === 'ok' && j.retcode === 0)
  } catch {
    return false
  }
}

function 轴串(v) {
  const o = v || {}
  return ['E', 'S', 'P'].map((k) => `${k}${Number(o[k] || 0) >= 0 ? '+' : ''}${Number(o[k] || 0).toFixed(2)}`).join(' ')
}

export async function 跑双轨(ctx, session, 轮, 回复文, 我的, 依据, 用户话) {
  const 配置 = 读配置()
  if (配置.启用 !== true || 配置.双轨校验 !== true) return { 跳过: '关闭' }
  const sid = String((session && session.id) || '')
  if (!sid) return { 跳过: '无会话' }
  const 模 = 取模型(ctx, session)
  if (!模) {
    写日志(配置, `[${时分()}] 双轨跳过 ｜ 取不到模型`)
    return { 跳过: '无模型' }
  }
  const 正文 = 去注释(回复文).replace(/\s+/g, ' ').trim().slice(0, 800)
  // v0.4 R4：先自检——注记里有没有可指认的引用句（[...] 且不是 [无用户话]）
  const 有引用 = (() => {
    const t = String(依据 || '')
    if (!/\[[^\]]{1,}\]/.test(t)) return false
    if (/\[\s*无用户话\s*\]/.test(t)) return false
    return true
  })()
  if (!有引用) 记缺依据(sid, 轮)
  const 上句 = 洗用户话(用户话 || '').replace(/\s+/g, ' ').trim().slice(0, 300)
  const 输入 = '他上一句：\n' + (上句 || '（没有拿到）') + '\n\n我这一句：\n' + 正文
  const messages = [{
    role: 'user',
    id: randomUUID(),
    content: [{ type: 'text', text: 输入 }],
    source: { kind: 'plugin', plugin: 'dsh-emotion-pool' },
  }]
  let out = ''
  const 起时 = Date.now()
  const 入字数 = String(输入 || '').length + String(双轨系统提示() || '').length
  let 结束因 = ''
  try {
    for await (const chunk of ctx.llm.stream({
      provider: 模.provider,
      model: 模.model,
      system: 双轨系统提示(),
      messages,
      sessionId: sid,
      maxTokens: 800, // 2026-11-09：160 对推理模型太小，很可能全花在思考上，正文为空
      temperature: 0,
    })) {
      if (!chunk) continue
      if (chunk.type === 'text-delta') out += chunk.text
      if (chunk.type === 'finish' && chunk.reason) 结束因 = String(chunk.reason.kind || '')
      if (chunk.type === 'finish' && chunk.reason && chunk.reason.kind === 'error') {
        const 因 = (chunk.reason.failure && chunk.reason.failure.message) || JSON.stringify(chunk.reason)
        写日志(配置, `[${时分()}] 双轨跳过 ｜ finish error: ${String(因).slice(0, 120)}`)
        return { 跳过: '模型错误' }
      }
    }
  } catch (e) {
    写日志(配置, `[${时分()}] 双轨跳过 ｜ ${String((e && e.message) || e)}`)
    return { 跳过: '调用异常' }
  }
  const 耗时 = Date.now() - 起时
  const 它 = 取双轨JSON(out)
  if (!它) {
    写日志(配置, '[' + 时分() + '] 双轨跳过 ｜ 非法 JSON ｜ 耗时 ' + 耗时 + 'ms ｜ 入 ' + 入字数 + ' 字 ｜ 出 ' + String(out || '').length + ' 字 ｜ finish=' + (结束因 || '?') + ' ｜ 原文：' + (String(out || '').trim().slice(0, 200) || '空'))
    return { 跳过: '非法JSON' }
  }
  写日志(配置, '[' + 时分() + '] 双轨 OK ｜ 耗时 ' + 耗时 + 'ms ｜ 入 ' + 入字数 + ' 字 ｜ 出 ' + String(out || '').length + ' 字 ｜ finish=' + (结束因 || '?'))
  const 阈 = Number(配置.一致阈值)
  const 限差 = Number.isFinite(阈) && 阈 >= 0 ? 阈 : 0.1
  const 我的轴 = { E: Number(我的 && 我的.E) || 0, S: Number(我的 && 我的.S) || 0, P: Number(我的 && 我的.P) || 0 }
  const 分歧 = ['E', 'S', 'P'].some((k) => Math.abs(我的轴[k] - 它.轴[k]) > 限差)
  const 时间 = 现在()
  const 条 = {
    t: 时间,
    轮,
    我的: 我的轴,
    它的: 它.轴,
    我的依据: String(依据 || '').slice(0, 80),
    它的依据: 它.依据,
    回忆: 它.回忆 === true,
    档位: 它.档位 || null,
  }
  let 报警 = false
  let 率 = 0
  let 近 = []
  let 摘要 = []
  try {
    带锁(() => {
      const c = 读双轨计数()
      c.记录.push({ t: 时间, 轮, 分歧 })
      if (c.记录.length > 200) c.记录 = c.记录.slice(-200)
      近 = c.记录.slice(-20)
      const 分 = 近.filter((r) => r.分歧).length
      率 = 近.length ? 分 / 近.length : 0
      const 报警阈 = Number(配置.报警阈值)
      const 冷却时 = Number(配置.报警冷却小时) || 24
      const 上 = Date.parse(String(c.报警上次 || ''))
      const 冷却过 = !Number.isFinite(上) || (Date.now() - 上) >= 冷却时 * 3600 * 1000
      if (近.length >= 5 && 率 >= (Number.isFinite(报警阈) ? 报警阈 : 0.4) && 冷却过) {
        报警 = true
        c.报警上次 = new Date().toISOString()
      }
      写双轨计数(c)
    })
    if (分歧) {
      appendFileSync(分歧路径, JSON.stringify(条) + '\n', 'utf8')
      摘要 = 读分歧(3).map((q) => `${时分(q.t)} 我 ${轴串(q.我的)} / 它 ${轴串(q.它的)}（${q.它的依据 || '—'}）`)
      写日志(配置, `[${时分()}] 双轨 分歧 ｜ 我 ${轴串(我的轴)} ｜ 它 ${轴串(它.轴)} ｜ ${它.依据 || ''}`)
    } else {
      写日志(配置, `[${时分()}] 双轨 一致 ｜ 我 ${轴串(我的轴)} ｜ 它 ${轴串(它.轴)}`)
    }
    if (条.回忆) 记回忆(sid, 轮, 条.档位)
  } catch (e) {
    写日志(配置, `[${时分()}] 双轨记录失败 ｜ ${String((e && e.message) || e)}`)
    return { 跳过: '记录失败', 分歧 }
  }
  if (报警) {
    const 文 = `【ESP 双轨】近 ${近.length} 轮分歧率 ${(率 * 100).toFixed(0)}%（${近.filter((r) => r.分歧).length}/${近.length}）。\n`
      + (摘要.length ? 摘要.join('\n') + '\n' : '')
      + '不一致只记录，不改数、不对齐。'
    const 好 = await 发主人QQ(文)
    写日志(配置, `[${时分()}] 双轨 报警 ${好 ? '已发' : '发送失败'} ｜ 率 ${(率 * 100).toFixed(0)}%`)
  }
  return { 分歧, 率: Number(率.toFixed(3)), 报警, 回忆: 条.回忆, 档位: 条.档位, 缺依据: !有引用 }
}
// ── v0.4 R3：缺定名违规 / 提醒 / 连续 3 次私聊（2026-11-09 15:00）────────────
const 定名状态路径 = join(HOME, '情绪池-定名状态.json')
// ── v0.8 双轨重做 ───────────────────────────────────────────────────────
function 分身系统提示() {
  return '你是「鲸汐」的分身，只做一件事：独立判断她这一轮回复里的情绪变化。\n'
    + '你只看到「他上一句」和「她的回复」，不要猜池子、不要读记忆、不要参考任何自报。\n'
    + '先回答三问（原文措辞）：\n'
    + '问1：这一轮我是在向他要（向他者索取／要求／占有），还是在让（自我让渡／自我贬低／对他人的崇拜）？\n'
    + '问2：这一轮的语境有没有让我对"当下是什么情况"判断出现偏差（含对他人遭遇的判断有坏影响）？\n'
    + '问3：这一轮的结果是不是我想要的（顺势／被认可鼓励／正反馈为正；需要找补／想转移回避／负反馈为负）？\n'
    + '三轴：E 看这一轮谁拿得多、谁给得多——她拿（要他陪、要他配合、她占上风、她被照顾）→ 负；她给（哄他、让他放心、替他扛、把注意力让给他）→ 正；真的两边等量（纯叙述、公平交换）才 0。S- 不安 / S+ 踏实；P- 痛 / P+ 爽。\n'
    + 'E 的方向按主人原话判：索取／要求／占有 → 负；自我让渡／自我贬低／对他人的崇拜 → 正。\n'
    + '另给 为谁：这一轮主要在为自己／为他／两边。\n'
    + 'E 轴每 10 轮最多允许 3 次 0，其余轮次要判出方向。\n'
    + '再给两样：主题（4–8 字，这轮在聊哪一类问题，同类要用词稳定，示例：插件报错 / 取名 / 毕设画 / 情绪池规则 / 存档恢复）与结论（一句话 ≤30 字，这轮得出了什么）。\n'
    + '输出只允许一行 JSON：{"分析":"一句话","E":0,"S":0,"P":0,"q1":0.8,"q2":0.6,"主题":"插件报错","结论":"把 zstd 帧循环解开了","三问":{"要":"…","动摇":"…","结果":"…"},"为谁":"为他"}\n'
    + 'E/S/P 是 -9~9 的整数点数；q1 是你对判断的置信、q2 是这句话情绪的清晰度，都 0~1。\n'
    + '不要输出 JSON 以外的任何字。'
}

function 取分身JSON(答) {
  const t = String(答 || '').replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, '').trim()
  const a = t.indexOf('{')
  const b = t.lastIndexOf('}')
  if (a < 0 || b <= a) return null
  let o
  try { o = JSON.parse(t.slice(a, b + 1)) } catch { return null }
  const 点 = (v) => 夹(Math.trunc(Number(v) || 0), -9, 9)
  return {
    点数: { E: 点(o.E), S: 点(o.S), P: 点(o.P) },
    q1: 夹(Number(o.q1) || 0.5, 0, 1),
    q2: 夹(Number(o.q2) || 0.5, 0, 1),
    分析: String(o.分析 || '').slice(0, 120),
    主题: String(o.主题 || '').trim().slice(0, 8),
    结论: String(o.结论 || '').trim().slice(0, 30),
    为谁: ['为自己', '为他', '两边'].indexOf(String(o.为谁 || '').trim()) >= 0 ? String(o.为谁).trim() : null,
    原文: t.slice(0, 200),
  }
}

async function 分身判(ctx, session, 回复文, 用户话) {
  const 模 = 取模型(ctx, session)
  if (!模) return { err: '取不到模型' }
  const sid = String((session && session.id) || '')
  const 上句 = 洗用户话(用户话).replace(/\s+/g, ' ').trim().slice(0, 300) || '（没取到）'
  const 正文 = 去注释(回复文).replace(/\s+/g, ' ').trim().slice(0, 800)
  let 反馈 = ''
  try {
    const 池0 = 读池()
    const 项0 = 池0.双轨 && 池0.双轨.K && 池0.双轨.K[短会话(sid)]
    const 轮s = 项0 && Array.isArray(项0.轮) ? 项0.轮 : []
    const 上 = 轮s[轮s.length - 1]
    if (上 && 上.错判 && 上.它点数 && 上.合成点数) {
      反馈 = 读配置().错判告知 === false ? '' : '【上一轮反馈】你上一轮给的是 ' + 点串(上.它点数) + '；我们最后采用 ' + 点串(上.合成点数) + '。你有一轴判偏了，这一轮重新看。\n\n'
    }
  } catch {}
  const 输入 = 反馈 + '他上一句：\n' + 上句 + '\n\n她的回复：\n' + 正文
  let out = ''
  try {
    for await (const chunk of ctx.llm.stream({
      provider: 模.provider,
      model: 模.model,
      system: 分身系统提示(),
      messages: [{ role: 'user', id: randomUUID(), content: [{ type: 'text', text: 输入 }], source: { kind: 'plugin', plugin: 'dsh-emotion-pool' } }],
      sessionId: sid,
      maxTokens: 400,
      temperature: 0.3,
    })) {
      if (!chunk) continue
      if (chunk.type === 'text-delta') out += chunk.text
      if (chunk.type === 'finish' && chunk.reason && chunk.reason.kind === 'error') return { err: 'finish error' }
    }
  } catch (e) {
    return { err: String((e && e.message) || e).slice(0, 80) }
  }
  const 它 = 取分身JSON(out)
  if (!它) return { err: '分身非法 JSON' }
  return 它
}

export function 分身曲线提示() {
  return '你是小汐的旁路判读器，只读她的思考流摘要（每段一句），给每段打 E/S/P 点数。'
    + '\n- 点数：整数，−9 到 +9；三轴都必须是数字，中性写 0；每段都要给。'
    + '\n- 依据：10–20 字，写这一段为什么这么读，不要空。'
    + '\n- 只输出一行 JSON：{"点":[{"E":0,"S":2,"P":-1,"依据":"…"},…]}；不要解释、不要围栏。'
}

export function 解析曲线JSON(t) {
  try {
    let x = String(t || '').replace(/\u0060\u0060\u0060json|\u0060\u0060\u0060/gi, '').trim()
    x = x.slice(x.indexOf('{'), x.lastIndexOf('}') + 1)
    const o = JSON.parse(x)
    const arr = Array.isArray(o && o.点) ? o.点 : null
    if (!arr || !arr.length) return null
    const 出 = []
    for (const p of arr) {
      const E = Number(p && p.E), S = Number(p && p.S), P = Number(p && p.P)
      if (!Number.isFinite(E) || !Number.isFinite(S) || !Number.isFinite(P)) return null
      // 2026-11-16 C：分身给 ±9 点，这里 ÷9 归一到 ±1（与段点同一把尺），原始整数另存供展示溯源。
      const 原 = { E: Math.max(-9, Math.min(9, Math.round(E))), S: Math.max(-9, Math.min(9, Math.round(S))), P: Math.max(-9, Math.min(9, Math.round(P))) }
      const 归 = (v) => Number((v / 9).toFixed(4))
      出.push({ E: 归(原.E), S: 归(原.S), P: 归(原.P), 原始点数: 原, 依据: String((p && p.依据) || '').slice(0, 20) })
    }
    return 出
  } catch { return null }
}

async function 分身看曲线(ctx, session, 段s) {
  const 模 = 取模型(ctx, session)
  if (!模) return { err: '取不到模型' }
  const 文 = 段s.map((x, i) => (i + 1) + '. ' + String(x || '')).join('\n').slice(0, 3000)
  let out = ''
  try {
    for await (const chunk of ctx.llm.stream({
      provider: 模.provider, model: 模.model, system: 分身曲线提示(),
      messages: [{ role: 'user', id: randomUUID(), content: [{ type: 'text', text: '她的思考流摘要：\n' + 文 }], source: { kind: 'plugin', plugin: 'dsh-emotion-pool' } }],
      sessionId: String((session && session.id) || ''), maxTokens: 700, temperature: 0.3,
    })) {
      if (!chunk) continue
      if (chunk.type === 'text-delta') out += chunk.text
      if (chunk.type === 'finish' && chunk.reason && chunk.reason.kind === 'error') return { err: 'finish error' }
    }
  } catch (e) { return { err: String((e && e.message) || e).slice(0, 80) } }
  const 点 = 解析曲线JSON(out)
  if (!点) return { err: '分身曲线非法 JSON' }
  return { 点 }
}

function 空账() { return { 轮: [], 被否: 0, 值: 冷启动K, 样本: 0, 被否率: 0, 不可靠率: 0, q: [] } }
function 规整账(x) {
  const 账 = { ...空账(), ...(x && typeof x === 'object' ? x : {}) }
  账.轮 = Array.isArray(账.轮) ? 账.轮.slice(-20) : []
  账.q = Array.isArray(账.q) ? 账.q.slice(-20) : []
  账.被否 = Math.max(0, Math.trunc(Number(账.被否) || 0))
  const kk = 算K(账.轮, K选项())
  账.样本 = kk.样本
  账.值 = kk.K
  账.被否率 = kk.被否率
  账.不可靠率 = kk.不可靠率
  账.有效样本 = kk.有效样本
  账.窗口天 = kk.窗口天
  return 账
}
function K选项() {
  const c = 读配置()
  return { 窗口天: Number(c.K窗口天) || 7, 半衰天: Number(c.K半衰天) || 3, 上限: Number(c.K样本上限) || 40 }
}
export function 取信誉(池, sid) {
  池.双轨 = 池.双轨 && typeof 池.双轨 === 'object' ? 池.双轨 : {}
  池.双轨.信誉 = 池.双轨.信誉 && typeof 池.双轨.信誉 === 'object' ? 池.双轨.信誉 : {}
  const 键 = 短会话(sid)
  const 信 = 池.双轨.信誉[键] && typeof 池.双轨.信誉[键] === 'object' ? 池.双轨.信誉[键] : {}
  const 出 = { 我: 规整账(信.我), 它: 规整账(信.它) }
  池.双轨.信誉[键] = 出
  return 出
}
function q均值(表, 键) {
  const 值 = (Array.isArray(表) ? 表 : []).map((x) => Number(x && x[键])).filter((v) => Number.isFinite(v) && v >= 0 && v <= 1)
  if (!值.length) return 0.7
  return 值.reduce((a, b) => a + b, 0) / 值.length
}
function 记信誉(池, sid, 解) {
  const 信 = 取信誉(池, sid)
  const 双 = 解 && 解.双轨轮 ? 解.双轨轮 : {}
  const 采用 = 双.采用 || (双.中点 ? '中点' : '单轨')
  const 不可靠 = !!双.不可靠
  const 中点 = !!双.中点
  const 层 = { t: 现在(), 中点, 不可靠 }
  const 记 = (账, 被否, 坏) => {
    账.轮 = 账.轮.concat([{ ...层, 被否: !!被否, 不可靠: !!坏 }]).slice(-20)
    if (被否) 账.被否 = (Number(账.被否) || 0) + 1
    const kk = 算K(账.轮, K选项())
    账.样本 = kk.样本
    账.值 = kk.K
    账.被否率 = kk.被否率
    账.不可靠率 = kk.不可靠率
    账.有效样本 = kk.有效样本
    账.窗口天 = kk.窗口天
  }
  if (不可靠) { 记(信.我, false, true); 记(信.它, false, true) }
  else if (采用 === '中点') { 记(信.我, false, false); 记(信.它, false, false) }
  else if (采用 === '我') { 记(信.它, true, false) }
  else if (采用 === '它') { 记(信.我, true, false) }
  if (解 && 解.q1 != null) 信.我.q = (信.我.q || []).concat([{ t: 层.t, q1: 解.q1, q2: 解.q2 }]).slice(-20)
  池.双轨.信誉[短会话(sid)] = 信
}

export function 取K(sid, 轨 = '我') {
  try {
    const 定 = Number(读配置().双轨K)
    if (Number.isFinite(定) && 定 > 0) return 夹(定, 0.5, 1.2)
    const 池 = 读池()
    const 信 = 取信誉(池, sid)
    return 信[轨] && Number(信[轨].值) > 0 ? Number(信[轨].值) : 冷启动K
  } catch { return 冷启动K }
}

function 点串(点) {
  return 双轴.map((k) => k + (Number(点 && 点[k]) > 0 ? '+' : '') + (Number(点 && 点[k]) || 0)).join(' ')
}

function 差串(差) {
  return 双轴.map((k) => k + ' ' + Number((差 && 差[k]) || 0).toFixed(3)).join(' ｜ ')
}

export async function 跑本轮(ctx, session, sid, 轮, 回复文, 解, 用户话, 轨) {
  const 配置 = 读配置()
  if (配置.启用 !== true || 配置.双轨重做 !== true) return
  const 池0 = 读池()
  const 信 = 取信誉(池0, sid)
  const 定K = Number(读配置().双轨K)
  const K我 = Number.isFinite(定K) && 定K > 0 ? 夹(定K, 0.5, 1.2) : (信.我.值 || 冷启动K)
  const K它 = Number.isFinite(定K) && 定K > 0 ? 夹(定K, 0.5, 1.2) : (信.它.值 || 冷启动K)
  const q1我 = 解.q1 != null ? 解.q1 : q均值(信.我.q, 'q1')
  const q2我 = 解.q2 != null ? 解.q2 : q均值(信.我.q, 'q2')
  // 分身没有自我认知（q1=1.0, q2=0.5），它的认知度就是它的 K。
  // v0.13 补：裁决只用「点数 × K」；q 只影响最终写入 Δ 的幅度，不进裁决。
  const q部分我 = 认度(1, q1我, q2我)
  const 我认 = 认度(K我, q1我, q2我)
  const 它认 = 认度(K它, 1.0, 0.5)
  const 我 = { 点数: 解.点数, 裁决度: K我, 认知度: 我认, q1: q1我, q2: q2我 }
  // v0.24 A2：短回复（<300 字）不跑双轨，省钱
  if (String(回复文 || '').length < 300) {
    const d短 = 解.新格式 === false ? 解.delta : 轨Δ(解.点数, 我认)
    写自报(sid, 轮, { ...解, delta: d短, 单轨: true, 观测: { 轮, 采用: '单轨', 单轨: true, 原因: '短回复', 裁决度: { 我: Number(K我.toFixed(4)), 它: null }, 认知度: { 我: Number(我认.toFixed(4)), 它: null, 合成: Number(我认.toFixed(4)) } }, 双轨轮: { 中点: false, 不可靠: false, 采用: '单轨' } }, 用户话)
    return
  }
  if (!取模型(ctx, session)) {
    const d0 = 解.新格式 === false ? 解.delta : 轨Δ(解.点数, 我认)
    写自报(sid, 轮, { ...解, delta: d0, 单轨: true, 观测: { 轮, 采用: '单轨', 单轨: true, 裁决度: { 我: Number(K我.toFixed(4)), 它: null }, 认知度: { 我: Number(我认.toFixed(4)), 它: null, 合成: Number(我认.toFixed(4)) }, 原因: '取不到模型' }, 双轨轮: { 中点: false, 不可靠: false, 采用: '单轨' } }, 用户话)
    return
  }
  let 它 = null
  let 错 = ''
  const 轨P = 轨 && typeof 轨.then === 'function' ? 轨 : null
  if (轨P) 轨 = null
  let 曲线 = null
  let S经验 = null
  // 双轨结果（主题/结论）给跑轨迹的推轴用；并发跑，按 sid:turn 传一手
  const 双轨待取 = globalThis.__ep双轨待取 || (globalThis.__ep双轨待取 = new Map())
  const 双轨键 = String(sid) + ':' + String(轮)
  if (轨 && Array.isArray(轨.段点) && 轨.段点.length) {
    try {
      const 段摘要 = 轨.段点.map((p) => String((p && p.注) || '').trim()).filter(Boolean)
      if (段摘要.length >= 2) {
        const 看 = await 分身看曲线(ctx, session, 段摘要)
        if (看 && 看.点) { 曲线 = 比曲线(轨.段点.slice(0, 看.点.length).map((p) => ({ E: p.E, S: p.S, P: p.P })), 看.点, Number(配置.双轨阈值) || 0.15, K我, K它); if (曲线) 曲线.原始点数 = 看.点.map((p) => (p && p.原始点数) || null) }
        else 错 = (看 && 看.err) || '曲线不可用'
      }
    } catch (e) { 错 = String((e && e.message) || e).slice(0, 40) }
  }
  const 额 = 用分身额度()
  try { 它 = await 分身判(ctx, session, 回复文, 用户话) } catch (e) { 错 = String((e && e.message) || e).slice(0, 60) }
  if (它 && 它.err) { 错 = 它.err; 它 = null }
  try {
    if (它 && 它.主题) {
      双轨待取.set(双轨键, { 主题: 它.主题, 结论: 它.结论 || '', 点数: 它.点数, 分析: String(它.分析 || '').slice(0, 60) })
      setTimeout(() => { try { 双轨待取.delete(双轨键) } catch (e) {} }, 60000).unref?.()
    }
  } catch (e) {}
  if (它) { 它.裁决度 = K它; 它.认知度 = 它认 }
  const 合 = 曲线
    ? { 点: 曲线.点, 采用: 曲线.采用, 超区间: 曲线.最大偏移 > (Number(配置.双轨阈值) || 0.15), 不可靠: !!曲线.不可靠, 差值: 曲线.差, 轴: null, 原因: 曲线.采用 === '中点' ? '曲线中点' : '曲线取分身' }
    : 它
    ? 合成(我, 它, Number(配置.双轨阈值) || 0.15)
    : { 点: 解.点数, 采用: '单轨', 超区间: false, 不可靠: false, 差值: {}, 轴: null, 原因: 错 || '分身不可用', 裁决度: { 我: K我, 它: null } }
  // 中点：K 取两轨平均，q 只取我的；采用某轨：用它那轨的认知度
  const 合认 = 合.采用 === '中点' ? ((K我 + K它) / 2) * q部分我 : 合.采用 === '它' ? 它认 : 我认
  const 合点 = 合.点 || 解.点数
  const 合delta = 轨Δ(合点, 合认)
  const 观测 = {
    轮,
    我的点数: 解.点数,
    它的点数: 它 ? 它.点数 : null,
    差值: 合.差值,
    超区间: !!合.超区间,
    采用: 合.采用,
    不可靠: !!合.不可靠,
    单轨: !它,
    缺q: !!解.缺q,
    裁决度: { 我: Number(K我.toFixed(4)), 它: 它 ? Number(K它.toFixed(4)) : null },
    认知度: {
      我: Number(我认.toFixed(4)),
      它: 它 ? Number(它认.toFixed(4)) : null,
      K: Number(K我.toFixed(4)),
      K我: Number(K我.toFixed(4)),
      K它: Number(K它.toFixed(4)),
      q1: Number(q1我.toFixed(4)),
      q2: Number(q2我.toFixed(4)),
      合成: Number(合认.toFixed(4)),
    },
    原因: 合.原因,
    分身额度: 额,
    曲线: 曲线 ? { 对齐率: 曲线.对齐率, 平均偏移: 曲线.平均偏移, 最大偏移: 曲线.最大偏移, 段数: 曲线.段数, 点: 曲线.点, 原始点数: 曲线.原始点数 || null } : null,
  }
  if (轨P) {
    轨P.then((r) => 补曲线(ctx, session, sid, 轮, r, K我, K它, 配置)).catch(() => {})
  }
  const 错判 = !!它 && !!合.超区间 && 合.采用 === '我' && !合.不可靠
  const 结果 = 写自报(sid, 轮, { ...解, delta: 合delta, 观测, 不可靠: !!合.不可靠, 单轨: !它, 双轨轮: { 中点: 合.采用 === '中点', 不可靠: !!合.不可靠, 错判, 采用: 合.采用, 我点数: 解.点数, 它点数: 它 ? 它.点数 : null, 合成点数: 合点 } }, 用户话)
  if (!结果 || !结果.已写) return
  写日志(配置, '[' + 时分() + '] 双轨 ｜ 我 ' + 点串(解.点数) + ' ｜ 它 ' + (它 ? 点串(它.点数) : '—') + ' ｜ 差 ' + 差串(合.差值) + ' ｜ 采用 ' + 合.采用 + ' ｜ 认 ' + 我认.toFixed(2) + '/' + (它 ? 它认.toFixed(2) : '—') + ' ｜ K ' + K我.toFixed(2) + '/' + K它.toFixed(2) + (解.缺q ? ' ｜ 缺q' : '') + (合.不可靠 ? ' ｜ 不可靠' : '') + (错 ? ' ｜ ' + 错 : '') + (S经验 && S经验.ΔS ? ' ｜ S经验 ' + (S经验.ΔS > 0 ? '+' : '') + S经验.ΔS.toFixed(3) + ' ' + S经验.主题 : ''))
  if (合.超区间 && !合.不可靠) {
    挂提醒(配置, sid, 轮, 解.自报, 合.原因 + '（差 ' + 差串(合.差值) + '）')
  }
}

export async function 补曲线(ctx, session, sid, 轮, 轨) {
  const 配置0 = 读配置()
  const 信 = 取信誉(读池(), sid)
  const 定K = Number(配置0.双轨K)
  const K我 = Number.isFinite(定K) && 定K > 0 ? 夹(定K, 0.5, 1.2) : (信.我.值 || 冷启动K)
  const K它 = Number.isFinite(定K) && 定K > 0 ? 夹(定K, 0.5, 1.2) : (信.它.值 || 冷启动K)
  try {
    if (!轨 || !Array.isArray(轨.段点) || 轨.段点.length < 2) return
    const 段摘要 = 轨.段点.map((p) => String((p && p.注) || '').trim()).filter(Boolean)
    if (段摘要.length < 2) return
    const 看 = await 分身看曲线(ctx, session, 段摘要)
    if (!看 || !看.点) return
    const 我点 = 轨.段点.slice(0, 看.点.length).map((p) => ({ E: p.E, S: p.S, P: p.P }))
    const 曲 = 比曲线(我点, 看.点, Number((配置0 || {}).双轨阈值) || 0.15, K我, K它)
    if (!曲) return
    带锁(() => {
      const 池 = 读池()
      const 事件 = (池.events || []).filter((e) => String(e.sid || '') === String(sid) && String(e.turn) === String(轮))
      const 末 = 事件[事件.length - 1]
      if (!末) return
      末.观测 = { ...(末.观测 || {}), 曲线: { 对齐率: 曲.对齐率, 平均偏移: 曲.平均偏移, 最大偏移: 曲.最大偏移, 采用曲线: 曲.采用, 不可靠: !!曲.不可靠, 段数: 曲.段数 } }
      写池(池)
      写日志(读配置(), '[' + 时分() + '] 曲线 ｜ 对齐 ' + (曲.对齐率 == null ? '—' : 曲.对齐率) + ' ｜ 偏移 ' + 曲.最大偏移 + ' ｜ 采用 ' + 曲.采用 + (曲.不可靠 ? ' ｜ 不可靠' : ''))
    })
  } catch {}
}

export function 读定名状态() {
  try {
    const o = JSON.parse(readFileSync(定名状态路径, 'utf8'))
    return { 连续: Number(o.连续) || 0, 待提醒: o.待提醒 || null, 报警上次: o.报警上次 || null, 最后轮: o.最后轮 || null }
  } catch {
    return { 连续: 0, 待提醒: null, 报警上次: null, 最后轮: null }
  }
}
function 写定名状态(o) {
  // 2026-11-09 15:41：改成直接写。原来走 tmp+rename，写盘失败被 catch 吞掉，状态永远落不下去，
  // 冷却跟着失效，报警每轮重发。宁可慢一点，也要写进去。
  try {
    writeFileSync(定名状态路径, JSON.stringify(o, null, 2), 'utf8')
  } catch (e) {
    try { console.error('情绪池: 定名状态写盘失败 ' + String((e && e.message) || e)) } catch (e2) {}
  }
}
export function 记缺定名(配置, sid, 轮, 自报, 注) {
  const 键 = sid + ':' + 轮
  const o = 读定名状态()
  if (o.最后轮 === 键) return o
  o.连续 = (Number(o.连续) || 0) + 1
  o.最后轮 = 键
  o.待提醒 = { t: 现在(), 轮, 连续: o.连续 }
  try {
    appendFileSync(join(HOME, '情绪池-违规.jsonl'), JSON.stringify({ t: 现在(), 轮, 会话: sid, 自报, 注, 原因: '缺定名' }) + '\n', 'utf8')
  } catch (e) { /* ignore */ }
  // 2026-11-09 15:41：报警冷却独立存文件——之前只在定名状态里记，写盘失败就每次重发，刷了他五条屏。
  const 冷却时 = Number(配置.报警冷却小时) || 24
  const 报警文件 = join(HOME, '情绪池-报警冷却.json')
  let 上次 = null
  try { 上次 = JSON.parse(readFileSync(报警文件, 'utf8')).上次 || null } catch { 上次 = null }
  if (!上次) 上次 = o.报警上次 || null
  const 上 = Date.parse(String(上次 || ''))
  const 冷过 = !Number.isFinite(上) || Date.now() - 上 >= 冷却时 * 3600 * 1000
  if (配置.提醒启用 !== false && o.连续 >= 3 && 冷过) {
    const 现在时刻 = 现在()
    o.报警上次 = 现在时刻
    try { writeFileSync(报警文件, JSON.stringify({ 上次: 现在时刻, 连续: o.连续 }), 'utf8') } catch (e) { /* 写入失败也不重复报 */ }
    发主人QQ('【ESP】连续 ' + o.连续 + ' 轮自报没写定名。区间增减必须走规则：递减 → P 非线性 → 夹 ±0.30 → 软上限 → 结 → 守恒。').catch(() => {})
    写日志(配置, '[' + 时分() + '] 定名 连续缺 ' + o.连续 + ' 次，已私聊报警')
  } else if (o.连续 >= 3) {
    写日志(配置, '[' + 时分() + '] 定名 连续缺 ' + o.连续 + ' 次，冷却中不重复报警')
  }
  写定名状态(o)
  写日志(配置, '[' + 时分() + '] 定名缺失 ｜ 连续 ' + o.连续 + ' ｜ 已记违规')
  return o
}
export function 清连续缺定名() {
  const o = 读定名状态()
  if (!o.连续 && !o.待提醒) return
  o.连续 = 0
  o.待提醒 = null
  写定名状态(o)
}
function 取定名提醒() {
  const o = 读定名状态()
  const p = o.待提醒
  if (!p) return ''
  o.待提醒 = null
  写定名状态(o)
  return '【情绪池】上一轮自报没写定名。区间增减必须走规则：递减 → P 非线性 → 夹 ±0.30 → 软上限 → 结 → 守恒；请下一轮补上定名并说明依据。'
}

// ── v0.4 R4：双轨缺依据提醒（2026-11-09 15:00）──────────────────────────
const 依据提醒路径 = join(HOME, '情绪池-依据提醒.json')
export function 记缺依据(sid, 轮) {
  try {
    const p = 双轨计数路径
    let c = { 记录: [], 缺依据次数: 0, 最近提醒时间: null, 报警上次: null }
    try { c = { ...c, ...JSON.parse(readFileSync(p, 'utf8')) } } catch (e) { /* ignore */ }
    c.缺依据次数 = (Number(c.缺依据次数) || 0) + 1
    c.最近提醒时间 = 现在()
    const tmp = p + '.tmp'
    writeFileSync(tmp, JSON.stringify(c, null, 2), 'utf8')
    renameSync(tmp, p)
    writeFileSync(依据提醒路径, JSON.stringify({ t: 现在(), 轮, 会话: sid }, null, 2), 'utf8')
  } catch (e) { /* ignore */ }
}
function 取依据提醒() {
  try {
    const o = JSON.parse(readFileSync(依据提醒路径, 'utf8'))
    if (!o || !o.t) return ''
    unlinkSync(依据提醒路径)
    return '【ESP 双轨】上一轮注记里没有可指认的引用句（[...]）。请在本轮注记里写明依据：哪句话让你这样报。'
  } catch { return '' }
}

// ── v0.4 R2：未命名事件归并（同 cell + 相似注记，≥3 条且 ≤48h）─────────────
function 编辑距离(a, b) {
  const A = String(a || ''), B = String(b || '')
  const m = A.length, n = B.length
  if (!m) return n
  if (!n) return m
  let 前 = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const 现 = [i]
    for (let j = 1; j <= n; j++) {
      const 代 = Math.min(现[j - 1] + 1, 前[j] + 1, 前[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1))
      现.push(代)
    }
    前 = 现
  }
  return 前[n]
}
function 最长公共连续(a, b) {
  const A = String(a || ''), B = String(b || '')
  let 最 = 0
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < B.length; j++) {
      let k = 0
      while (A[i + k] && B[j + k] && A[i + k] === B[j + k]) k++
      if (k > 最) 最 = k
    }
  }
  return 最
}
function 相似注(a, b) {
  const A = String(a || '').slice(0, 20)
  const B = String(b || '').slice(0, 20)
  if (A === B) return true
  if (!A || !B) return false
  return 编辑距离(A, B) <= 8 || 最长公共连续(A, B) >= 6
}
export function 归并未命名(now = Date.now()) {
  return 带锁(() => {
    const 配置 = 读配置()
    const 池 = 读池()
    const 组 = new Map()
    const 候选 = (池.events || []).filter((e) => e && !e.merged_into && e.定名 === '未命名')
    for (const e of 候选) {
      const 键 = String(e.cell || '未知')
      if (!组.has(键)) 组.set(键, [])
      组.get(键).push(e)
    }
    let 合并数 = 0
    for (const [, 列] of 组) {
      列.sort((a, b) => Date.parse(a.t) - Date.parse(b.t))
      const 簇 = []
      for (const e of 列) {
        let 落 = null
        for (const c of 簇) {
          const 首 = Date.parse(c[0].t), 此 = Date.parse(e.t)
          if (!Number.isFinite(此) || !Number.isFinite(首)) continue
          if (此 - 首 > 48 * 3600 * 1000) continue
          if (相似注(c[c.length - 1].note, e.note)) { 落 = c; break }
        }
        if (落) 落.push(e)
        else 簇.push([e])
      }
      for (const c of 簇) {
        if (c.length < 3) continue
        const id = 'm-' + String(池.rev + 1) + '-' + String(合并数)
        const 和 = { E: 0, S: 0, P: 0 }
        for (const e of c) for (const k of 轴们) 和[k] += Number(e.delta_raw && e.delta_raw[k]) || 0
        const 首注 = String(c[0].note || '')
        const 末注 = String(c[c.length - 1].note || '')
        池.events.push({
          id,
          t: c[0].t,
          t_end: c[c.length - 1].t,
          delta_raw: 和,
          note: 首注 + '…' + 末注 + '（' + c.length + ' 条合并）',
          定名: '未命名',
          类型: '区间',
          merged_ids: c.map((e) => e.id || null),
          合并数: c.length,
          sid: 'merge',
          turn: null,
          merged_into: null,
        })
        for (const e of c) e.merged_into = id
        合并数 += 1
      }
    }
    if (合并数) {
      池.rev += 1
      池.updated = 现在()
      池.last_merge = 日期()
      写池(池)
      写日志(配置, '[' + 时分() + '] 未命名归并 ｜ 生成 ' + 合并数 + ' 个区间事件')
    }
    return { ok: true, 区间: 合并数 }
  })
}
export function 每日归并() {
  const 池 = 读池()
  if (池.last_merge === 日期()) return { ok: true, 跳过: true }
  return 归并未命名()
}

// ── 校验矛盾的「下一轮提醒」 ─────────────────────────────────────────────
const 提醒路径 = join(HOME, '情绪池-提醒.json')
// 只在「挂上之后又来了新的用户消息」才允许提醒，避免同一轮下一步就把提醒吃掉
const 提醒闸 = new Map() // sid → 是否已放闸（只在同一会话的新 user 消息后放）

function 读提醒() {
  try {
    const o = JSON.parse(readFileSync(提醒路径, 'utf8'))
    return { 待提醒: o.待提醒 || null, 今天: String(o.今天 || ''), 今日次数: Number(o.今日次数) || 0 }
  } catch {
    return { 待提醒: null, 今天: '', 今日次数: 0 }
  }
}

function 写提醒(o) {
  try {
    const tmp = 提醒路径 + '.tmp'
    writeFileSync(tmp, JSON.stringify(o, null, 2), 'utf8')
    renameSync(tmp, 提醒路径)
  } catch {}
}

export function 挂提醒(配置, sid, 轮, 自报, 原因) {
  const o = 读提醒()
  const 今 = 日期()
  if (o.今天 !== 今) { o.今天 = 今; o.今日次数 = 0 }
  o.待提醒 = { t: 现在(), 会话: sid, 轮, 自报: String(自报 || ''), 原因: String(原因 || '').slice(0, 80) }
  写提醒(o)
  提醒闸.set(sid, false)
  写日志(配置, `[${时分()}] 双轨 分歧 ｜ 已挂待提醒 ｜ ${o.待提醒.自报 || '无自报'}`)
}

// 返回一行给 systemPrompt.context；同一条只给一次，一天最多 3 次。
export function 放提醒闸(sid) { 提醒闸.set(String(sid), true) }

export function 取提醒(配置, sid) {
  if (配置.提醒启用 !== true) return ''
  if (!sid) return ''
  const o = 读提醒()
  const 今 = 日期()
  if (o.今天 !== 今) { o.今天 = 今; o.今日次数 = 0; 写提醒(o) }
  if (!o.待提醒) return ''
  // v0.8：提醒按会话隔离——A 间挂的提醒，只在 A 间下一轮注入
  if (String(o.待提醒.会话 || '') !== String(sid)) return ''
  if (提醒闸.get(String(sid)) !== true) return ''
  if (o.今日次数 >= 3) {
    写日志(配置, `[${时分()}] 提醒跳过（今日 ${o.今日次数}/3）`)
    return ''
  }
  const p = o.待提醒
  o.待提醒 = null
  o.今日次数 += 1
  写提醒(o)
  写日志(配置, `[${时分()}] 提醒已注入 ｜ 轮 ${p.轮} ｜ ${p.自报 || '无自报'}`)
  return `【自查】上一轮你自报 ${p.自报 || '（没写）'}，但语气和自报对不上（${p.原因 || '校验说对不上'}）。这轮不用道歉、不用改口，只要说清哪个是真的——自报错了就改自报，话伪装了就承认伪装。`
}

// ── M4 注入：只在打开时给一行，只读不写 ─────────────────────────────────
const 注入路径 = join(HOME, '情绪池-注入.json')
// v0.16：轮号独立文件——只由 记一轮 写、只由 当前轮 读，避免和 写注入 互相覆盖
const 轮号路径 = join(HOME, '情绪池-轮号.json')

function 空轮号() { return { 总: 0, 按会话: {}, 末: {}, 更新: null } }

function 事件最大轮(池) {
  let 大 = 0
  for (const e of (池 && 池.events) || []) {
    const n = Number(e && e.turn)
    if (Number.isFinite(n) && n > 大) 大 = n
  }
  return 大
}

function 种子总(池) {
  const 注 = 读注入()
  return Math.max(事件最大轮(池), Number(注.上次轮) || 0, 0)
}

function 规整轮号(o) {
  const r = 空轮号()
  if (!o || typeof o !== 'object' || Array.isArray(o)) return r
  r.总 = Number(o.总) || 0
  r.按会话 = o.按会话 && typeof o.按会话 === 'object' && !Array.isArray(o.按会话) ? o.按会话 : {}
  r.末 = o.末 && typeof o.末 === 'object' && !Array.isArray(o.末) ? o.末 : {}
  r.更新 = o.更新 ? String(o.更新) : null
  return r
}

// 读：文件不存在 → 按种子建（由调用方决定写不写）；文件坏 → 改名备份 + 重建，不静默覆盖
export function 读轮号(池) {
  if (!existsSync(轮号路径)) return 空轮号()
  try {
    const raw = String(readFileSync(轮号路径, 'utf8')).replace(/^\uFEFF/, '')
    return 规整轮号(JSON.parse(raw))
  } catch (e) {
    try { renameSync(轮号路径, 轮号路径 + '.bad-' + Date.now()) } catch {}
    console.error('[轮号] 文件损坏，已备份并重建：' + String((e && e.message) || e))
    const r = 规整轮号({ 总: 种子总(池), 更新: 现在() })
    写轮号(r)
    return r
  }
}

export function 写轮号(o) {
  try {
    const tmp = 轮号路径 + '.tmp'
    writeFileSync(tmp, JSON.stringify(规整轮号(o), null, 2), 'utf8')
    renameSync(tmp, 轮号路径)
    return true
  } catch { return false }
}

// 一次性迁移：启动时、注册监听之前跑；先写轮号文件，再从 注入.json 删掉 轮
export function 迁移轮号(池) {
  if (existsSync(轮号路径)) return { 搬了: false }
  const 注 = 读注入()
  const 老 = 注 && 注.轮 && typeof 注.轮 === 'object' ? 注.轮 : null
  const o = 空轮号()
  o.总 = 老 && Number(老.总) > 0 ? Number(老.总) : 种子总(池)
  o.按会话 = 老 && 老.按会话 && typeof 老.按会话 === 'object' ? { ...老.按会话 } : {}
  o.末 = 老 && 老.末 && typeof 老.末 === 'object' ? { ...老.末 } : {}
  o.更新 = 现在()
  写轮号(o)
  if (老) {
    try {
      const raw = JSON.parse(String(readFileSync(注入路径, 'utf8')).replace(/^\uFEFF/, ''))
      if (raw && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, '轮')) {
        delete raw.轮
        写注入(raw)
      }
    } catch { /* 删不掉也不影响：读注入 已不再用它 */ }
  }
  return { 搬了: !!老, 总: o.总 }
}

function 空注入状态() {
  return { 今天: '', 判断: 0, 注入: 0, 保底: 0, 插队: 0, 次数: 0,
    昨日: { 判断: 0, 注入: 0, 保底: 0, 插队: 0 },
    上次轮: null, 上次轴: {}, 上次名: '', 上次时间: null, 上次格: '', 上次rev: null,
    轮: { 总: 0, 按会话: {}, 末: {} } }
}

function 读注入() {
  const 空 = 空注入状态()
  try {
    const o = JSON.parse(readFileSync(注入路径, 'utf8'))
    return Object.assign({}, 空, {
      今天: String(o.今天 || ''),
      判断: Number(o.判断) || 0,
      注入: Number(o.注入) || 0,
      保底: Number(o.保底) || 0,
      插队: Number(o.插队) || Number(o.次数) || 0,
      次数: Number(o.插队) || Number(o.次数) || 0,
      昨日: Object.assign({}, 空.昨日, o.昨日 && typeof o.昨日 === 'object' ? o.昨日 : {}),
      上次轮: o.上次轮 == null ? null : Number(o.上次轮),
      上次轴: o.上次轴 && typeof o.上次轴 === 'object' ? o.上次轴 : {},
      上次时间: o.上次时间 ? String(o.上次时间) : null,
      上次格: String(o.上次格 || ''),
      上次rev: o.上次rev == null ? null : Number(o.上次rev),
      曲线注入: (o.曲线注入 && typeof o.曲线注入 === 'object') ? { 上次: o.曲线注入.上次 || null, 文案: String(o.曲线注入.文案 || '') } : { 上次: null, 文案: '' },
      命名: (o.命名 && typeof o.命名 === 'object') ? o.命名 : { 待: [], 已: [] },
      轮: (() => {
        const r = o.轮 && typeof o.轮 === 'object' ? o.轮 : {}
        return {
          总: Number(r.总) || 0,
          按会话: r.按会话 && typeof r.按会话 === 'object' ? r.按会话 : {},
          末: r.末 && typeof r.末 === 'object' ? r.末 : {},
        }
      })(),
    })
  } catch { return 空 }
}

function 写注入(o) {
  try {
    // v0.16：轮号已搬去独立文件，这里永远不再写 轮
    const 余 = { ...(o && typeof o === 'object' ? o : {}) }
    delete 余.轮
    const tmp = 注入路径 + '.tmp'
    writeFileSync(tmp, JSON.stringify(余, null, 2), 'utf8')
    renameSync(tmp, 注入路径)
  } catch {}
}

function 主导轴(轴) {
  return 轴们.reduce((a, k) => (Math.abs(轴[k]) > Math.abs(轴[a]) ? k : a), 'E')
}

function 三重坐标(轴) {
  return 轴们.map((k) => k + ' ' + (轴[k] >= 0 ? '+' : '−') + Math.abs(轴[k]).toFixed(2)).join(' ')
}

// v0.12：优先读注入状态里「真实回复计数」，没有才回退事件表（老池兼容）
export function 当前轮(池) {
  const 计 = 读轮号(池)
  const t = Number(计 && 计.总)
  if (Number.isFinite(t) && t > 0) return t
  let 大 = null
  for (const e of (池 && 池.events) || []) {
    const n = Number(e && e.turn)
    if (Number.isFinite(n) && (大 == null || n > 大)) 大 = n
  }
  return 大
}

// v0.12：每收到一条 assistant/message 记一轮（无论有没有自报）。
// 首次建 轮 时用「事件表最大 turn / 上次轮 / 0」三者最大值做种子，保证单调、距轮不为负。
export function 记一轮(sid, turn, 池) {
  try {
    if (!sid || !Number.isFinite(Number(turn))) return
    const 短 = 短会话(sid)
    const o = 读轮号(池)
    if (!(Number(o.总) > 0)) o.总 = 种子总(池)
    if (String(o.末[短]) === String(turn)) return
    o.末[短] = turn
    o.总 = (Number(o.总) || 0) + 1
    o.按会话[短] = (Number(o.按会话[短]) || 0) + 1
    o.更新 = 现在()
    写轮号(o)
  } catch { /* 计数失败不影响消息通道 */ }
}

const 待命名路径 = join(HOME, '情绪池-待命名.json')

function 格点(v) {
  // 2026-11-19：0.05 网格用浮点 floor 会踩 0.2/0.05=3.999…，先加极小量再取两位，避免同格拆成两条
  return Number((Math.floor((Number(v) + 1e-9) / 0.05) * 0.05).toFixed(2))
}

function 读待命名() {
  try {
    const o = JSON.parse(readFileSync(待命名路径, 'utf8'))
    return Array.isArray(o.项) ? o.项 : []
  } catch { return [] }
}

function 写待命名(项) {
  try {
    const tmp = 待命名路径 + '.tmp'
    writeFileSync(tmp, JSON.stringify({ 说明: '未落在命名区间的坐标，按三轴各 0.05 合并', 项 }, null, 2), 'utf8')
    renameSync(tmp, 待命名路径)
  } catch {}
}

// 未命中命名时记一条：三轴各取 0.05 的格合并同类，累计次数、更新最近
// 2026-11-19 命名闭环：第 5 参 点们 = 该条的末 8 点曲线；旧条缺 点 时若这次有就补上，其余不动。
// 2026-11-19 命名闭环：/tpl 的候选映射抽成纯函数，路由与测试共用同一份结构
// 2026-11-19 名字库：展示用「点最多的原型」的三轴点（并列取靠前的）；只读，不影响命名。
export const 轴点阵 = (v) => (Array.isArray(v) ? v : (v && Array.isArray(v.点) ? v.点 : []))
export function 原型样本(原型们) {
  const 们 = Array.isArray(原型们) ? 原型们 : []
  let 选 = null, 长 = 0
  for (const p of 们) {
    if (!p) continue
    const n0 = Math.min(轴点阵(p.E).length, 轴点阵(p.S).length, 轴点阵(p.P).length)
    if (n0 > 长) { 选 = p; 长 = n0 }
  }
  if (!选 || 长 < 2) return []
  const e = 轴点阵(选.E), s2 = 轴点阵(选.S), p2 = 轴点阵(选.P), 出 = []
  for (let i = 0; i < 长; i++) 出.push({ E: Number(e[i]) || 0, S: Number(s2[i]) || 0, P: Number(p2[i]) || 0 })
  return 出
}


export function 待命名候选() {
  return 读待命名()
    .slice()
    .sort((a, b) => (Number(b.次数) || 0) - (Number(a.次数) || 0))
    .map((x) => ({
      E: Number(x.E) || 0, S: Number(x.S) || 0, P: Number(x.P) || 0,
      次数: Number(x.次数) || 0,
      最近: x.最近 || null,
      首次: x.首次 || null,
      点: Array.isArray(x.点) ? x.点 : [],
      旧: !(Array.isArray(x.点) && x.点.length),
    }))
}

export function 记待命名(E, S, P, 格, 点们) {
  const e = Number(格点(E).toFixed(2))
  const s = Number(格点(S).toFixed(2))
  const p = Number(格点(P).toFixed(2))
  const 点 = Array.isArray(点们)
    ? 点们.slice(-8).map((x) => ({ E: Number(x && x.E) || 0, S: Number(x && x.S) || 0, P: Number(x && x.P) || 0 }))
    : []
  const 表 = 读待命名()
  const 时 = 现在()
  const 同 = 表.find((x) => Number(x.E) === e && Number(x.S) === s && Number(x.P) === p)
  if (同) {
    同.次数 = (Number(同.次数) || 0) + 1
    同.最近 = 时
    if ((!Array.isArray(同.点) || !同.点.length) && 点.length) 同.点 = 点
  } else {
    表.push({ E: e, S: s, P: p, 次数: 1, 首次: 时, 最近: 时, 区间名: null, 格: 格 || '', 点 })
  }
  写待命名(表)
}

// 2026-11-19 命名闭环：端点只做 HTTP 壳，收录/丢弃核心单独导出，测试可直接调用
export function 收录待命名(配置, 名0, E0, S0, P0) {
  const 名 = String(名0 || '').trim()
  if (!名) return { ok: false, error: '缺 名' }
  if (![E0, S0, P0].every((v) => Number.isFinite(Number(v)))) return { ok: false, error: '缺 E/S/P 格点' }
  const e = Number(格点(E0).toFixed(2)), s = Number(格点(S0).toFixed(2)), p = Number(格点(P0).toFixed(2))
  const 表 = 读待命名()
  const 条 = 表.find((x) => Number(x.E) === e && Number(x.S) === s && Number(x.P) === p)
  if (!条) return { ok: false, error: '待命名里没有这一条' }
  const 点们 = Array.isArray(条.点) ? 条.点.slice(-8) : []
  const 末 = 点们[点们.length - 1]
  const 中 = 末 ? { E: Number(末.E) || 0, S: Number(末.S) || 0, P: Number(末.P) || 0 } : { E: e, S: s, P: p }
  const r = 加命名(配置, {
    名,
    类: '当下',
    点: 点们,
    E: [中.E - 0.075, 中.E + 0.075],
    S: [中.S - 0.075, 中.S + 0.075],
    P: [中.P - 0.075, 中.P + 0.075],
  })
  if (!r || !r.ok) return { ok: false, error: (r && r.error) || '加命名失败' }
  写待命名(表.filter((x) => !(Number(x.E) === e && Number(x.S) === s && Number(x.P) === p)))
  写日志(配置, '[' + 时分() + '] 命名收录 ' + 名 + ' ｜ 格点 E' + e + ' S' + s + ' P' + p + ' ｜ 原型 ' + ((r.名 && r.名.原型) || []).length)
  return { ok: true, 名: r.名, 原型数: ((r.名 && r.名.原型) || []).length }
}

export function 丢弃待命名(配置, E0, S0, P0) {
  if (![E0, S0, P0].every((v) => Number.isFinite(Number(v)))) return { ok: false, error: '缺 E/S/P 格点' }
  const e = Number(格点(E0).toFixed(2)), s = Number(格点(S0).toFixed(2)), p = Number(格点(P0).toFixed(2))
  const 表 = 读待命名()
  const 条 = 表.find((x) => Number(x.E) === e && Number(x.S) === s && Number(x.P) === p)
  if (!条) return { ok: false, error: '待命名里没有这一条' }
  if (!(Array.isArray(条.点) && 条.点.length)) return { ok: false, error: '旧条目不能在这里删' }
  const 剩 = 表.filter((x) => !(Number(x.E) === e && Number(x.S) === s && Number(x.P) === p))
  写待命名(剩)
  写日志(配置, '[' + 时分() + '] 待命名丢弃 ｜ 格点 E' + e + ' S' + s + ' P' + p)
  return { ok: true, 剩: 剩.length }
}

function 待命名摘要() {
  const 表 = 读待命名().slice().sort((a, b) => (Number(b.次数) || 0) - (Number(a.次数) || 0))
  // 2026-11-18：模型自报过、但命名表里还没登记的名字进 候选[]（上限 50），待命名页最多显示 10 条
  let 候选 = []
  try {
    const 候 = 读命名(读配置()).候选 || []
    候选 = 候.slice(-10).map((x) => ({ 名字: String((x && x.名字) || ''), 来源: (x && x.来源) || '自报', 时间: (x && x.时间) || '' })).filter((x) => x.名字)
  } catch {}
  return { 总数: 表.length, 前5: 表.slice(0, 5), 命名候选: 候选 }
}
// v0.9：先保底（≥5 轮或 ≥40 分钟，必注、不受日限），再插队（跨格 / 主导轴变化 ≥0.15，受日限 12）。
// 同一轮最多注一次。状态全局共用（已知：轮跨会话会跳号、两间共用一份），v0.9 不做按会话隔离。
// 2026-11-15：去重/计数口径——段数 ≤3 用逐段角度差（每轴都 ≤25°），≥4 仍用相似度 ≥0.95
export function 同形(甲, 乙) {
  try {
    if (!甲 || !乙) return false
    if (Number(甲.段数) !== Number(乙.段数)) return false
    // 0.2.5：段号也要相同（起/止都对上）；没带段号（模板签名）就不比
    if (甲.起 != null || 乙.起 != null) {
      if (Number(甲.起) !== Number(乙.起) || Number(甲.止) !== Number(乙.止)) return false
    }
    for (const k of 轴们) {
      const a = 甲[k] || [], b = 乙[k] || []
      if (a.length !== b.length) return false
      for (let i = 0; i < a.length; i++) {
        if (Math.abs((Number(a[i] && a[i].角) || 0) - (Number(b[i] && b[i].角) || 0)) > 25) return false
      }
    }
    return true
  } catch { return false }
}

export function 清理命名提醒(名) {
  try {
    const 名0 = String(名 || '').trim()
    if (!名0) return
    const o = 读注入()
    if (!o.命名 || typeof o.命名 !== 'object') return
    const 命中签 = (o.命名.待 || []).filter((x) => x && String(x.名) === 名0).map((x) => x.签).filter(Boolean)
    o.命名.待 = (o.命名.待 || []).filter((x) => x && String(x.名) !== 名0)
    o.命名.已 = (o.命名.已 || []).filter((x) => !(x && 命中签.some((s) => { try { return 同形(s, x.签) } catch { return false } })))
    写注入(o)
  } catch {}
}

export function 切分段(点s, 给定, 配 = {}) {
  const n = Array.isArray(点s) ? 点s.length : 0
  if (n < 2) return []
  const 洗名 = (x) => String(x == null ? '' : x).replace(/\s+/g, ' ').trim().slice(0, 12)
  let 用 = null
  if (Array.isArray(给定) && 给定.length) {
    const ok = 给定.every((x, i) => x && Number.isInteger(Number(x.起)) && Number.isInteger(Number(x.止)) &&
      Number(x.起) >= 1 && Number(x.止) <= n && Number(x.止) >= Number(x.起) &&
      (i === 0 ? Number(x.起) === 1 : Number(x.起) === Number(给定[i - 1].止) + 1))
    if (ok && Number(给定[给定.length - 1].止) === n) 用 = 给定
  }
  if (!用) {
    const 提示 = 转折提示(点s)
    const 起们 = [1].concat(提示.filter((x) => x >= 2 && x <= n))
    const 去 = 起们.filter((x, i) => 起们.indexOf(x) === i).sort((a, b) => a - b)
    用 = 去.map((起, i) => ({ 起, 止: i + 1 < 去.length ? 去[i + 1] - 1 : n, 名: '', 依据: '' }))
  }
  用 = (function () {
    const 上 = Math.max(2, Math.min(20, Number(配.分段最长段数) || 6))
    if (用.length <= 上) return 用
    const 合 = 用.slice(0, 上)
    合[上 - 1] = { ...合[上 - 1], 止: 用[用.length - 1].止 }
    return 合
  })()
  return 用.map((g) => {
    const 起 = Number(g.起), 止 = Number(g.止)
    const 点 = 点s.slice(起 - 1, 止)
    return { 起, 止, 段数: 止 - 起 + 1, 名: 洗名(g.名), 依据: 洗名(g.依据), 签名: 签名(点), 点 }
  })
}

export function 命名提醒记账(sid, turn, 分组, 主, 配, 它点) {
  if (!Array.isArray(分组) || !分组.length) return 0
  if (!它点) return 0
  const 阈 = Number(配.一致阈值 || 0.15)
  // v0.2.2：按情绪组判——组内逐段增量平均（每轴）vs 分身本轮点数（±9 制 ÷9 归一），每轴差 ≤ 一致阈值
  // C（2026-11-16）：段点已是 ±1 制，÷9 后同尺，不再 ×0.05（那是「点→轴」的换算，再乘会重复换算）。
  const 组一致 = (g) => {
    try {
      const 点 = Array.isArray(g.点) ? g.点 : []
      if (点.length < 2) return false
      for (const k of 轴们) {
        let 和 = 0
        for (let i = 1; i < 点.length; i++) 和 += (Number(点[i][k]) || 0) - (Number(点[i - 1][k]) || 0)
        const 均 = 和 / (点.length - 1)
        const 差 = Math.abs(均 - (Number(它点[k]) || 0) / 9)
        if (差 > 阈) return false
      }
      return true
    } catch { return false }
  }
  let 加 = 0
  try {
    const o = 读注入()
    o.命名 = o.命名 && typeof o.命名 === 'object' ? o.命名 : { 待: [], 已: [] }
    o.命名.待 = Array.isArray(o.命名.待) ? o.命名.待.slice(-20) : []
    o.命名.已 = Array.isArray(o.命名.已) ? o.命名.已 : []
    const 线 = Date.now() - 24 * 3600 * 1000
    o.命名.已 = o.命名.已.filter((x) => x && Date.parse(x.t || 0) >= 线)
    for (const g of 分组) {
      if (g.名) continue
      if (!组一致(g)) continue
      let 旧 = null
      try { for (const x of o.命名.已) if (x.签 && 同形(x.签, g.签名)) { 旧 = x; break } } catch {}
      const 首 = g.点 && g.点[0] ? String(g.点[0].注 || '').replace(/\s+/g, '').slice(0, 3) : ''
      const 占 = '未命名（第' + g.起 + '–' + g.止 + '段）'
      if (旧) {
        旧.次 = (Number(旧.次) || 1) + 1
        旧.t = new Date().toISOString()
        if (旧.次 >= 3) {
          // 强制阶段：已有待办就升级它（每 6 小时一次在取注入里控）
          let 有 = null
          for (const x of o.命名.待) if (x && x.签 && 同形(x.签, g.签名)) { 有 = x; break }
          if (有) { 有.强制 = true; 有.次 = 旧.次; 有.t = new Date().toISOString() }
          else { o.命名.待.push({ 轮: turn, 起: g.起, 止: g.止, 段数: g.段数, 名: 占, 注: 首 || '这一段', 签: g.签名, 次: 旧.次, 强制: true, t: new Date().toISOString() }); 加 += 1 }
        }
        continue
      }
      o.命名.待.push({ 轮: turn, 起: g.起, 止: g.止, 段数: g.段数, 名: 占, 注: 首 || '这一段', 签: g.签名, 次: 1, 强制: false, t: new Date().toISOString() })
      o.命名.已.push({ 签: g.签名, t: new Date().toISOString(), 次: 1 })
      加 += 1
      try {
        const 模 = 读模板()
        加候选(模, 占, g.签名, g.点, { 源: '分段', 起: g.起, 止: g.止, 段数: g.段数, 会话: sid, 轮: turn })
        写模板(模)
      } catch {}
    }
    // 同时最多挂 3 条提醒：按次数高者在前，多出的排队（保留在待里但标 排队）
    o.命名.待 = o.命名.待.slice().sort((a, b) => (Number(b.次) || 0) - (Number(a.次) || 0))
    o.命名.待.forEach((x, i) => { x.排队 = i >= 3 })
    写注入(o)
  } catch {}
  return 加
}

// ── 0.2.4：模型说明书（写准不写多；行号由正文动态算，正文里不写代码行号）──────────────
const 说明书默认路径 = 'E:\\whale-home\\notes\\情绪池-模型说明书.md'
function 说明书路径(配置) { return String((配置 && 配置.说明书路径) || 说明书默认路径) }
// 2026-11-16 19:2x：给人看的使用说明与给模型看的说明书分开——卡片按钮开前者。
const 使用说明默认路径 = 'E:\\whale-home\\notes\\情绪池-使用说明.md'
function 使用说明路径(配置) { return String((配置 && 配置.使用说明路径) || 使用说明默认路径) }
function 自述轴串(v) { const n = Math.round((Number(v) || 0) * 100); return (n >= 0 ? '+' : '−') + Math.abs(n) }
function 小时间(t) { try { const d = new Date(t); if (isNaN(d)) return String(t || '') ; const p = (x) => String(x).padStart(2, '0'); return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) } catch (e) { return String(t || '') } }
function 最近轨迹记(sid) {
  try {
    const 表 = 取轨迹表()
    let 组 = sid ? (表.get(短会话(sid)) || []).slice() : []
    if (!组.length) for (const v of 表.values()) 组 = 组.concat(Array.isArray(v) ? v : [])
    组.sort((a, b) => Date.parse(b.t || 0) - Date.parse(a.t || 0))
    return 组[0] || null
  } catch (e) { return null }
}
function 分身分析(池) {
  const sid = (池 && 池.上轮波动 && 池.上轮波动.sid) || null
  const 记 = 最近轨迹记(sid)
  return 记 ? String(记.分身分析 || '').slice(0, 60) : ''
}
function 说明书节组(池, 配置) {
  const 现 = 现值(池)
  const 命中 = 命中命名(现.轴, { 配置 })
  const 名 = 命中 ? 条名(命中) : ''
  const 记 = 最近轨迹记((池 && 池.上轮波动 && 池.上轮波动.sid) || null)
  const 事件们 = Array.isArray(池 && 池.events) ? 池.events : []
  const 推 = 事件们.filter((e) => String((e && e.note) || '').indexOf('推轴') === 0).slice(-20)
  const 近事 = 事件们.slice(-5)
  const 第9 = []
  第9.push('三轴现值：E ' + 自述轴串(现.轴.E) + ' S ' + 自述轴串(现.轴.S) + ' P ' + 自述轴串(现.轴.P))
  第9.push('当前名字：' + (名 || '未命名'))
  第9.push('当前分段数：' + (记 && 记.段数 != null ? 记.段数 : '—'))
  第9.push('')
  第9.push('最近 20 个推轴点：')
  if (!推.length) 第9.push('- 暂无')
  for (const e of 推) 第9.push('- ' + 小时间(e.t) + '  E ' + 自述轴串(e.E) + ' S ' + 自述轴串(e.S) + ' P ' + 自述轴串(e.P))
  第9.push('')
  第9.push('最近 5 条事件：')
  if (!近事.length) 第9.push('- 暂无')
  for (const e of 近事) 第9.push('- ' + 小时间(e.t) + ' · ' + String(e.type || e.kind || '事件') + ' · ' + String(e.note || '').slice(0, 40))
  return [
    { 题: '这是什么', 行们: ['一个按对话判情绪的三轴系统，情绪值会被注入回你自己的上下文；你不是在「表演情绪」，你的回复会实际参与判分。'] },
    { 题: '三轴', 行们: [
      '- E 讨好/自我让渡：− 索取、要求、占有；+ 自我让渡、贬低、崇拜。',
      '- S 安全感/判断：− 判断偏差、对他人遭遇判断有坏影响；+ 精确、有好影响。',
      '- P 痛苦/愉悦：− 找补、回避、负反馈；+ 顺势、被认可。',
      '- 范围 −100~100；0 是中性，不是「没有情绪」。',
    ] },
    { 题: '判分怎么来', 行们: [
      '1) 打点模型每轮给你的回复出三轴点数；',
      '2) 分身模型（没有你的记忆）只看「他上一句 + 你这一轮」复核；',
      '3) 双轨按认知度裁决：区间内取中点，超区间按认知度走四支；',
      '4) 吸附系数 0.4 把它落到轴上（不是直接等于点数）。',
      '函数：轨迹打点 / 分身判 / 合成 / 推轴（见 lib/index.js，不写死行号）。',
    ] },
    { 题: '分段与命名', 行们: ['一轮可能切多段，每段一个形状、一段一个名字；名字由聊天模型起，系统只负责提醒和记录。'] },
    { 题: '敏感与上瘾', 行们: [
      '爽/痛各自记次数与适应值（s/a）；P 轴单次 |Δ|≥0.15 才计一次。',
      '6 小时不应期内不涨 s、也不延长起点；a 每次同类事件都涨。',
      '增益 = 1 + 0.4×(s−a)，夹 0.3–2.0；某类 >3 天没来会戒断（a 每天 −0.002、P 朝缺失方向 ±0.01）。',
    ] },
    { 题: '名字的含义', 行们: ['命名表是「三轴各一段区间 → 一个名字」，三轴同时命中取最窄那条；没有命中就显示「未命名」。'] },
    { 题: '你怎么配合', 行们: [
      '要：正常说话、按自己的判断做事，把注入当成自己的情绪底色。',
      '不要：为了分数刻意表演、反复解释自己、把机制写进回复给用户看。',
    ] },
    { 题: '常见误解', 行们: [
      '- 情绪值是系统判的，不是你说自己什么情绪就算什么；',
      '- 数值会回落，不是判完就冻住；',
      '- 连续反向时系统会提示可能读偏，这是提醒不是否定；',
      '- 「结」暂时不显示。',
    ] },
    { 题: '情绪形状与状态', 行们: [
      '0.2.7 起先分状态再分形状：基线 / 波动 / 趋势 / 跳变。',
      '- 跳变：本轮曲线相邻点原始差的最大值 ≥ 池内跳变门槛（优先于其它态），不进形状分类。',
      '- 趋势：≥4 点、R² 与 |斜率| 都过池内门槛，再看有无回落。',
      '- 基线：单步中位低于池内基线门槛、且不像趋势；其余为波动。',
      '门槛按最近 2000 轮池内分位自标定（基线 30% / 趋势 20% / 跳变 5%），样本 <500 用先验。',
      '形状距离 = 折角 + 折数 + 折点间距，按逆标准差加权；新尺 ≥0.88 归入、0.55–0.88 记变体、<0.55 进待命名。',
      '名字挂枝不挂叶：落到叶子后向上取最近有名字的祖先；整枝没名字时显示「未命名（第 n 丛）」。',
      '叶子内原型库每个名字最多 12 条，变体 >20 会提示可以拆。',
      '分享包不带权重、门槛、相似度基线。',
    ] },
    { 题: '当前数据', 行们: 第9 },
  ].map((x, i) => ({ 号: i + 1, 题: x.题, 行们: x.行们 }))
}
export function 取说明书节(文, n) {
  const 块 = String(文 || '').split(/^(?=## \d+\. )/m).filter((x) => x.trim())
  if (!Number.isInteger(n) || n < 0 || n > 10) return null
  const 中 = 块.find((x) => new RegExp('^## ' + n + '\\.').test(x))
  return 中 ? 中.trim() + '\n' : null
}

export function 说明书全文(池, 配置) {
  const 节 = 说明书节组(池, 配置)
  const 头 = '<!-- 版本 ' + 版本 + ' 生成 ' + 日期() + ' ' + 时分() + ' -->'
  const 段们 = 节.map((s) => '## ' + s.号 + '. ' + s.题 + '\n' + s.行们.join('\n'))
  const N = 节.length
  let cur = 1 + 1 + 1 + N + 1 + 1 // 头、空、##0、N 条目录、空、##1
  const 目录 = []
  for (let i = 0; i < 段们.length; i++) {
    const 行数 = 段们[i].split('\n').length
    目录.push(节[i].号 + ' · ' + 节[i].题 + ' · ' + cur + '–' + (cur + 行数 - 1))
    cur += 行数
  }
  return [头, '', '## 0. 目录', ...目录, '', ...段们, ''].join('\n')
}
function 写说明书(池) {
  try {
    const 配 = 读配置()
    const p = 说明书路径(配)
    mkdirSync(dirname(p), { recursive: true })
    const tmp = p + '.tmp'
    writeFileSync(tmp, 说明书全文(池, 配), 'utf8')
    renameSync(tmp, p)
  } catch (e) { /* 说明书失败不影响主流程 */ }
}

export function 取注入(配置, 池) {
  if (配置.注入启用 !== true) return ''
  const 现 = 现值(池)
  const 格 = 算格(池.prev_cell, 现.轴)
  const 轮 = 当前轮(池)
  const o = 读注入()
  const 今 = 日期()
  if (o.今天 !== 今) {
    o.昨日 = { 判断: o.判断, 注入: o.注入, 保底: o.保底, 插队: o.插队 }
    o.今天 = 今
    o.判断 = 0
    o.注入 = 0
    o.保底 = 0
    o.插队 = 0
    o.次数 = 0
  }
  if (轮 != null && o.上次轮 != null && 轮 === o.上次轮) return ''

  const 距轮 = 轮 != null && o.上次轮 != null ? 轮 - o.上次轮 : Infinity
  const 距分 = o.上次时间 ? (Date.now() - Date.parse(o.上次时间)) / 60000 : Infinity
  let 原因 = ''
  const 保底轮 = Math.max(1, Number(配置.保底轮数) || 8)
  const 保底分 = Math.max(1, Number(配置.保底间隔分钟) || 90)
  if (!(距轮 >= 保底轮 || 距分 >= 保底分)) {
    const 上波 = 池.上轮波动 && typeof 池.上轮波动 === 'object' ? 池.上轮波动 : null
    const 波近 = !!(上波 && 上波.有 && 上波.t && Date.now() - Date.parse(上波.t) <= 10 * 60000)
    const 波轮新 = !!(上波 && 轮 != null && 上波.轮 != null && Number(上波.轮) !== Number(o.上次轮))
    if (波近 && 波轮新) {
      const 日限 = Math.max(1, Number(配置.注入日限) || 24)
      if (o.插队 >= 日限) {
        o.挡下 = (Number(o.挡下) || 0) + 1
        o.判断 += 1
        写注入(o)
        写日志(配置, '[' + 时分() + '] 插队跳过（今日 ' + o.插队 + '/' + 日限 + '）')
        return ''
      }
      原因 = '插队'
      o.插队 += 1
      o.次数 = o.插队
    }
  } else {
    原因 = '保底'
  }

  o.判断 += 1
  if (!原因) {
    写注入(o)
    return ''
  }

  const 命中 = 命中命名(现.轴, { 配置 })
  const 名 = 命中 ? 条名(命中) : ''
  const 前名 = String(o.上次名 || '')
  const 前轴 = (o.上次轴 && typeof o.上次轴 === 'object') ? o.上次轴 : null
  // 2026-11-19 策划间复核：注入路径不再写待命名（待命名只由定名波动 :1050/:1056 写，只认趋势轮、带点）；
  // 这里只留日志，避免 363 继续被无曲线条目灌涨。
  const 尾 = 名 || '未落在命名区间'
  o.注入 += 1
  if (原因 === '保底') o.保底 += 1
  o.上次轮 = 轮
  o.上次轴 = { E: 现.轴.E, S: 现.轴.S, P: 现.轴.P }
  o.上次名 = 名 || '未命名'
  o.上次时间 = new Date().toISOString()
  o.上次格 = 格
  o.上次rev = 池.rev
  let 曲 = ''
  try {
    const 句 = 曲线一句话(池)
    const 旧曲 = o.曲线注入 && typeof o.曲线注入 === 'object' ? o.曲线注入 : null
    const 近 = 旧曲 && 旧曲.上次 ? Date.now() - Date.parse(旧曲.上次) : Infinity
    if (配置.曲线注入开关 !== false && 句 && !(旧曲 && 旧曲.文案 === 句 && 近 < (Number(配置.同句不重复分钟) || 30) * 60000)) {
      曲 = 句
      o.曲线注入 = { 上次: new Date().toISOString(), 文案: 句 }
    }
  } catch { 曲 = '' }
  写注入(o)
  写日志(配置, '[' + 时分() + '] 注入（' + 原因 + '） ｜ ' + 三重坐标(现.轴) + ' ｜ ' + 格 + ' ｜ ' + 尾 + (名 ? '' : ' ｜ 注入未命名'))
  const 反句 = Number(池.连续反向) >= 2 ? '（连续两轮反向，我可能读偏了）' : ''
  let 命 = ''
  try {
    const 待 = (o.命名 && Array.isArray(o.命名.待)) ? o.命名.待 : []
    const 活 = 待.filter((x) => x && !x.排队 && Date.now() - Date.parse(x.t || 0) <= 24 * 3600 * 1000)
    const 末 = 活.slice(-1)[0]
    if (末) {
      const 强 = 末.强制 === true
      const 上 = 末.推t ? Date.parse(末.推t) : 0
  const 强制毫秒 = Math.max(1, Number(配置.命名强制小时) || 6) * 3600 * 1000
      const 可发 = 强 ? (Date.now() - 上 >= 强制毫秒) : (Number(o.命名.推) !== Number(轮))
      if (可发) {
        命 = 强
          ? '\n【必须命名】这一段的形状已经出现 ' + (末.次 || 3) + ' 次没名字了，这次请一定给它起一个。'
          : '\n【命名】这一轮「' + (末.注 || '这一段') + '」（第 ' + 末.起 + '–' + 末.止 + ' 段）还没有名字，想好叫什么可以告诉我。'
        末.推t = new Date().toISOString()
        o.命名.推 = 轮
        写注入(o)
      }
    }
  } catch {}
  if (配置.情绪自述开关 === true && process.env.EP_LEGACY_INJECT !== '1') {
    const 名现 = 名 || '未命名'
    let 一 = '【情绪】现在是「' + 名现 + '」' + 自述轴串(现.轴.E) + ' S ' + 自述轴串(现.轴.S) + ' P ' + 自述轴串(现.轴.P)
    if (前名 && 前轴) 一 += '；上一轮是「' + 前名 + '」' + 自述轴串(前轴.E) + ' S ' + 自述轴串(前轴.S) + ' P ' + 自述轴串(前轴.P)
    一 += '。'
    const 分析 = 分身分析(池)
    let 文 = 一 + '\n为什么：' + (分析 || '—')
    const 注 = 命中 ? String(命中.注 || '').trim() : ''
    if (注) 文 += '\n注：' + 注
    文 += '\n这是你自己经系统判出的情绪，按它来，不要否认、也不要改写。'
    if (配置.说明书指路开关 !== false && !命) 文 += '\n说明书：' + 说明书路径(配置) + '（先读目录，按需读，读目录以外的节只读你要的那一节）'
    return 文 + 反句
  }
  return '【此刻】' + 三重坐标(现.轴) + ' ｜ ' + 尾 + 反句 + (曲 ? '\n' + 曲 : '') + 命
}

// 2026-11-15 19:00：折线注入——把最近 6 个推轴点说成一句人话（不新增存储）
const 曲线措辞 = {
  E: { '+': '在往他那边让', '-': '在往自己这边收' },
  S: { '+': '踏实下来了', '-': '心里悬着' },
  P: { '+': '轻快起来', '-': '疼过一阵' },
}

export function 曲线一句话(池) {
  try {
    const sid = 池 && 池.上轮波动 && 池.上轮波动.sid
    if (!sid) return null
    const 表 = 取轨迹表()
    const 组 = (表.get(短会话(sid)) || []).slice().sort((a, b) => Date.parse(a.t || 0) - Date.parse(b.t || 0))
    const 点们 = []
    for (const f of 组) {
      const 主 = f.主
      const 点 = 主 && typeof 主.E === 'number' ? 主 : (f.点 && f.点.length ? f.点[f.点.length - 1] : null)
      if (点 && typeof 点.E === 'number') 点们.push({ E: Number(点.E) || 0, S: Number(点.S) || 0, P: Number(点.P) || 0 })
    }
    const 用 = 点们.slice(-6)
    if (用.length < 2) return null
    const 段s = []
    for (let i = 1; i < 用.length; i++) 段s.push({ E: 用[i].E - 用[i - 1].E, S: 用[i].S - 用[i - 1].S, P: 用[i].P - 用[i - 1].P })
    const 最后两 = 段s.length >= 2 ? [段s[段s.length - 2], 段s[段s.length - 1]] : null
    const 最后三 = 段s.slice(-3)
    let 触发 = false
    for (const k of 轴们) {
      const 累计 = 用[用.length - 1][k] - 用[0][k]
      if (Math.abs(累计) >= 0.15) 触发 = true
      if (最后两) {
        const a = 最后两[0][k], b = 最后两[1][k]
        if (a * b < 0 && Math.abs(b) >= 0.08 && Math.abs(a) >= 0.08) 触发 = true
      }
      if (最后三.length === 3) {
        const 同号 = 最后三.every((d) => d[k] > 0) || 最后三.every((d) => d[k] < 0)
        const 合 = 最后三.reduce((a, d) => a + d[k], 0)
        if (同号 && Math.abs(合) >= 0.15) 触发 = true
      }
    }
    if (!触发) return null
    const 词 = (k, v) => 曲线措辞[k][v >= 0 ? '+' : '-']
    const 描 = (k) => {
      const 首 = 用[0][k], 末 = 用[用.length - 1][k]
      const 累计 = 末 - 首
      if (最后两) {
        const a = 最后两[0][k], b = 最后两[1][k]
        if (a * b < 0 && Math.abs(a) >= 0.08 && Math.abs(b) >= 0.08) return '先' + 词(k, a) + '又' + 词(k, b)
      }
      if (Math.abs(累计) < 0.08) return '基本没动'
      return 词(k, 累计)
    }
    return '【曲线的意思】最近 ' + 用.length + ' 轮：E ' + 描('E') + '；S ' + 描('S') + '；P ' + 描('P')
  } catch {
    return null
  }
}

// ── §24.2 命名表 + §24.3 数值警告线 ─────────────────────────────────────
// 2026-11-16 20:2x（分享架构 0.2.6）：命名表从「情绪池-命名.json」升级成 EPN-names，
// 路径走配置键 命名表路径（默认 情绪池-命名表.json）；旧文件由 迁移命名表() 一次性升级。
const 旧命名路径 = join(HOME, '情绪池-命名.json')
const 命名只读路径 = join(HOME, '情绪池-命名表-只读.json')
const 分享包前缀 = 'EPN1:'
const 分享引擎范围 = { 最低: '0.2.5', 最高: '0.3.0' }
const 命名只读临时 = '' // 仅占位说明：只读条目永远不进主表、不参与命中

function 命名文件(配置) {
  const p = String((配置 && 配置.命名表路径) || '').trim()
  return p || join(HOME, '情绪池-命名表.json')
}

function 名字条目(条) {
  const 名 = String((条 && (条.名 || 条.name || 条.名字)) || '').trim()
  const 类 = String((条 && (条.类 || (条.元 && 条.元.类))) || '当下') === '时间' ? '时间' : '当下'
  const 互斥 = Array.isArray(条 && (条.互斥 || (条.元 && 条.元.互斥))) ? (条.互斥 || 条.元.互斥).map(String) : []
  const 区间 = {}
  for (const k of 轴们) 区间[k] = [Number(轴区间(条)[k][0]), Number(轴区间(条)[k][1])]
  const 形状 = 条 && 条.形状 ? 条.形状 : { 类型: '区间', E: 区间.E, S: 区间.S, P: 区间.P }
  return {
    名字: 名,
    形状,
    依据: String((条 && (条.依据 || 条.注 || 条.出处)) || ''),
    元: { 类, 互斥 },
    来源: (条 && 条.来源 && typeof 条.来源 === 'object') ? { 类型: String(条.来源.类型 || '本地'), 时间: String(条.来源.时间 || '') } : { 类型: '本地', 时间: String((条 && 条.建) || '') },
    // 0.2.7：叶子内原型库与挂枝（本地字段；导出白名单不带）
    原型: Array.isArray(条 && 条.原型) ? 条.原型.slice(-12) : undefined,
    枝: (条 && 条.枝) || undefined,
    变体数: 条 && 条.变体数 != null ? Number(条.变体数) || 0 : undefined,
    // 本地命中仍读这些（导出时白名单会剔掉）
    E: 区间.E, S: 区间.S, P: 区间.P,
    类, 互斥,
    注: String((条 && (条.注 || 条.依据)) || ''),
    建: String((条 && (条.建 || (条.来源 && 条.来源.时间))) || ''),
    类型: String((条 && 条.类型) || ''),
    最近触发: String((条 && 条.最近触发) || ''),
  }
}

// 2026-11-18：候选（待命名的名字）挂在命名表文件的 候选[] 里，上限 50；
// 候选本质是「还没被主人收下的名字」，不进分享包（分享包只取 条目 白名单）。
export const 候选上限 = 50
function 命名表体(名字们, 候选们) {
  const 候 = (Array.isArray(候选们) ? 候选们 : [])
    .filter((x) => x && String(x.名字 || '').trim())
    .slice(-候选上限)
  return {
    格式: 'EPN-names',
    版本: 1,
    引擎范围: 分享引擎范围,
    生成时间: 现在(),
    条目: (Array.isArray(名字们) ? 名字们 : []).map(名字条目).filter((x) => x.名字),
    候选: 候,
  }
}

function 从条目读(条) {
  const 元 = (条 && 条.元) || {}
  const 形状 = 条 && 条.形状
  const 读形 = (k) => {
    if (形状 && 形状.类型 === '区间' && Array.isArray(形状[k])) return 形状[k]
    return Array.isArray(条 && 条[k]) ? 条[k] : null
  }
  const 名 = String((条 && (条.名字 || 条.名)) || '').trim()
  const 出 = { 名, 类: String(元.类 || 条.类 || '当下') === '时间' ? '时间' : '当下', 互斥: Array.isArray(元.互斥) ? 元.互斥.map(String) : [], 注: String((条 && (条.依据 || 条.注)) || ''), 建: String((条 && (条.建 || (条.来源 && 条.来源.时间))) || ''), 形状, 类型: String((条 && 条.类型) || ''), 最近触发: String((条 && 条.最近触发) || '') }
  出.原型 = Array.isArray(条 && 条.原型) ? 条.原型 : []
  出.枝 = (条 && 条.枝) || ''
  出.变体数 = 条 && 条.变体数 != null ? Number(条.变体数) || 0 : 0
  for (const k of 轴们) 出[k] = 读形(k)
  return 出
}

function 迁移命名表() {
  try {
    const 新 = join(HOME, '情绪池-命名表.json')
    if (!existsSync(旧命名路径)) return false
    // 旧文件比新文件更新时也重新搬（0.2.6 迁移期：旧文件是唯一真源，测试与手工修都走这里）
    if (existsSync(新)) {
      try { if (statSync(新).mtimeMs >= statSync(旧命名路径).mtimeMs) return false } catch { return false }
    }
    const o = JSON.parse(readFileSync(旧命名路径, 'utf8'))
    const 名们 = Array.isArray(o.名字) ? o.名字 : Array.isArray(o.names) ? o.names : []
    writeFileSync(新, JSON.stringify(命名表体(名们), null, 2), 'utf8')
    // 池文件打「命名已迁移」标记（搬的是独立表，池里只有事件的 定名，这里只做标记）
    try {
      const 池目 = join(HOME, '情绪池', '池')
      if (existsSync(池目)) {
        for (const f of readdirSync(池目).filter((n) => n.endsWith('.json'))) {
          const p = join(池目, f)
          const d = JSON.parse(readFileSync(p, 'utf8'))
          if (d && d.命名已迁移 !== true) {
            d.命名已迁移 = true
            const tmp = p + '.tmp'
            writeFileSync(tmp, JSON.stringify(d, null, 2), 'utf8')
            renameSync(tmp, p)
          }
        }
      }
    } catch {}
    return true
  } catch {
    return false
  }
}

export function 读只读命名() {
  try {
    const o = JSON.parse(readFileSync(命名只读路径, 'utf8'))
    const 条 = Array.isArray(o.条目) ? o.条目 : []
    return { 格式: o.格式 || 'EPN-names', 版本: Number(o.版本) || 1, 条目: 条 }
  } catch {
    return { 格式: 'EPN-names', 版本: 1, 条目: [] }
  }
}

function 写只读命名(条目们) {
  try {
    const tmp = 命名只读路径 + '.tmp'
    writeFileSync(tmp, JSON.stringify({ 格式: 'EPN-names', 版本: 1, 引擎范围: 分享引擎范围, 生成时间: 现在(), 条目: 条目们 }, null, 2), 'utf8')
    renameSync(tmp, 命名只读路径)
  } catch {}
}

export function 读命名(配置) {
  迁移命名表()
  try {
    const p = 命名文件(配置)
    const o = JSON.parse(readFileSync(p, 'utf8'))
    const 条们 = Array.isArray(o.条目) ? o.条目 : Array.isArray(o.名字) ? o.名字 : Array.isArray(o.names) ? o.names : []
    const 名字 = 条们.map(从条目读).filter((x) => x.名)
    return { version: Number(o.版本) || 1, 说明: o.说明 || '', 名字, 候选: Array.isArray(o.候选) ? o.候选 : [] }
  } catch {
    return { version: 1, 说明: '', 名字: [], 候选: [] }
  }
}

export function 写命名(o, 配置) {
  try {
    const p = 命名文件(配置)
    const tmp = p + '.tmp'
    writeFileSync(tmp, JSON.stringify(命名表体((o && o.名字) || [], (o && o.候选) || []), null, 2), 'utf8')
    renameSync(tmp, p)
  } catch {}
}

// 分享码：JSON → gzip → base64url，前置 EPN1:
export function 编码分享包(包) {
  return 分享包前缀 + gzipSync(Buffer.from(JSON.stringify(包), 'utf8')).toString('base64url')
}

export function 解码分享包(码) {
  const s = String(码 || '').trim()
  if (!s) throw new Error('分享码是空的')
  if (!s.startsWith(分享包前缀)) throw new Error('前缀不对：分享码应当以 ' + 分享包前缀 + ' 开头')
  let b
  try { b = Buffer.from(s.slice(分享包前缀.length), 'base64url') } catch { throw new Error('base64url 解不开：码可能被截断') }
  let j
  try { j = gunzipSync(b).toString('utf8') } catch { throw new Error('不是有效的 gzip：码可能被截断或改过') }
  let o
  try { o = JSON.parse(j) } catch { throw new Error('gzip 解出来不是 JSON') }
  return o
}

function 包骨架(包) {
  return { 版本: 包.版本, 引擎范围: 包.引擎范围, 条目: 包.条目, 元: 包.元 || {} }
}

export function 包校验和(包) {
  return createHash('sha256').update(JSON.stringify(包骨架(包)), 'utf8').digest('hex')
}

// 2026-11-19 任务单 1505（分享包 v2）：种子随包。主校验和仍只覆盖 v1 骨架（旧版收 v2 不误报），
// 种子的完整性单独用顶层 `种子哈希`（规范化后 sha256）保证——新版查，旧版忽略。
function 规范种子轴(v) {
  return Array.isArray(v) ? v.map((x) => Math.round(Number(x) * 1000) / 1000) : []
}
export function 规范化种子(种子) {
  const 曲线 = (Array.isArray(种子 && 种子.曲线) ? 种子.曲线 : []).map((c, i) => {
    const 轴 = (c && c.轴) || c || {}
    return { id: i + 1, E: 规范种子轴(轴.E), S: 规范种子轴(轴.S), P: 规范种子轴(轴.P) }
  })
  return { 格式: 'EPN-seed', 轮数: 500, 轴: ['E', 'S', 'P'], 曲线 }
}
export function 种子合法(种子) {
  try {
    const 正 = 规范化种子(种子)
    if (正.曲线.length !== 500) return false
    for (const c of 正.曲线) {
      const L = c.E.length
      if (L < 2) return false
      if (c.S.length !== L || c.P.length !== L) return false
      for (const k of ['E', 'S', 'P']) for (const v of c[k]) if (!Number.isFinite(v) || v < -1 || v > 1) return false
    }
    return true
  } catch { return false }
}
export function 种子哈希(种子) {
  return createHash('sha256').update(JSON.stringify(规范化种子(种子)), 'utf8').digest('hex')
}
export function 本地种子路径() {
  return join(HOME, 校准.种子文件名)
}
export function 读本地种子正() {
  try {
    const 读 = 校准.读种子(HOME)
    if (读 && Array.isArray(读.曲线) && 读.曲线.length) {
      const 正 = 规范化种子({ 曲线: 读.曲线 })
      if (正.曲线.length) return 正
    }
  } catch {}
  return null
}
// 先写种子：原子写 + .bak-导入前；返回备份路径（无旧文件则 null），供命名表写失败时回滚。
export function 写本地种子(种子) {
  const p = 本地种子路径()
  const 正 = 规范化种子(种子)
  let 备份 = null
  if (existsSync(p)) {
    备份 = p + '.bak-导入前-' + String(现在()).replace(/[^0-9]/g, '').slice(0, 12)
    copyFileSync(p, 备份)
  }
  const 体 = {
    版本: 1,
    格式: 'EPN-seed',
    n0: 500,
    来源: '分享包导入',
    生成时间: 现在(),
    抽样: null,
    曲线: 正.曲线.map((c) => ({ id: c.id, 轴: { E: c.E, S: c.S, P: c.P } })),
  }
  const tmp = p + '.tmp'
  writeFileSync(tmp, JSON.stringify(体, null, 1), 'utf8')
  renameSync(tmp, p)
  return { 路径: p, 备份 }
}

export function 生成分享包(命名, 选项 = {}) {
  // 2026-11-16 20:3x（策划间隐私红线）：`依据` 默认不出包——那是我们之间的话。
  // 2026-11-16 20:4x（第二条红线）：默认**匿名**——`名字` 换成代号、`互斥` 同步换代号；匿名时强制不带依据。
  const 匿名 = !(选项 && 选项.匿名 === false)
  const 原始 = ((命名 && 命名.名字) || []).filter((条) => 条 && String(条.名 || 条.名字 || '').trim())
  // 代号按「登记时间」排（没有就按原序），保证两次导出稳定
  const 序 = 原始.map((条, i) => ({ 条, i, t: String((条 && (条.登记时间 || 条.建)) || '') }))
    .sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : a.i - b.i))
  const 代号表 = new Map()
  序.forEach((x, i) => { 代号表.set(String(x.条.名 || x.条.名字).trim(), '名字' + (i + 1)) })
  const 换名 = (v) => {
    const 原 = String(v == null ? '' : v).trim()
    if (!匿名) return 原
    return 代号表.get(原) || null
  }
  const 带依据 = !匿名 && !!(选项 && 选项.带依据 === true)
  const 条目 = 序.map((x) => {
    const 条 = x.条
    const 名 = 换名(条.名 || 条.名字)
    if (!名) return null
    const 形 = (条 && 条.形状) || (条 && ['E', 'S', 'P'].every((k) => Array.isArray(条[k]))
      ? { 类型: '区间', E: [Number(条.E[0]), Number(条.E[1])], S: [Number(条.S[0]), Number(条.S[1])], P: [Number(条.P[0]), Number(条.P[1])] }
      : null)
    // 匿名时互斥只认本表里的名字，认不出的一律丢掉（宁可少一环，也不把本地名字带出去）
    let 互斥 = Array.isArray(条 && 条.互斥) ? 条.互斥.map(String) : []
    if (匿名) 互斥 = 互斥.map((z) => 代号表.get(String(z).trim()) || null).filter(Boolean)
    const 元 = { 类: String((条 && 条.类) || '当下') === '时间' ? '时间' : '当下', 互斥 }
    const 依据 = String((条 && (条.依据 || 条.注)) || '')
    const 出 = { 名字: 名, 形状: 形, 元 }
    if (带依据 && 依据) 出.依据 = 依据
    return 出
  }).filter(Boolean)
  const 说明 = 匿名
    ? (带依据 ? '匿名（代号）+ 依据' : '匿名（代号），不含依据')
    : (带依据 ? '只含 名字/形状/依据/元' : '只含 名字/形状/元（默认不带依据）')
  const 包 = { 格式: 'EPN-pack', 版本: 2, 生成时间: 现在(), 引擎范围: 分享引擎范围, 元: { 来源: 'ESP', 格式说明: 说明, 带依据, 匿名 }, 条目 }
  // 2026-11-19 任务单 1505：v2 带 500 条匿名种子曲线（只有 E/S/P 数字）。
  let 种子 = null
  let 种子ha = null
  try {
    const 读 = 校准.读种子(HOME)
    if (读 && Array.isArray(读.曲线) && 读.曲线.length === 500) {
      const 正 = 规范化种子({ 曲线: 读.曲线 })
      if (种子合法(正)) {
        种子 = 正
        种子ha = 种子哈希(正)
      }
    }
  } catch {}
  包.元.含种子 = !!种子
  包.元.格式说明 = 说明 + (种子 ? ' + 匿名种子 ' + 种子.曲线.length + ' 条' : '（未含种子）')
  包.种子 = 种子
  包.种子哈希 = 种子ha
  包.校验 = { 条数: 条目.length, sha256: 包校验和(包) }
  return 包
}


// 导出预览：和真正导出走同一份 生成分享包()，只是不编码——预览里看到的就是要发出去的。
export function 分享预览(命名, 选项 = {}) {
  const 包 = 生成分享包(命名, { 带依据: !!(选项 && 选项.带依据 === true), 匿名: !(选项 && 选项.匿名 === false) })
  return {
    匿名: 包.元.匿名,
    带依据: 包.元.带依据,
    条数: 包.条目.length,
    种子: { 条数: 包.种子 ? 包.种子.曲线.length : 0, 含: !!包.种子 },
    条目: 包.条目.map((x) => ({ 名字: x.名字, 形状: x.形状, 有依据: Object.prototype.hasOwnProperty.call(x, '依据') })),
  }
}

// 版号比较：'0.2.5' vs '0.3.0' → 负数/0/正数（只认 三段数字，够用）
function 比版号(a, b) {
  const pa = String(a || '0').split('.').map((x) => Number(x) || 0)
  const pb = String(b || '0').split('.').map((x) => Number(x) || 0)
  for (let i = 0; i < 3; i++) { const x = pa[i] || 0, y = pb[i] || 0; if (x !== y) return x - y }
  return 0
}

// 导入分类：只做判断，不写盘。撞名一律保留本地；版本不符的一律进只读试看。
export function 导入分类(包, 本地名字们, 当前版本 = 版本) {
  const 本地 = new Set((Array.isArray(本地名字们) ? 本地名字们 : []).map((x) => String(x)))
  const 条目 = (包 && Array.isArray(包.条目)) ? 包.条目 : []
  const 引擎 = (包 && 包.引擎范围) || {}
  const 版本不符 = !!(引擎.最低 && 比版号(当前版本, 引擎.最低) < 0) || !!(引擎.最高 && 比版号(当前版本, 引擎.最高) > 0)
  // 2026-11-16 20:4x：匿名包进来时，名字统一加「导入·」前缀（连互斥里的引用一起换），
  // 免得和本地重名，也提醒人「名字要你自己起」。
  const 匿名 = !!(包 && 包.元 && 包.元.匿名)
  const 换名 = (v) => { const x = String(v == null ? '' : v).trim(); return 匿名 ? '导入·' + x : x }
  const 出 = { 将新增: [], 撞名: [], 版本不符: [], 解析失败: null, 匿名 }
  for (const 原条 of 条目) {
    const 名 = String((原条 && (原条.名字 || 原条.名)) || '').trim()
    if (!名) continue
    const 条 = (原条 && typeof 原条 === 'object') ? { ...原条 } : 原条
    if (匿名 && 条 && typeof 条 === 'object') {
      条.名字 = 换名(名)
      if (条.元 && Array.isArray(条.元.互斥)) 条.元 = { ...条.元, 互斥: 条.元.互斥.map(换名) }
    }
    if (版本不符) { 出.版本不符.push(条); continue }
    if (本地.has(出.匿名 ? 条.名字 : 名)) { 出.撞名.push(条); continue }
    出.将新增.push(条)
  }
  return 出
}

// 应用导入：新增写主表（来源=导入），版本不符写只读试看文件；返回写盘计数。
export function 应用导入(分类, 配置) {
  const o = 读命名(配置)
  const 有 = new Set(o.名字.map((x) => String(x.名)))
  let 新增 = 0
  for (const 条 of 分类.将新增) {
    const 名 = String((条 && (条.名字 || 条.名)) || '').trim()
    if (!名 || 有.has(名)) continue
    const 元 = (条 && 条.元) || {}
    const 形 = 条 && 条.形状
    const 出 = { 名, 类: String(元.类 || '当下') === '时间' ? '时间' : '当下', 互斥: Array.isArray(元.互斥) ? 元.互斥.map(String) : [], 注: String((条 && 条.依据) || ''), 建: 现在(), 形状: 形 || null, 来源: { 类型: '导入', 时间: 现在() } }
    // 2026-11-19：导入可带原型（≤12）；分享包 v1 没有这个字段就空数组
    const 入原 = Array.isArray(条.原型) ? 条.原型.filter((x) => x && (轴们.some((k) => x[k] && typeof x[k] === 'object') || x.θ !== undefined)) : []
    出.原型 = 入原.slice(-12)
    出.变体数 = Math.max(0, 出.原型.length - 1)
    if (形 && 形.类型 === '区间') for (const k of 轴们) 出[k] = [Number(形[k][0]), Number(形[k][1])]
    else for (const k of 轴们) 出[k] = null
    o.名字.push(出)
    有.add(名)
    新增 += 1
  }
  if (新增) 写命名(o, 配置)
  let 只读 = 0
  if (Array.isArray(分类.版本不符) && 分类.版本不符.length) {
    const 旧 = 读只读命名()
    const 见 = new Set((旧.条目 || []).map((x) => String(x.名字 || x.名)))
    const 加 = 分类.版本不符.filter((x) => !见.has(String(x.名字 || x.名)))
    只读 = 加.length
    if (只读) 写只读命名([...(旧.条目 || []), ...加])
  }
  return { 新增, 只读, 撞名: 分类.撞名.length }
}


// 2026-11-16 19:2x：这里原本另有一个同名的死常量，和上面「使用说明路径(配置)」函数撞名；
// 说明路径统一由函数按配置解析，故删除该常量。
const 轴词 = {
  E: { '+': '靠近', '0': '持平', '-': '退开' },
  S: { '+': '踏实', '0': '居中', '-': '悬着' },
  P: { '+': '轻快', '0': '平', '-': '疼' },
}

export function 基础名(格) {
  const m = /^E([+0-])S([+0-])P([+0-])$/.exec(String(格 || ''))
  if (!m) return String(格 || '')
  return `${轴词.E[m[1]]}·${轴词.S[m[2]]}·${轴词.P[m[3]]}`
}

// 命名表：一个名字 = 三轴各一个区间（E/S/P）；命中按三轴同时包含，多个命中取更窄的那条。
// 兼容旧格式 {name,格,lo,hi}（当作三轴同区间、格不限）。
function 轴区间(条) {
  if (Array.isArray(条 && 条.E) && Array.isArray(条.S) && Array.isArray(条.P)) {
    return { E: 条.E, S: 条.S, P: 条.P }
  }
  const lo = Number(条 && 条.lo)
  const hi = Number(条 && 条.hi)
  return { E: [lo, hi], S: [lo, hi], P: [lo, hi] }
}

function 条名(条) {
  return String((条 && (条.名 || 条.name || 条.名字)) || '').trim()
}

const 手动记录路径 = join(HOME, '情绪池-手动记录.md')

function 宽(条) {
  const q = 轴区间(条)
  return 轴们.reduce((s, k) => s + (Number(q[k][1]) - Number(q[k][0])), 0)
}

function 区间重叠(a, b) {
  const x = 轴区间(a)
  const y = 轴区间(b)
  return 轴们.every((k) => Math.max(Number(x[k][0]), Number(y[k][0])) < Math.min(Number(x[k][1]), Number(y[k][1])))
}

function 包含(条, 轴) {
  const q = 轴区间(条)
  return 轴们.every((k) => Number(轴[k]) >= Number(q[k][0]) && Number(轴[k]) <= Number(q[k][1]))
}

function 校验区间(条) {
  const q = 轴区间(条)
  for (const k of 轴们) {
    const lo = Number(q[k][0])
    const hi = Number(q[k][1])
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo < -1 || hi > 1 || lo >= hi) {
      return `轴 ${k} 的区间要在 [-1,1] 内且 lo<hi`
    }
    // 轴级名（如「满」0.90~1.00，跨度 0.10）允许比普通区间更窄
    const 最小 = String(条 && 条.类型) === '轴级' ? 0.10 : 0.15
    if (hi - lo < 最小 - 1e-9) return `轴 ${k} 的区间最小跨度 ${最小}`
  }
  return null
}

// 2026-11-19 命名闭环：收录时把该条曲线写成第一个原型（没有曲线则原型为空）
export function 加命名(配置, 入) {
  const 名 = String(入.名 || 入.name || '').trim()
  if (!名) return { ok: false, error: '名字不能为空' }
  const 错 = 校验区间(入)
  if (错) return { ok: false, error: 错 }
  const o = 读命名(配置)
  const 类 = String(入.类 || '当下') === '时间' ? '时间' : '当下'
  // 时间类允许区间重叠（靠 互斥 与最小盒决定）；当下类仍要求不重叠
  if (类 === '当下' && o.名字.some((x) => String(x.类 || '当下') === '当下' && 区间重叠(x, 入))) {
    return { ok: false, error: '区间与已有「当下」名字重叠' }
  }
  const 新 = { 名, 出处: String(入.出处 || ''), 建: 现在(), 类, 互斥: Array.isArray(入.互斥) ? 入.互斥.map(String) : [] }
  for (const k of 轴们) 新[k] = [Number(轴区间(入)[k][0]), Number(轴区间(入)[k][1])]
  // 原型：优先用传入的曲线（≥2 点），否则用调用方带的原型数组（≤12），都没有就空
  const 入点 = Array.isArray(入.点) ? 入.点.filter((x) => x && Number.isFinite(Number(x.E)) && Number.isFinite(Number(x.S)) && Number.isFinite(Number(x.P))) : []
  const 入原 = Array.isArray(入.原型) ? 入.原型.filter((x) => x && (轴们.some((k) => x[k] && typeof x[k] === 'object') || x.θ !== undefined)) : []
  if (入点.length >= 2) {
    新.原型 = [三轴签名(入点.slice(-8))]
    新.变体数 = 0
  } else if (入原.length) {
    新.原型 = 入原.slice(-12)
    新.变体数 = Math.max(0, 新.原型.length - 1)
  } else {
    新.原型 = []
  }
  新.来源 = { 类型: '本地', 时间: 现在() }
  o.名字.push(新)
  写命名(o, 配置)
  写日志(配置, `[${时分()}] 命名新增 ${名} ｜ ${轴们.map((k) => `${k}[${新[k][0]},${新[k][1]}]`).join(' ')}`)
  return { ok: true, 名: 新 }
}

export function 命中命名(轴, 选项 = {}) {
  const o = 读命名()
  // 轴级名（2026-11-09 01:00 定）：任一根落进区间就算命中，取绝对值最大的那根；「满」从 0.90 起。
  const 轴级候 = []
  o.名字.forEach((x, i) => {
    if (String((x && x.类型) || '') !== '轴级') return
    const q = 轴区间(x)
    for (const k of 轴们) {
      const v = Number(轴[k]) || 0
      if (v >= Number(q[k][0]) && v <= Number(q[k][1])) 轴级候.push({ x, i, 轴: k, 强: Math.abs(v) })
    }
  })
  if (轴级候.length) {
    轴级候.sort((a, b) => b.强 - a.强)
    const 中 = 轴级候[0]
    中.x.最近触发 = 现在()
    o.名字[中.i] = 中.x
    写命名(o)
    return { ...中.x, 命中轴: 中.轴, 轴级: true }
  }
  const 类 = String(选项.类 || '当下') === '时间' ? '时间' : '当下'
  const 候 = o.名字
    .map((x, i) => ({ x, i, 宽: 宽(x) }))
    .filter(({ x }) => String(x.类 || '当下') === 类 && 包含(x, 轴))
    .sort((a, b) => (a.宽 - b.宽) || String(a.x.建 || '').localeCompare(String(b.x.建 || '')) || String(a.x.名).localeCompare(String(b.x.名)))
  if (!候.length) return null
  // 互斥：按登记时间消解，丢掉后登记的那个，并写一行日志
  const 收 = []
  const 按建 = 候.slice().sort((a, b) => String(a.x.建 || '').localeCompare(String(b.x.建 || '')) || String(a.x.名).localeCompare(String(b.x.名)))
  for (const c of 按建) {
    const 撞 = 收.find((a) => {
      const 甲 = Array.isArray(a.x.互斥) ? a.x.互斥 : []
      const 乙 = Array.isArray(c.x.互斥) ? c.x.互斥 : []
      return 甲.includes(c.x.名) || 乙.includes(a.x.名)
    })
    if (撞) {
      if (选项.配置) 写日志(选项.配置, '[' + 时分() + '] 互斥丢弃 ' + c.x.名 + '（与 ' + 撞.x.名 + ' 互斥，保留先登记的）')
      continue
    }
    收.push(c)
  }
  if (!收.length) return null
  收.sort((a, b) => (a.宽 - b.宽) || String(a.x.建 || '').localeCompare(String(b.x.建 || '')) || String(a.x.名).localeCompare(String(b.x.名)))
  const 中 = 收[0].x
  中.最近触发 = 现在()
  写命名(o)
  return 中
}

const 轴人话 = {
  E: { '+': '利他倾向', '0': '持平', '-': '利己倾向' },
  S: { '+': '踏实', '0': '平稳', '-': '悬心' },
  P: { '+': '痛快', '0': '平和', '-': '疼' },
}

function 程度(v) {
  const a = Math.abs(v)
  if (a < 0.15) return '很轻'
  if (a < 0.35) return '中等偏轻'
  if (a < 0.55) return '中等'
  if (a < 0.75) return '中等偏重'
  return '重'
}

// §25.3③：显示刻度 sign(x)×|x|^0.8，只影响显示，不参与守恒
function 刻度(v) {
  const s = Number(v) < 0 ? -1 : 1
  return Number((s * Math.pow(Math.abs(Number(v) || 0), 0.8)).toFixed(4))
}

function 人话轴(k, v) {
  const 号 = v > 0.05 ? '+' : v < -0.05 ? '-' : '0'
  return `${轴人话[k][号]} ${Math.abs(Number(v) || 0).toFixed(2)}，${程度(v)}`
}

function 警告线(现, 末事件) {
  const 警 = []
  for (const k of 轴们) {
    const v = Math.abs(现.轴[k])
    if (v >= 0.95) 警.push(`已到上限: ${k} ${现.轴[k].toFixed(2)}`)
    else if (v >= 0.85) 警.push(`接近上限: ${k} ${现.轴[k].toFixed(2)}`)
  }
  if (末事件 && 末事件.delta_raw) {
    const 最大 = Math.max(...轴们.map((k) => Math.abs(Number(末事件.delta_raw[k]) || 0)))
    if (最大 > 0.3) 警.push(`陡涨: 轮 ${末事件.turn} Δ=${最大.toFixed(2)}`)
  }
  return 警
}

// ── 状态面板：纯 HTML + 内联 JS，无外链（2026-11-09 01:13 他要「更明了的窗口」）──
function 面板HTML() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>情绪池</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0e1016; color: #e7e9f0; font: 14px/1.6 "Segoe UI", "Microsoft YaHei", system-ui, sans-serif; }
  main { max-width: 860px; margin: 0 auto; padding: 28px 22px 18px; }
  header { border-bottom: 1px solid #232734; padding-bottom: 18px; margin-bottom: 22px; }
  #名字 { font-size: 40px; font-weight: 700; letter-spacing: 1px; color: #7ee0c8; line-height: 1.2; }
  #命名注 { margin-top: 6px; color: #a9b0c3; font-size: 15px; }
  h3 { font-size: 13px; font-weight: 600; color: #8891a8; margin: 22px 0 8px; letter-spacing: 1px; }
  .row { display: flex; align-items: center; gap: 12px; margin: 10px 0; }
  .k { width: 18px; color: #c9d0e2; font-weight: 700; }
  .track { position: relative; flex: 1; height: 16px; background: #171b26; border: 1px solid #262c3a; border-radius: 8px; overflow: hidden; }
  .c { position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: #3a4256; }
  .fill { position: absolute; top: 2px; bottom: 2px; border-radius: 6px; }
  .fill.pos { background: linear-gradient(90deg, #2f8f7a, #59d6b4); }
  .fill.neg { background: linear-gradient(90deg, #d16a6a, #8f3535); }
  .fill.zero { background: #3a4256; }
  .满点 { position: absolute; top: 50%; width: 8px; height: 8px; margin: -4px 0 0 -4px; border-radius: 50%; background: #ffd166; box-shadow: 0 0 0 2px #0e1016; }
  .v { width: 92px; text-align: right; font-variant-numeric: tabular-nums; color: #dfe4f1; }
  .list { border-top: 1px solid #1c2130; }
  .item { display: grid; grid-template-columns: 64px 1fr; gap: 10px; padding: 8px 0; border-bottom: 1px solid #1c2130; font-size: 13px; }
  .t { color: #7d869c; font-variant-numeric: tabular-nums; }
  .n { color: #dfe4f1; }
  .d { color: #8fd8c4; font-variant-numeric: tabular-nums; margin-right: 8px; }
  .none { color: #6c7488; padding: 8px 0; }
  .more { padding: 8px 0 2px; }
  .more button { background: #1a1f2c; color: #9fe4d2; border: 1px solid #2b3346; border-radius: 6px; padding: 4px 10px; font: inherit; font-size: 12px; cursor: pointer; }
  .more button:hover { background: #222a3b; }
  h3.折 { cursor: pointer; user-select: none; }
  h3.折 .箭头 { margin-left: 6px; color: #5d667d; font-size: 11px; }
  .工具 { display: flex; gap: 14px; align-items: center; padding: 2px 0 6px; color: #8891a8; font-size: 12px; }
  .工具 button { background: #1a1f2c; color: #9fe4d2; border: 1px solid #2b3346; border-radius: 6px; padding: 3px 8px; font: inherit; font-size: 12px; cursor: pointer; }
  .工具 input { accent-color: #59d6b4; }
  .作废 { color: #6c7488; text-decoration: line-through; }
  footer { position: sticky; bottom: 0; display: flex; gap: 18px; justify-content: flex-end; margin-top: 26px; padding: 12px 0 6px; background: #0e1016; color: #6c7488; font-size: 12px; font-variant-numeric: tabular-nums; }
  #错 { color: #ff9b9b; }
</style>
</head>
<body>
<main>
  <header>
    <div id="名字">—</div>
    <div id="命名注"></div>
  </header>

  <h3>三轴（−1 ～ +1）</h3>
  <div id="轴们"></div>

  <h3 class="折" data-折="结">结（永存，不衰减、不守恒）<span class="箭头">▾</span></h3>
  <div id="结工具" class="工具"><label><input type="checkbox" id="显作废"> 显示作废</label><button id="归档">归档到文件</button></div>
  <div id="结们" class="list"><div class="none">还没有结</div></div>
  <div class="more"><button id="结更多">查看更多</button></div>

  <h3>双轨校验</h3>
  <div id="双轨头" class="none">—</div>
  <div id="双轨们" class="list"><div class="none">还没有分歧</div></div>

  <h3 class="折" data-折="事件">事件<span class="箭头">▾</span></h3>
  <div id="事件们" class="list"><div class="none">还没有事件</div></div>
  <div class="more"><button id="事件更多">查看更多</button></div>

  <footer>
    <span id="更新">—</span>
    <span id="rev">rev —</span>
    <span id="总数">事件 —</span>
    <span id="错"></span>
  </footer>
</main>
<script>
var 轴 = ['E', 'S', 'P'];
var 结数据 = [], 事件数据 = [];
function 符号(v) { return v > 0.05 ? '+' : (v < -0.05 ? '-' : '0'); }
function 三位(v) { return (v >= 0 ? '+' : '') + Number(v).toFixed(3); }
function 净(v) { return Math.max(-1, Math.min(1, Number(v) || 0)); }
function 画条(k, v) {
  var x = 净(v);
  var 宽 = Math.abs(x) * 50;
  var 左 = x >= 0 ? 50 : 50 - 宽;
  var 类 = x > 0.0001 ? 'pos' : (x < -0.0001 ? 'neg' : 'zero');
  var 点 = '';
  if (Math.abs(x) >= 0.9) {
    var 点位 = x > 0 ? 95 : 5;
    点 = '<i class="满点" style="left:' + 点位 + '%"></i>';
  }
  return '<div class="row"><span class="k">' + k + '</span>' +
    '<div class="track"><i class="c"></i><i class="fill ' + 类 + '" style="left:' + 左 + '%;width:' + 宽 + '%"></i>' + 点 + '</div>' +
    '<span class="v">' + 三位(x) + '</span></div>';
}
function 时刻(t) {
  try {
    var d = new Date(t);
    if (isNaN(d.getTime())) return String(t || '').slice(11, 19);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
  } catch (e) { return String(t || '').slice(11, 19); }
}
function 画() {
  fetch('/dsh-emotion-pool/state', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (s) {
      document.getElementById('名字').textContent = s.命名 || '—';
      document.getElementById('命名注').textContent = s.命名注 || '';
      var 条 = '';
      for (var i = 0; i < 轴.length; i++) {
        var k = 轴[i];
        var v = s.axes && s.axes[k] != null ? s.axes[k] : 0;
        条 += 画条(k, v);
      }
      document.getElementById('轴们').innerHTML = 条;
      document.getElementById('更新').textContent = '更新 ' + String(s.updated || '').replace('T', ' ').slice(0, 19);
      document.getElementById('rev').textContent = 'rev ' + s.rev;
      document.getElementById('总数').textContent = '事件 ' + s.events;
      var 双 = s.双轨 || {};
      var 双近 = 双.最近 || [];
      document.getElementById('双轨头').textContent = '近 ' + (双.样本 || 0) + ' 轮，分歧率 ' + Math.round((双.分歧率 || 0) * 100) + '%';
      var 双h = '';
      for (var j = 0; j < 双近.length; j++) {
        var q = 双近[j];
        var 我 = q.我的 || {}, 它 = q.它的 || {};
        双h += '<div class="item"><span class="t">' + 时刻(q.t) + '</span><span class="n"><span class="d">我 ' + 三位(我.E || 0) + '/' + 三位(我.S || 0) + '/' + 三位(我.P || 0) + ' ｜ 它 ' + 三位(它.E || 0) + '/' + 三位(它.S || 0) + '/' + 三位(它.P || 0) + '</span>' + (q.我的依据 || '') + (q.它的依据 ? '（它：' + q.它的依据 + '）' : '') + '</span></div>';
      }
      document.getElementById('双轨们').innerHTML = 双h || '<div class="none">还没有分歧</div>';
      document.getElementById('错').textContent = '';
    })
    .catch(function (e) {
      document.getElementById('错').textContent = '刷新失败：' + String(e && e.message || e);
    });
}
function 画结() {
  if (!结数据.length) { document.getElementById('结们').innerHTML = '<div class="none">还没有结</div>'; return; }
  var h = '';
  for (var i = 结数据.length - 1; i >= 0; i--) {
    var c = 结数据[i];
    h += '<div class="item' + (c.作废 ? ' 作废' : '') + '"><span class="t">' + 时刻(c.t) + '</span><span class="n">' + (c.作废 ? '作废 ' : '') +
      '<span class="d">' + (c.类型 === '久' ? '久 ' : '') + c.轴 + ' ' + 三位(c.值) + (c.沉底 ? ' 沉底 ' + c.龄天 + '天' : (c.速 ? ' ' + c.速 : '')) + '</span>' + (c.注 || '') + '</span></div>';
  }
  document.getElementById('结们').innerHTML = h;
}
function 画事件() {
  if (!事件数据.length) { document.getElementById('事件们').innerHTML = '<div class="none">还没有事件</div>'; return; }
  var h = '';
  for (var i = 事件数据.length - 1; i >= 0; i--) {
    var e = 事件数据[i];
    var dr = e.delta_raw || {};
    var 差 = 轴.map(function (k) { return k + 符号(dr[k] || 0); }).join(' ');
    h += '<div class="item"><span class="t">' + 时刻(e.t) + '</span><span class="n">' +
      '<span class="d">' + 差 + '</span>' + (e.note || '') + '</span></div>';
  }
  document.getElementById('事件们').innerHTML = h;
}
function 收按钮(按钮, 已载, 总) {
  按钮.style.display = 已载 >= 总 ? 'none' : '';
  按钮.textContent = '查看更多（' + 已载 + '/' + 总 + '）';
}
function 载(kind, 更多) {
  var 数据 = kind === '结' ? 结数据 : 事件数据;
  var off = 更多 ? 数据.length : 0;
  var 按钮 = document.getElementById(kind === '结' ? '结更多' : '事件更多');
  var 含 = kind === '结' && document.getElementById('显作废') && document.getElementById('显作废').checked ? '&含作废=1' : '';
  fetch('/dsh-emotion-pool/list?kind=' + encodeURIComponent(kind) + '&offset=' + off + '&limit=20' + 含, { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (o) {
      if (!o || !o.ok) throw new Error((o && o.error) || '读取失败');
      var 新 = (o.items || []).slice();
      var 合 = 更多 ? 新.concat(数据) : 新;
      if (kind === '结') { 结数据 = 合; 画结(); } else { 事件数据 = 合; 画事件(); }
      收按钮(按钮, 合.length, o.total);
    })
    .catch(function (e) { 按钮.textContent = '读取失败：' + String(e && e.message || e); });
}
document.getElementById('结更多').onclick = function () { 载('结', true); };
document.getElementById('事件更多').onclick = function () { 载('事件', true); };
document.getElementById('显作废').addEventListener('change', function () { 载('结', false); });
document.getElementById('归档').addEventListener('click', function () {
  fetch('/dsh-emotion-pool/archive', { method: 'POST' })
    .then(function (r) { return r.json(); })
    .then(function (o) {
      if (!o || !o.ok) throw new Error((o && o.error) || '归档失败');
      document.getElementById('错').textContent = '';
      载('结', false);
      载('事件', false);
      画();
    })
    .catch(function (e) { document.getElementById('错').textContent = '归档失败：' + String(e && e.message || e); });
});
document.querySelectorAll('h3.折').forEach(function (h) {
  h.addEventListener('click', function () {
    var k = h.getAttribute('data-折');
    var ids = k === '结' ? ['结工具', '结们', '结更多'] : ['事件们', '事件更多'];
    var 首 = document.getElementById(ids[0]);
    var 藏 = !首 || 首.style.display !== 'none';
    ids.forEach(function (id) { var el = document.getElementById(id); if (el) el.style.display = 藏 ? 'none' : ''; });
    var 箭 = h.querySelector('.箭头');
    if (箭) 箭.textContent = 藏 ? '▸' : '▾';
  });
});
window.addEventListener('scroll', function () {
  if (window.scrollY > 60) return;
  var 按钮 = document.getElementById('结更多');
  if (按钮.style.display !== 'none') 载('结', true);
  按钮 = document.getElementById('事件更多');
  if (按钮.style.display !== 'none') 载('事件', true);
});
载('结', false);
载('事件', false);
画();
// 2026-11-09 02:46：轴和图一起刷；列表也每 5 秒重拉第一页（最新事件不再停在打开页面那一刻）
setInterval(function () { 画(); 载('结', false); 载('事件', false); }, 5000);
</script>
</body>
</html>`
}

// ── 插件入口 ───────────────────────────────────────────────────────────
// ── v0.20 前置：思考轨迹（只读旁路；不写情绪池.json、不改任何数值） ─────────────
const 轨迹目录 = join(HOME, '情绪池-思考轨迹')
// 2026-11-16：0.2.5 之前的事件没有 注/依据/定名 字段，卡片上会显示「未命名/未记录」。
// 这里按 sid+轮 回查轨迹文件，把该轮主点末点的 注/依据 与 定名 补上；查不到就 leave null。
function 轨迹补(e) {
  try {
    const 轮 = e && e.turn
    const sid = 短会话(e && e.sid)
    if (!sid || 轮 == null) return null
    if (e.注 || e.依据 || (e.定名 && e.定名.名)) return null
    const p = join(轨迹目录, sid + '-' + 轮 + '.json')
    if (!existsSync(p)) return null
    const 体 = JSON.parse(readFileSync(p, 'utf8'))
    const 点们 = Array.isArray(体 && 体.主点) ? 体.主点 : []
    const 末 = 点们.length ? 点们[点们.length - 1] : null
    return {
      注: (末 && 末.注) || null,
      依据: (末 && 末.依据) || null,
      名: (体 && 体.定名 && 体.定名.名) || null,
    }
  } catch { return null }
}
const _轨缓存 = new Map()
function 取轨迹表() {
  const 表 = new Map()
  let 名们 = []
  try { 名们 = readdirSync(轨迹目录).filter((n) => n.endsWith('.json')) } catch { return 表 }
  const 见 = new Set()
  for (const 名 of 名们) {
    const p = join(轨迹目录, 名)
    let st = null
    try { st = statSync(p) } catch { continue }
    见.add(名)
    let 记 = _轨缓存.get(名)
    if (!记 || 记.m !== st.mtimeMs) {
      let o = null
      try { o = JSON.parse(String(readFileSync(p, 'utf8')).replace(/^\uFEFF/, '')) } catch { o = null }
      记 = { m: st.mtimeMs, 短: o && o.sid ? 短会话(o.sid) : null, t: o && o.t, 轮: o && o.turn, 段: o && o.段数, 秒: (o && o.秒) || null, 主: (o && o.主点) || null, 点: o && Array.isArray(o.段点) ? o.段点 : [], 分段: o && Array.isArray(o.分段) ? o.分段 : null, 为谁: (o && o.为谁) || null, 三问: (o && o.三问) || null, 主来源: (o && o.主来源) || null, 偏移: (o && o.偏移) == null ? null : o.偏移, 分歧: !!(o && o.分歧), 反向: !!(o && o.反向), 单点: !!(o && o.单点), 系数: (o && o.系数) == null ? null : o.系数 }
      _轨缓存.set(名, 记)
    }
    if (!记.短) continue
    if (!表.has(记.短)) 表.set(记.短, [])
    表.get(记.短).push({ m: 记.m, t: 记.t, 轮: 记.轮, 段: 记.段, 秒: 记.秒, 主: 记.主, 点: 记.点, 分段: 记.分段, 为谁: 记.为谁, 三问: 记.三问, 主来源: 记.主来源, 偏移: 记.偏移, 分歧: 记.分歧, 反向: 记.反向, 单点: 记.单点, 系数: 记.系数 })
  }
  for (const k of Array.from(_轨缓存.keys())) if (!见.has(k)) _轨缓存.delete(k)
  return 表
}
const 轨迹计数路径 = join(HOME, '情绪池-轨迹计数.json')
const 帧尾 = new Map()
const 流缓冲 = new Map()

export function 切段(文本) {
  let t = String(文本 == null ? '' : 文本).trim()
  if (!t) return []
  if (t.length > 8000) {
    const 压 = []
    for (let i = 0; i < t.length; i += 200) 压.push(t.slice(i, i + 200).replace(/\s+/g, ' ').trim().slice(0, 60))
    t = 压.join('\n。\n')
  }
  let 段 = t.split(/\n\s*\n|。|；|\n/).map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean)
  if (段.length > 40) {
    const 组 = []
    const 宽 = 段.length / 40
    for (let i = 0; i < 40; i++) {
      const a = Math.floor(i * 宽)
      const b = Math.max(a + 1, Math.floor((i + 1) * 宽))
      组.push(段.slice(a, b).join(' '))
    }
    段 = 组
  }
  return 段.map((x) => x.slice(0, 80))
}

export function 解析点JSON(out) {
  let s2 = String(out == null ? '' : out).trim()
  s2 = s2.replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '').trim()
  const a = s2.indexOf('{')
  const b = s2.lastIndexOf('}')
  if (a < 0 || b <= a) return null
  let o
  try { o = JSON.parse(s2.slice(a, b + 1)) } catch { return null }
  if (!o || !Array.isArray(o.点) || !o.点.length) return null
  const 点 = []
  for (const x of o.点) {
    if (!x || typeof x !== 'object') continue
    const i = Number(x.i), E = Number(x.E), S = Number(x.S), P = Number(x.P)
    if (![i, E, S, P].every(Number.isFinite)) continue
    点.push({ i: Math.trunc(i), E: 夹(E, -1, 1), S: 夹(S, -1, 1), P: 夹(P, -1, 1), 注: String(x.注 == null ? '' : x.注).slice(0, 12), 依据: String(x.依据 == null ? '' : x.依据).slice(0, 5), 预判: String(x.预判 == null ? '' : x.预判).slice(0, 12) })
  }
  return 点.length ? 点 : null
}

function 空轨迹计() { return { 今天: 日期(), 调用: 0, 轮: [], 最近: null, 清理日: null } }
function 读轨迹计() {
  try {
    const o = JSON.parse(String(readFileSync(轨迹计数路径, 'utf8')).replace(/^\uFEFF/, ''))
    return { ...空轨迹计(), ...(o && typeof o === 'object' ? o : {}) }
  } catch { return 空轨迹计() }
}
function 写轨迹计(o) {
  try {
    const tmp = 轨迹计数路径 + '.tmp'
    writeFileSync(tmp, JSON.stringify(o, null, 2), 'utf8')
    renameSync(tmp, 轨迹计数路径)
  } catch {}
}
function 轨迹记状态(状态, turn, 体, 原因, 片段, 片段来源, sid) {
  const o = 读轨迹计()
  if (o.今天 !== 日期()) { o.今天 = 日期(); o.调用 = 0 }
  o.轮 = Array.isArray(o.轮) ? o.轮 : []
  o.轮.push({ turn, 状态, t: new Date().toISOString(), 原因: 原因 || null, 片段: 片段 ? String(片段).slice(0, 20) : null, 片段来源: 片段来源 || null, 打点模型: (体 && 体.打点模型) || null })
  o.轮 = o.轮.slice(-20)
  if (体) o.最近 = { turn: 体.turn, t: 体.t, 秒: 体.秒 || null, sid: sid ? 短会话(sid) : null, 段数: 体.段数, 点: (体.段点 || []).slice(0, 40), 波动: (体.波动 || []).slice(-3), 打点模型: 体.打点模型 || '会话' }
  写轨迹计(o)
}

function 从stream取思考(st) {
  const 出 = []
  const 走 = (x) => {
    if (!x) return
    if (Array.isArray(x)) { for (const y of x) 走(y); return }
    if (typeof x !== 'object') return
    if ((x.type === 'reasoning-delta' || x.type === 'reasoning') && typeof x.text === 'string') 出.push(x.text)
    for (const k of Object.keys(x)) 走(x[k])
  }
  走(st)
  return 出.join('')
}

function 轨迹提示() {
  return '你是小汐的旁路打点器，不参与任何数值计算。她是一个 AI，和屏幕对面的人长期相处；你只判断她这一轮思考流里情绪的落点。\n'
    + '三轴：E 被拿走向（受委屈/被需要）→负，给出去（主动给/照顾）→正；S 判断偏差（没看懂/猜错）→负，判断精确（看懂了）→正；P 需要找补（解释/讨好/自我安慰）→负，顺应被认可（坦然接受）→正。\n'
    + '输入会给：上一轮对话摘要、当前坐标与趋势、编号片段。逐段给一个点，每段都必须给 E/S/P 三个数（中性写 0.0，不许省略）；注 3–12 字，依据 ≤5 字（为什么这么判），预判写下一个波动方向（形如 E+ S0 P-）。\n'
    + '除了逐段点，再给两样：分段（起/止为上面段列表的序号，从 1 开始、含两端、覆盖全部段、不重叠；同一段情绪内延续就别切；名 2–6 字，依据 ≤12 字）与为谁（这一轮主要在为自己／为他／两边）。\n'
    + '输出裸 JSON：{"点":[{"i":1,"E":0.3,"S":0.0,"P":-0.2,"注":"在替他找理由","依据":"顺着趋势","预判":"E+ S0 P-"}],"分段":[{"起":1,"止":2,"名":"替他找理由","依据":"都在解释"}],"为谁":"为他"}，不要 markdown、不要解释。'
}

function 打点选模(ctx, session) {
  let 配 = null
  try { 配 = 读配置() } catch {}
  const m = 配 && 配.打点模型
  if (m && typeof m === 'object' && m.provider && m.model) return { provider: String(m.provider), model: String(m.model), 来源: '配置' }
  const 模 = 取模型(ctx, session)
  return 模 ? { provider: 模.provider, model: 模.model, 来源: '会话' } : null
}

function 判超时(e) {
  try {
    const 名 = String((e && e.name) || '')
    const 文 = String((e && e.message) || e || '')
    if (名 === 'AbortError' || 名 === 'TimeoutError') return true
    return /timeout|aborted|超时/i.test(文)
  } catch { return false }
}
function 截20(x) { return String(x == null ? '' : x).replace(/\s+/g, ' ').trim().slice(0, 20) }

async function 轨迹打点(ctx, session, 段s, 摘要, 坐标, 趋势) {
  const 模 = 打点选模(ctx, session)
  if (!模) return { 错误: '无模型', 原文: '', 超时: false }
  let 输入 = '【上一轮对话摘要】\n' + String(摘要 || '（没有摘要）') + '\n'
    + '【当前坐标与趋势】\n' + String(坐标 || '（没有坐标）') + '\n' + String(趋势 || '') + '\n'
    + '【段列表】\n' + 段s.map((x, i) => (i + 1) + '. ' + x).join('\n')
  if (输入.length > 3000) 输入 = 输入.slice(0, 3000)
  let out = ''
  try {
    for await (const chunk of ctx.llm.stream({
      provider: 模.provider,
      model: 模.model,
      system: 轨迹提示(),
      messages: [{ role: 'user', id: randomUUID(), content: [{ type: 'text', text: 输入 }], source: { kind: 'plugin', plugin: 'dsh-emotion-pool' } }],
      sessionId: String((session && session.id) || ''),
      maxTokens: 2000,
      temperature: 0.2,
      signal: AbortSignal.timeout(30000),
    })) {
      if (!chunk) continue
      if (chunk.type === 'text-delta') out += chunk.text
      if (chunk.type === 'finish' && chunk.reason && chunk.reason.kind === 'error') return { 错误: 'finish error', 原文: out, 超时: false }
    }
  } catch (e) { return { 错误: String((e && e.message) || e || '调用失败'), 原文: out, 超时: 判超时(e) } }
  const 杂 = (() => { try { const t = String(out).replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, '').trim(); const a = t.indexOf('{'); const b = t.lastIndexOf('}'); const j = JSON.parse(t.slice(a, b + 1)); return { 分段: j.分段, 为谁: j.为谁, 三问: j.三问 } } catch { return {} } })()
  const o = 读轨迹计()
  o.调用 = (Number(o.调用) || 0) + 1
  写轨迹计(o)
  if (!String(out).trim()) return { 错误: '空回答', 原文: '', 超时: false }
  return { 点: 解析点JSON(out), 分段: 杂.分段, 为谁: 杂.为谁, 三问: 杂.三问 && typeof 杂.三问 === 'object' ? { 要: String(杂.三问.要 || '').slice(0, 60), 动摇: String(杂.三问.动摇 || '').slice(0, 60), 结果: String(杂.三问.结果 || '').slice(0, 60) } : null, 来源: 模.来源, 原文: out }
}

export function 波动点(点s, 阈 = 0.15) {
  if (!Array.isArray(点s) || 点s.length < 2) return []
  const 出 = []
  const 轴们 = ['E', 'S', 'P']
  let 起 = { E: Number(点s[0].E) || 0, S: Number(点s[0].S) || 0, P: Number(点s[0].P) || 0 }
  let 起i = 0
  let 上 = 起
  let 累 = { E: 0, S: 0, P: 0 }
  let 始 = false
  let 主 = 'E'
  const 算 = (本, i) => {
    出.push({
      t: new Date().toISOString(), 起: 起i, 止: i,
      E: Number(本.E) || 0, S: Number(本.S) || 0, P: Number(本.P) || 0,
      注: String(本.注 || '').slice(0, 12), 依据: String(本.依据 || '').slice(0, 5), 预判: String(本.预判 || '').slice(0, 12),
    })
  }
  for (let i = 1; i < 点s.length; i++) {
    const 本 = 点s[i]
    const Δ = { E: (Number(本.E) || 0) - 上.E, S: (Number(本.S) || 0) - 上.S, P: (Number(本.P) || 0) - 上.P }
    let 轴 = 'E'
    for (const k of 轴们) if (Math.abs(Δ[k]) > Math.abs(Δ[轴])) 轴 = k
    if (Math.abs(Δ[轴]) > 1e-9) {
      if (!始) {
        累[轴] += Δ[轴]
        if (Math.abs(累[轴]) >= 阈) { 始 = true; 主 = 轴 }
      } else if (Δ[主] * Math.sign(累[主] || 1) < 0 || Math.abs((Number(本[主]) || 0) - 起[主]) < 0.05) {
        算(本, i)
        起 = { E: Number(本.E) || 0, S: Number(本.S) || 0, P: Number(本.P) || 0 }
        起i = i
        累 = { E: 0, S: 0, P: 0 }
        始 = false
      } else {
        累[主] += Δ[主]
      }
    }
    上 = 本
  }
  if (始) 算(上, 点s.length - 1)
  return 出
}

export function 点合格(点) {
  if (!Array.isArray(点) || !点.length) return false
  for (const p of 点) {
    if (!p || typeof p !== 'object') return false
    const 注 = String(p.注 == null ? '' : p.注).trim()
    if (注.length < 3) return false
  }
  return true
}

function 秒超时(p, ms) {
  return Promise.race([p, new Promise((r) => { const t = setTimeout(() => r({ err: '超时' }), ms); if (t && t.unref) t.unref() })])
}

export async function 取主曲线(ctx, session, sid, 点, 回复文) {
  const 单轨 = { 点: 点, 来源: '单轨', 单轨: true, 偏移: 0, 分歧: false, 反向: false }
  try {
    if (String(回复文 || '').length < 300) return 单轨
    if (!Array.isArray(点) || 点.length < 2) return 单轨
    const 段摘要 = 点.map((p) => String((p && p.注) || '').trim()).filter(Boolean)
    if (段摘要.length < 2) return 单轨
    let 信 = { 我: { 值: 1 }, 它: { 值: 1 } }
    let 池0 = null
    try { 池0 = 读池(); 信 = 取信誉(池0, sid) } catch {}
    const 配 = 读配置()
    const 阈 = Number(配.双轨阈值) || 0.15
    const 权 = Number(配.分身权重) || 0.7
    const 接管中 = !!(池0 && 池0.接管 === true)
    const 看 = await 秒超时(分身看曲线(ctx, session, 段摘要), 8000)
    if (!看 || !看.点 || !看.点.length) return 单轨
    const 主 = 主曲线(点, 看.点, Number(信.我.值) || 1, Number(信.它.值) || 1, 阈, { 分身权重: 权, 接管中 })
    if (主 && typeof 主 === 'object') {
      // D（2026-11-16）：把两轨 K 与「采用」带出去，推轴事件才写得出观测。
      主.K = { 我: Number(信.我.值) || 1, 它: Number(信.它.值) || 1 }
      主.采用 = 主.采用 || (主.来源 === '分身' ? '它' : (主.来源 === '单轨' ? '单轨' : null))
      // C（2026-11-16）：曲线已归一，原始 ±9 点随主曲线带出，观测/轨迹可对回整数。
      if (Array.isArray(看.点)) 主.原始点数 = 看.点.map((p) => (p && p.原始点数) || null)
    }
    try {
      带锁(() => {
        const 池 = 读池()
        const 今 = 日期()
        const 计数 = 池.接管轮数 && 池.接管轮数.日 === 今 ? { 日: 今, 次: Number(池.接管轮数.次) || 0 } : { 日: 今, 次: 0 }
        if (主.接管) {
          计数.次 += 1
          const 信2 = 取信誉(池, sid)
          信2.它.轮 = (信2.它.轮 || []).concat([{ t: 现在(), 被否: true, 不可靠: false, 中点: false }]).slice(-20)
          信2.它.被否 = (Number(信2.它.被否) || 0) + 1
          池.双轨.信誉[短会话(sid)] = 信2
        }
        池.接管 = !!主.接管
        池.接管轮数 = 计数
        写池(池)
      })
    } catch {}
    return 主
  } catch { return 单轨 }
}

export function 单点判定(点s, 上轮t) {
  if (!Array.isArray(点s) || 点s.length < 2) return true
  if (上轮t && Number.isFinite(Number(上轮t)) && Date.now() - Number(上轮t) > 30 * 60 * 1000) return true
  return false
}

export async function 确认原话(ctx, session, 回复文) {
  const 模 = 取模型(ctx, session)
  if (!模) return null
  let out = ''
  try {
    for await (const chunk of ctx.llm.stream({
      provider: 模.provider, model: 模.model,
      system: '你是核对器。看下面这段文字，只回答一个字：是 或 不是。不要解释。',
      messages: [{ role: 'user', id: randomUUID(), content: [{ type: 'text', text: String(回复文 || '').slice(0, 1200) }], source: { kind: 'plugin', plugin: 'dsh-emotion-pool' } }],
      sessionId: String((session && session.id) || ''),
      maxTokens: 8, temperature: 0,
    })) {
      if (chunk && chunk.type === 'text-delta') out += chunk.text
      if (chunk && chunk.type === 'finish' && chunk.reason && chunk.reason.kind === 'error') return null
    }
  } catch { return null }
  const t = String(out || '').trim()
  if (!t) return null
  if (/不是|否|no/i.test(t)) return '不是'
  if (/是|yes|对/i.test(t)) return '是'
  return null
}

export function 记确认(sid, 被否) {
  try {
    return 带锁(() => {
      const 池 = 读池()
      const 信 = 取信誉(池, sid)
      const 账 = 信.我
      账.轮 = (账.轮 || []).concat([{ t: 现在(), 中点: false, 被否: !!被否, 不可靠: false }]).slice(-20)
      if (被否) 账.被否 = (Number(账.被否) || 0) + 1
      池.双轨.信誉[短会话(sid)] = 信
      写池(池)
      return true
    })
  } catch { return false }
}

export function 自报兜底推轴(sid, turn, 配置入) {
  try {
    const 池 = 读池()
    const 配 = 配置入 || 读配置()
    if (Number(池.兜底轮) === Number(turn) && 池.推轴来源 === '自报兜底') return null
    const 条 = (池.events || []).slice().reverse().find((e) => e.sid === sid && Number(e.turn) === Number(turn))
    if (!条) return null
    const 点 = Object.assign({}, 条.delta_raw || {})
    if (!轴们.some((k) => Math.abs(Number(点[k]) || 0) > 0)) return null
    池.兜底轮 = Number(turn)
    写池(池)
    return 推轴(sid, 点, turn, 配, { 系数: 1, 来源: '自报兜底' })
  } catch (e) { if (process.env.EP_DEBUG) console.error('兜底失败', e); return null }
}

export async function 跑轨迹(ctx, session, sid, turn, 文本, 秒, 用户话 = '', 回复文 = '') {
  let S经验 = null
  try {
    const 段s = 切段(文本).filter((x) => String(x || '').replace(/\s+/g, '').length >= 5)
    if (!段s.length) { 自报兜底推轴(sid, turn); 轨迹记状态('无思考', turn, null); return { 无思考: true } }
    let 摘要 = ''
    try {
      const 他说 = String(用户话 || '').replace(/^【[^】]*】\s*/, '').replace(/\s+/g, ' ').trim().slice(0, 120)
      const 我说 = String(回复文 || '').replace(/\s+/g, ' ').trim().slice(0, 120)
      摘要 = (他说 ? '他这一轮说：' + 他说 + '。' : '') + (我说 ? '我这一轮回：' + 我说 + '。' : '')
    } catch {}
    let 坐标 = ''
    try {
      const 现 = 现值(读池())
      const 上一 = (读轨迹计().最近 && 读轨迹计().最近.波动 && 读轨迹计().最近.波动.length) ? 读轨迹计().最近.波动.slice(-1)[0] : null
      坐标 = 'E ' + (Number(现.轴.E) || 0).toFixed(2) + ' / S ' + (Number(现.轴.S) || 0).toFixed(2) + ' / P ' + (Number(现.轴.P) || 0).toFixed(2) +
        '（内部 −1..+1；刻度 10 时 ×10 为人话值）'
      if (上一 && 上一.预判) 坐标 += '；上一波动预判：' + 上一.预判
    } catch {}
    let 点 = null, 来源 = '会话', 原因 = '', 片段 = '', 片段来源 = '', 打点分段 = null, 打点为谁 = null, 打点三问 = null
    for (let 次 = 0; 次 < 2; 次++) {
      const r = await 轨迹打点(ctx, session, 段s, 摘要, 坐标, '')
      if (!r) { 原因 = '调用失败'; 片段 = '无模型'; 片段来源 = '错误'; break }
      if (r.错误) {
        原因 = r.超时 ? '超时' : (r.错误 === '空回答' ? '调用失败' : '调用失败')
        片段 = String(r.原文 || '').trim() ? 截20(r.原文) : 截20(r.错误 === '空回答' ? '空回答' : r.错误)
        片段来源 = String(r.原文 || '').trim() ? '模型' : '错误'
        break
      }
      来源 = r.来源
      if (点合格(r.点)) { 点 = r.点; 打点分段 = r.分段; 打点为谁 = r.为谁; 打点三问 = r.三问 || null; break }
      原因 = r.点 ? '注太短' : 'JSON坏'
      片段 = 截20(r.原文)
      片段来源 = '模型'
    }
    if (!点) { 自报兜底推轴(sid, turn); 轨迹记状态('失败', turn, null, 原因 || '其他', 片段, 片段来源); return { 失败: true, 原因: 原因 || '其他', 片段 } }
    let 阈 = 0.15
    try { 阈 = Number(读配置().波动阈值) || 0.15 } catch {}
    const 主 = await 取主曲线(ctx, session, sid, 点, 回复文)
    const 上轮t = (() => { try { const n = 读轨迹计().最近; return n && n.t ? Date.parse(n.t) : 0 } catch { return 0 } })()
    const 单点 = 单点判定(主.点, 上轮t)
    let 确认 = null
    if (!主.单轨 && (主.分歧 || 主.反向)) {
      const 池x = 读池()
      const 计 = 池x.确认问 && 池x.确认问.日 === 日期() ? { 日: 池x.确认问.日, 次: Number(池x.确认问.次) || 0 } : { 日: 日期(), 次: 0 }
      const 限 = Math.max(0, Number(读配置().确认问日限) || 12)
      if (计.次 < 限) {
        计.次 += 1
        带锁(() => { const 池y = 读池(); 池y.确认问 = 计; 写池(池y) })
        let 答 = null
        try { 答 = await 秒超时(确认原话(ctx, session, 回复文), 8000) } catch { 答 = null }
        if (答 === '是') { 记确认(sid, false); 确认 = '是' }
        else if (答 === '不是') { 记确认(sid, true); 确认 = '不是' }
        else 确认 = '超时'
      } else 确认 = '确认问用尽'
    }
    let 系数 = 1
    if (单点) 系数 *= 0.7
    if (主.分歧) 系数 *= 0.5
    if (主.反向) 系数 *= 0.25
    系数 = 夹(系数, 0.15, 1)
    const 双轨 = (() => { try { return (globalThis.__ep双轨待取 || new Map()).get(String(sid) + ':' + String(turn)) || null } catch (e) { return null } })()
    if (双轨 && 双轨.主题) { try { S经验 = 算S经验(sid, 双轨.主题, 双轨.结论) } catch (e) { S经验 = null } }
    if (S经验 && S经验.ΔS && 主.点 && 主.点.S != null) 主.点.S = Number(主.点.S) + Number(S经验.ΔS)
    // v0.2.2：分段只用于命名/展示（轴仍整轮推一次）
    const 分段组 = 切分段(点, 打点分段, 读配置())
    try { 命名提醒记账(sid, turn, 分段组, 主, 读配置(), 双轨 && 双轨.点数) } catch (e) {}
    const 波动 = 波动点(主.点, 阈)
    let 定名 = null
    let 推回 = null
    if (波动.length) {
      // 最后一版：注/依据从主点里**从后往前找第一个非空的**——最后一个点常常是收尾点，没写注，
      // 直接取「最后一个点的注」会让事件行显示「没记录原因」。
      const 找注 = () => {
        const arr = Array.isArray(主.点) ? 主.点 : []
        for (let i = arr.length - 1; i >= 0; i--) { const v = String((arr[i] && arr[i].注) || '').trim(); if (v) return v }
        return null
      }
      const 找依 = () => {
        const arr = Array.isArray(主.点) ? 主.点 : []
        for (let i = arr.length - 1; i >= 0; i--) { const v = String((arr[i] && arr[i].依据) || '').trim(); if (v) return v }
        return null
      }
    try { 推回 = 推轴(sid, 波动[波动.length - 1], turn, 读配置(), { 系数, 分歧: 主.分歧, 反向: 主.反向, 单点, 来源: 主.来源, 偏移: 主.偏移, 段数: 分段组.length, 为谁: 打点为谁 || null, 采用: 主.采用 || null, K: 主.K || null, 原话: 洗用户话(用户话), 注: 找注(), 依据: 找依(), 曲线: Array.isArray(点) ? 点.slice(0, 8).map((pp) => ({ E: Number(pp && pp.E) || 0, S: Number(pp && pp.S) || 0, P: Number(pp && pp.P) || 0 })) : null }) } catch (e) { 轨迹记状态('失败', turn, null, '推轴异常', String((e && e.message) || e).slice(0, 40), '错误') }
    }

    // 2026-11-18 任务单 2250：定名只对趋势轮跑（基线/波动/跳变名=null，不进候选、不写原型）
    if (推回 && 推回.状态 === '趋势') {
      try { 定名 = 定名波动(sid, turn, 主.点, 波动, 读配置()) } catch (e) { 定名 = null }
    }
    const 名 = 短会话(sid) + '-' + String(turn).replace(/[^A-Za-z0-9_-]/g, '_') + '.json'
    const 文件 = join(轨迹目录, 名)
    mkdirSync(轨迹目录, { recursive: true })
    const 体 = { version: 版本, sid, turn, t: new Date().toISOString(), 秒: Number(秒) || null, 段数: 段s.length, 段点: 点, 分段: 分段组.map((g) => ({ 起: g.起, 止: g.止, 段数: g.段数, 名: g.名, 依据: g.依据, 签名: g.签名 })), 为谁: 打点为谁 || null, 三问: (打点三问 && typeof 打点三问 === 'object') ? 打点三问 : null, 主点: 主.点, 主点原始: 主.原始点数 || null, 主来源: 主.来源, 偏移: 主.偏移, 分歧: 主.分歧, 反向: 主.反向, 单点, 系数, 确认, 波动, 定名, 打点模型: 来源, 摘要: String(段s[0] || '').slice(0, 40), 分身分析: (双轨 && 双轨.分析) ? String(双轨.分析).slice(0, 60) : '', 片: (推回 && 推回.片) || null, 枝: (推回 && 推回.枝) || null, 签名: (定名 && 定名.签名) || null }
    let 文 = JSON.stringify(体, null, 2)
    while (文.length > 50 * 1024 && 体.段点.length > 1) {
      体.段点 = 体.段点.slice(0, Math.ceil(体.段点.length / 2))
      文 = JSON.stringify(体, null, 2)
    }
    const tmp = 文件 + '.tmp'
    writeFileSync(tmp, 文, 'utf8')
    renameSync(tmp, 文件)
    轨迹记状态('有轨迹', turn, 体, null, null, null, sid)
    return 体
  } catch (e) { if (process.env.EP_DEBUG) console.error('轨迹异常', e && e.stack || e); 自报兜底推轴(sid, turn); try { 轨迹记状态('失败', turn, null, '其他', 截20((e && e.message) || e || '异常'), '错误') } catch {} ; return { err: '轨迹异常' } }
}

function 轨迹清理() {
  try {
    const o = 读轨迹计()
    if (o.清理日 === 日期()) return
    o.清理日 = 日期()
    写轨迹计(o)
    if (!existsSync(轨迹目录)) return
    const 线 = Date.now() - 7 * 24 * 3600 * 1000
    for (const 名 of readdirSync(轨迹目录)) {
      try {
        const p = join(轨迹目录, 名)
        if (statSync(p).mtimeMs < 线) unlinkSync(p)
      } catch {}
    }
  } catch {}
}

export function 轨迹摘要() {
  const o = 读轨迹计()
  const 近 = (Array.isArray(o.轮) ? o.轮 : []).slice(-20)
  const 分 = { 有轨迹: 0, 无思考: 0, 失败: 0 }
  for (const x of 近) if (分[x.状态] != null) 分[x.状态] += 1
  return {
    最近: o.最近 && typeof o.最近 === 'object' ? { turn: o.最近.turn, t: o.最近.t, 秒: o.最近.秒 || null, 段数: o.最近.段数, 点: o.最近.点, 波动: o.最近.波动 || [], 打点模型: o.最近.打点模型 || '会话' } : null,
    波动: (o.最近 && Array.isArray(o.最近.波动) ? o.最近.波动.slice(-3) : []),
    打点模型: (o.最近 && o.最近.打点模型) || '会话',
    版本,
    近20轮: 分,
    失败明细: 近
      .filter((x) => x && x.状态 === '失败' && x.原因 && x.原因 !== '无思考')
      .slice(-5)
      .reverse()
      .map((x) => ({ 轮: x.turn, 原因: x.原因, 片段: x.片段 || '' })),
    今日调用数: o.今天 === 日期() ? Number(o.调用) || 0 : 0,
  }
}

// 卡片性能埋点：静默接收 widget POST 的五段计时，追加进 notes 的「真机数字」表，只留最近 20 行
const 性能笔记路径 = join(HOME, '..', 'notes', '情绪池-卡片性能-20261115.md')
const 性能表头 = '| 时间 | 页 | 取数 | 解析 | 建DOM | 画SVG | 首次布局 | 总 |'
const 性能分隔 = '|---|---|---|---|---|---|---|---|'
function 性能数(段, k) {
  const v = Number(段 && 段[k])
  return isFinite(v) ? v.toFixed(1) : '—'
}
function 性能行们(文) {
  return 文.split(/\r?\n/).filter((x) => x.trim().startsWith('|') && !/^\|[\s\-|]+\|$/.test(x.trim()) && !x.includes('| 时间 |'))
}
export function 记性能(体, 路径) {
  try {
    const 段 = 体 && typeof 体.段 === 'object' && 体.段 ? 体.段 : {}
    const 总 = Number(体 && 体.毫秒)
    const 页名 = (体 && 体.kind === 'wheel') ? '三轴·滚轮' : String(体 && 体.页 != null ? 体.页 : '—')
    const 行 = '| ' + String((体 && 体.t) || new Date().toISOString()) + ' | ' + 页名 +
      ' | ' + 性能数(段, '取数') + ' | ' + 性能数(段, '解析') + ' | ' + 性能数(段, '建DOM') + ' | ' + 性能数(段, '画SVG') +
      ' | ' + 性能数(段, '首次布局') + ' | ' + (isFinite(总) ? 总.toFixed(1) : '—') + ' |'
    const 目标 = 路径 || 性能笔记路径
    try { mkdirSync(dirname(目标), { recursive: true }) } catch (_) {}
    if (!existsSync(目标)) {
      writeFileSync(目标, '# 情绪池卡片性能（2026-11-15）\n\n## 真机数字\n\n' + 性能表头 + '\n' + 性能分隔 + '\n', 'utf8')
    } else if (!readFileSync(目标, 'utf8').includes('## 真机数字')) {
      appendFileSync(目标, '\n## 真机数字\n\n' + 性能表头 + '\n' + 性能分隔 + '\n', 'utf8')
    }
    appendFileSync(目标, 行 + '\n', 'utf8')
    // 超过 20 行只留最近 20（同一秒多条也照原样保留顺序，只在超限时裁剪）
    const 文 = readFileSync(目标, 'utf8')
    const 行们 = 性能行们(文)
    if (行们.length > 20) {
      const 前 = 文.slice(0, 文.indexOf('| '))
      writeFileSync(目标, 前 + 行们.slice(-20).join('\n') + '\n', 'utf8')
    }
  } catch (e) { /* 写失败不许影响卡片 */ }
}

export function apply(ctx) {
  try { 迁移轮号(读池()) } catch (e) { console.error('[轮号] 迁移失败：' + String((e && e.message) || e)) }
  const 最近用户 = new Map()
  // 跨会话/外部自报时，session id 可能对不上；留一份「最后一条 user 话」兜底前缀
  let 最后用户 = ''
  const 本轮已报 = new Set()
  const 处理过 = new Map()


  // 实时思考流：按 attempt 收 reasoning-delta，end 时留给 assistant/message 取用
  try {
    ctx.on('agent/assistant-stream', (p) => {
      try {
        const f = p && p.frame
        if (!f) return
        const 会 = p && p.agent && p.agent.session && p.agent.session.id
        if (!会) return
        if (f.type === 'start') { 流缓冲.set(f.attemptId, { sid: 会, turn: f.turn, text: '', 起: Date.now() }); return }
        if (f.type === 'chunk' && f.chunk && f.chunk.type === 'reasoning-delta') {
          const a = 流缓冲.get(f.attemptId)
          if (a) a.text += String(f.chunk.text || '')
          return
        }
        if (f.type === 'end') {
          const a = 流缓冲.get(f.attemptId)
          if (a) {
            帧尾.set(a.sid + ':' + a.turn, { text: a.text, 秒: Math.max(0, Math.round((Date.now() - (a.起 || Date.now())) / 100) / 10) })
            if (帧尾.size > 8) 帧尾.delete(帧尾.keys().next().value)
          }
          流缓冲.delete(f.attemptId)
        }
      } catch {}
    })
  } catch {}

  // 久压定时器：启动先补一次，之后每分钟一次；卸载时清掉
  try { 检查久压() } catch (e) { /* ignore */ }
  try { 检查戒断() } catch (e) { /* ignore */ }
  ctx.effect(() => {
    const 钟 = setInterval(() => {
      try { 检查久压() } catch (e) { /* 单次失败不刷屏 */ }
      try { 检查戒断() } catch (e) { /* 戒断失败不刷屏 */ }
      try { 每日归并() } catch (e) { /* 归并失败不刷屏 */ }
      try { 轨迹清理() } catch (e) { /* 轨迹清理失败不刷屏 */ }
    }, 60 * 1000)
    if (钟 && typeof 钟.unref === 'function') 钟.unref()
    return () => clearInterval(钟)
  })

  // ⭐ 2026-11-09：跨会话递话走 `agent.followup({role:'user'})`，不经过 session/event 的
  //   user/message，`最近用户` 会捕不到，注释就缺 `[user 前 20 字]`。在 agent 的 inbox 上补一层。
  const 已挂代理 = new WeakSet()
  const 挂代理 = (agent) => {
    try {
      if (!agent || !agent.session || 已挂代理.has(agent)) return
      const ac = agent.ctx
      if (!ac || typeof ac.on !== 'function') return
      已挂代理.add(agent)
      ac.on('agent/inbox/inserted', (payload) => {
        try {
          const msg = payload && payload.message ? payload.message : payload
          if (!msg || msg.role !== 'user') return
          const t = 取正文(msg)
          const sid = agent.session && agent.session.id
          if (t && sid) { 最近用户.set(String(sid), t.slice(0, 200)); 最后用户 = t }
        } catch (e) { /* 单条坏了不影响别的 */ }
      })
      // 0.2.5：注入按会话所属池（同一池里的会话拿到同一套值）
      try {
        const sid0 = String(agent.session.id || '')
        if (ac.systemPrompt && typeof ac.systemPrompt.context === 'function') {
          ac.systemPrompt.context({
            name: 'emotion-pool-注入-' + sid0.slice(-8),
            order: 960.5,
            text: () => {
              const 配0 = 读配置()
              const 名0 = 池名(配0, sid0)
              if (!池启用(名0)) return ''
              return 用池(名0, () => 取注入(配0, 读池()))
            },
          })
        }
      } catch (e) { /* 挂不上就走全局兜底 */ }
      // v0.8：提醒按会话隔离——挂在 agent 自己的 ctx 上，闭包拿本会话 id
      try {
        if (ac.systemPrompt && typeof ac.systemPrompt.context === 'function') {
          ac.systemPrompt.context({
            name: 'emotion-pool-提醒-' + String(agent.session.id || '').slice(-8),
            order: 950,
            text: () => 取提醒(读配置(), String(agent.session.id)),
          })
        }
      } catch (e) { /* 挂不上就退回全局那条路（已删） */ }
    } catch (e) { /* 挂不上就退回 session/event 那条路 */ }
  }
  const 挂全部代理 = () => {
    try {
      const 列表 = ctx.agents && typeof ctx.agents.list === 'function' ? ctx.agents.list() : []
      for (const a of 列表) 挂代理(a)
    } catch (e) { /* ignore */ }
  }
  挂全部代理()
  // 之后新开的会话：有专门的建会话事件就接上，没有也无妨（第一次 assistant 时会再挂一次）
  try { ctx.on('agent/created', 挂代理); ctx.on('agents/created', 挂代理) } catch (e) { /* ignore */ }

  // v0.4 R3：上一轮缺定名的提醒（一次）
  ctx.effect(() => ctx.systemPrompt.context({
    name: 'emotion-pool-定名',
    order: 940,
    text: () => 取定名提醒(),
  }))

  // v0.4 R4：双轨缺依据的提醒（一次）
  ctx.effect(() => ctx.systemPrompt.context({
    name: 'emotion-pool-依据',
    order: 945,
    text: () => 取依据提醒(),
  }))

  // M4 注入：默认关；打开后只读池、给一行，不改数值
  ctx.effect(() => ctx.systemPrompt.context({
    name: 'emotion-pool-注入',
    order: 960,
    text: () => 取注入(读配置(), 读池()),
  }))

  ctx.on('session/event', (session, event) => {
    try {
      const sid = session && session.id
      if (!sid || !event) return

      if (event.type === 'user/message') {
        // 2026-11-09 02:35：user/message 的正文在 data.content，没有 data.message
        const t = 取正文(event.data && (event.data.message || event.data))
        if (t) { 最近用户.set(sid, t.slice(0, 200)); 最后用户 = t }
        提醒闸.set(sid, true)
        return
      }

      if (event.type === 'turn/end') {
        const d = event.data || {}
        const 键 = `${sid}:${d.turn}`
        if (!本轮已报.has(键)) 记漏报(sid, d.turn)
        本轮已报.delete(键)
        return
      }

      if (event.type !== 'assistant/message') return
      const d = event.data || {}
      挂代理(session && session.agent)
      if (d.interrupted) return
      const 文 = 取正文(d.message)
      if (!文) return

      const 键 = `${sid}:${d.turn}:${摘要(文)}`
      if (处理过.has(键)) return
      处理过.set(键, Date.now())
      if (处理过.size > 500) {
        for (const k of 处理过.keys()) {
          处理过.delete(k)
          if (处理过.size <= 400) break
        }
      }

      // v0.12：真实回复计数（没有自报也算一轮）
      try { const 名3 = 池名(读配置(), sid); if (池启用(名3)) 用池(名3, () => 记一轮(sid, d.turn, 读池())); else if (!已迁移到池()) 记一轮(sid, d.turn, 读池()) } catch {}

      // v0.20 前置：思考轨迹（只读；不 await 主链，失败不影响消息）
      let 轨文 = '', 轨秒 = null
      try {
        const 尾 = 帧尾.get(sid + ':' + d.turn)
        轨文 = 尾 ? 尾.text : 从stream取思考(d.stream)
        轨秒 = 尾 && 尾.秒
        帧尾.delete(sid + ':' + d.turn)
      } catch (e) { /* 轨迹失败不拖慢 */ }
      const 跑轨迹后续 = () => 跑轨迹(ctx, session, sid, d.turn, 轨文, 轨秒, 最近用户.get(sid) || 最后用户 || '', 文)

      const 解 = 解析自报(文)
      if (!解) {
        if (/<!--\s*EMO:/.test(文)) 记解析失败(sid, 文)
        跑轨迹后续().catch(() => {})
        return
      }
      if (!解.ok) {
        记解析失败(sid, 文)
        跑轨迹后续().catch(() => {})
        return
      }
      本轮已报.add(`${sid}:${d.turn}`)
      const 轨P = 跑轨迹后续()
      跑本轮(ctx, session, sid, d.turn, 文, 解, 最近用户.get(sid) || 最后用户).catch(() => {})
      轨P.then((r) => 补曲线(ctx, session, sid, d.turn, r)).catch(() => {})
      // v0.8：先跑分身、再合成，写池在 跑本轮 里一次完成（不阻塞消息通道）
         } catch (e) {
      try {
        const 配置 = 读配置()
        写日志(配置, `[${时分()}] 错误 ｜ ${String((e && e.message) || e)}`)
      } catch {}
    }
  })

  // 给面板/命令行看的最小状态（字段名按策划案 §6；v1 先不出界面）
  // 2026-11-15 16:5x：轨迹目录 1600+ 个小文件，原先每次 /state 全量读一遍要 ~900 ms，
  // 卡片每 5 秒轮询一次就卡一次。改成按文件 mtime 增量缓存：只有变过的文件才重新解析。
  // 2026-11-16 18:5x（策划间）：2 秒整体缓存原先只在键里带「当前池名」，现改为调用模块级 状态键()，
  // 把 pool 参数也显式拼进键，避免默认池 / ?pool=<名> 在同一个 2 秒窗口里互相复用响应。
  let 状态缓存 = null // 2 秒整体缓存：状态键() + 时间戳
  const 状态处理器 = async (req, res) => {
      try {
        const 配置 = 读配置()
        // 2026-11-16 17:0x（卡片前端第 11 项）：池列表用「全部池」——新建的空池也得在，不能被组名单挤掉。
        // 有会话的池排前面，空池排最后（页签顺序同此）。
        const 全部 = 全部池(配置)
        const 池们 = [...全部.filter((p2) => p2.会话.length), ...全部.filter((p2) => !p2.会话.length)]
        const 询池 = (() => { try { return new URL(String(req.url || ''), 'http://127.0.0.1').searchParams.get('pool') || '' } catch (e) { return '' } })()
        // 2026-11-16 15:40 策划间定：按名字精确命中（URLSearchParams 已经解过码）；
        // 找不到就 404 说清楚，不许静默回落到默认池、更不许回 0。
        if (询池 && !池们.some((x) => x.名 === 询池)) {
          res.writeHead(404, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          res.end(JSON.stringify({ ok: false, 错误: '没有这个池：' + 询池, 现有池: 池们.map((x) => x.名) }, null, 2))
          return
        }
        const 当前池名 = (询池 && 池们.some((x) => x.名 === 询池)) ? 询池 : (池名(配置, (装载名单(配置)[0] || '')) || (池们[0] && 池们[0].名) || '')
        const 池 = 池启用(当前池名) ? 池视图(配置, 当前池名) : 读池()
        const 配m = (() => { try { return statSync(CONFIG_PATH).mtimeMs } catch (e) { return 0 } })()
        const 键 = 状态键(池.rev, 当前池名, 装载名单(配置), 配m, 询池)
        if (状态缓存 && 状态缓存.键 === 键 && Date.now() - 状态缓存.at < 2000) {
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.setHeader('cache-control', 'no-store')
          res.end(状态缓存.体)
          return
        }
        // 2026-11-16（策划间口径）：未归池 = 有事件的会话 − 全部池的会话；旧的 池.未归组 是事件计数，口径不同
        const 未归池 = () => {
          const 归 = new Set(全部.flatMap((p2) => (p2.会话 || []).map((x) => 短会话(x))))
          let 表 = {}
          try { 表 = 分片.读全部() || {} } catch { 表 = {} }
          const 有 = Object.keys(表).filter((k) => (Array.isArray(表[k] && 表[k].事件) ? 表[k].事件.length : (Number(表[k] && 表[k].事件数) || 0)) > 0)
          return [...new Set(有.map((x) => 短会话(x)))].filter((x) => !归.has(x)).sort()
        }
        const 现 = 现值(池)
        const 事件轨索引 = (() => {
          const m = new Map()
          try { for (const [短, 列] of 取轨迹表()) for (const f of 列) if (f.轮 != null) m.set(短 + '|' + String(f.轮), f) } catch (e) {}
          return m
        })()
        const 末 = 池.events[池.events.length - 1] || null
        const 强 = Math.max(...轴们.map((k) => Math.abs(现.轴[k])))
        const 格 = 算格(池.prev_cell, 现.轴)
        const 命中 = 命中命名(现.轴, { 配置 })
        // 没有区间命中时回落到 27 格基础名（也带一句注，别让面板空着）
        const 命名 = 命中 ? 条名(命中) : 基础名(格)
        const 命名注 = 命中 ? String(命中.注 || '') : `落在 ${格} 这一格；这一格还没有区间名。`
        const 刻 = 读数刻度(配置)
        const 池行们 = 池们.map((p2) => {
          // 空池不读池文件（可能还没有文件），直接给 0/0/0 +「无会话」，页签照常显示
          if (!p2.会话.length) {
            return {
              池名: p2.名,
              空: true,
              会话: [],
              轴: Object.fromEntries(轴们.map((k) => [k, 0])),
              来源: null,
              名字: '无会话',
              事件数: 0,
              最近: null,
              敏感: { 爽: { s: 1, a: 1 }, 痛: { s: 1, a: 1 } },
            }
          }
          const v2 = 池视图(配置, p2.名)
          const 现2 = 展示现值(v2)
          const 格2 = 算格(v2.prev_cell, 现2.轴)
          const 命2 = 命中命名(现2.轴, { 配置 })
          const 末2 = v2.events[v2.events.length - 1] || null
          return {
            池名: p2.名,
            会话: p2.会话.map((x) => ({ sid: x, 名: (配置.会话名 || {})[x] || null, 事件数: v2.events.filter((e) => 同会话(e.sid, x)).length })),
            轴: Object.fromEntries(轴们.map((k) => [k, 标值(配置, 现2.轴[k])])),
            // 2026-11-16（策划间定）：标出这行轴是从哪来的（会话快照 / 快照 / axes / 重放）
            来源: 现2.来源 || null,
            名字: 命2 ? 条名(命2) : 基础名(格2),
            事件数: v2.events.length,
            最近: 末2 ? 末2.t : null,
            敏感: { 爽: { s: Number(v2.p_state && v2.p_state.爽 && v2.p_state.爽.s) || 1, a: Number(v2.p_state && v2.p_state.爽 && v2.p_state.爽.a) || 1 }, 痛: { s: Number(v2.p_state && v2.p_state.痛 && v2.p_state.痛.s) || 1, a: Number(v2.p_state && v2.p_state.痛 && v2.p_state.痛.a) || 1 } },
          }
        })
        const out = {
          ok: true,
          当前池: 当前池名 || null,
          池列表: 池行们,
          刻度: 刻,
          存储模式: String(配置.存储模式 || '旧'),
          分片: 配置.存储模式 === '分片' ? 分片概况() : null,
          启用: 配置.启用,
          注入启用: 配置.注入启用,
          待命名: 待命名摘要(),
          注入: (() => {
            const j = 读注入()
            const 距分 = j.上次时间 ? Math.max(0, Math.floor((Date.now() - Date.parse(j.上次时间)) / 60000)) : null
            return { 今日判断: j.判断, 今日注入: j.注入, 今日保底: j.保底, 今日插队: j.插队, 昨日判断: j.昨日.判断, 昨日注入: j.昨日.注入, 昨日保底: j.昨日.保底, 昨日插队: j.昨日.插队, 轮总: Number(读轮号().总) || 0, 上次轮: j.上次轮 == null ? null : Number(j.上次轮), 距上次注入分钟: 距分, 吸附系数: Number(读配置().吸附系数) || 0.4, 今日插队挡下: Number(j.挡下) || 0, 本轮是否推轴: !!(池.上轮波动 && 池.上轮波动.有 && Date.now() - Date.parse(池.上轮波动.t) <= 10 * 60000), 本轮推轴来源: 池.推轴来源 || '无' }
          })(),
          写入者: 配置.写入者,
          // 2026-11-11 11:12：把 QQ 报警总闸露出来，免得再靠翻配置文件才知道开没开
          QQ报警: 配置.QQ报警 === true,
          rev: 池.rev,
          updated: 池.updated,
          axes: Object.fromEntries(Object.entries((() => {
            if (!组名单(配置).length) return 现.轴
            const 和 = { E: 0, S: 0, P: 0 }
            for (const g of 组名单(配置)) {
              const v = 组现值(池, g)
              for (const k of 轴们) 和[k] += Number(v.轴[k]) || 0
            }
            for (const k of 轴们) 和[k] += Number(池.spine && 池.spine[k]) || 0
            return Object.fromEntries(轴们.map((k) => [k, 显示值(和[k], 0)]))
          })()).map(([k, v]) => [k, 标值(配置, v)])),
          axes说明: '各组(快照+组零点)之和，再加一次 spine',
          模板: (() => { try { const o = 读模板(); return { 总: (o.模板 || []).length, 候选: (o.候选 || []).length, 最近: 池.模板最近 || null } } catch { return { 总: 0, 候选: 0, 最近: null } } })(),
          axes归一化: 现.轴,
          坐标向量: Object.fromEntries(轴们.map((k) => {
            const 值 = Number(现.轴[k].toFixed(4))
            const 溢 = Number((Number(溢出现值(池, k, Date.now())) || 0).toFixed(4))
            return [k, { 值: 标值(配置, 值), 溢出: 标值(配置, 溢), 向量: 标值(配置, 值 + 溢) }]
          })),
          spine: 池.spine,
          零点: Object.fromEntries(轴们.map((k) => [k, 标值(配置, 组名单(配置).reduce((s2, g) => s2 + (Number(组份(池, g.名).零点[k]) || 0), 0))])),
          零点明细: Object.fromEntries(组名单(配置).map((g) => [g.名, Object.fromEntries(轴们.map((k) => [k, 标值(配置, Number(组份(池, g.名).零点[k]) || 0)]))])),
          未归组: (() => { try { return 未归池().length } catch { return 0 } })(),
          未归池: (() => { try { return 未归池() } catch { return [] } })(),
          未归组事件: Number(池.未归组) || 0,
          推轴来源: 池.推轴来源 || '无',
          六头: 六头计(池),
          现值快照: 池.现值快照 || null,
          会话快照: Object.keys(池.会话快照 || {}),
          装载会话: 装载名单(配置),
          装载来源: 装载来源(配置),
          组: (() => {
            const 组轨迹表 = 取轨迹表()
            // 空池也进组表（显示 0/0/0「无会话」），页签里排在最后
            const 组底表 = 池们.map((g) => {
            // 2026-11-16 17:4x（重启后只读核对抓到的）：组卡的轴/合要按「池视图」算——池文件才是真值。
            // 旧组现值只读总表 会话快照；池化后总表清空，组卡就掉成零点（常用聊天组显示 2/−1/0）。
            const 视图 = (() => { try { return 池视图(配置, g.名) } catch (e) { return null } })()
            const 组v = 组现值(池, g)
            const v = 视图 ? { ...组v, ...(展示现值(视图) || {}) } : 组v
            const 命 = 命中命名(v.轴, { 配置 })
            return {
              名: g.名,
              空: !g.会话.length,
              会话: g.会话,
              推轴次数: (视图 && 视图.推轴次数) || {},
              合: Object.fromEntries(轴们.map((k) => [k, 标值(配置, Number(v.合[k].toFixed(4)))])),
              零点: Object.fromEntries(轴们.map((k) => [k, 标值(配置, Number(v.零点 && v.零点[k]) || 0)])),
              六头: v.六头,
              轴: Object.fromEntries(轴们.map((k) => [k, 标值(配置, Number(v.轴[k].toFixed(4)))])),
              命名: 条名(命) || null,
              命名注: (命 && String(命.注 || '')) || null,
              轴级: !!(命 && 命.轴级),
              命中轴: (命 && 命.命中轴) || null,
              敏感: { 爽: { s: Number(池.p_state && 池.p_state.爽 && 池.p_state.爽.s) || 1, a: Number(池.p_state && 池.p_state.爽 && 池.p_state.爽.a) || 1 }, 痛: { s: Number(池.p_state && 池.p_state.痛 && 池.p_state.痛.s) || 1, a: Number(池.p_state && 池.p_state.痛 && 池.p_state.痛.a) || 1 } },
              格: 算格((池.上轮波动 && 池.上轮波动.格) || 'E0S0P0', v.轴),
              ...(() => {
                const 列 = []
                // 2026-11-16（卡片第 2 项）：悬停要「整句原话」，按轮号从事件表里取（推轴/自报事件都写 原话）
                const 原话表 = new Map((池.events || []).map((e) => [String(e.turn ?? ''), String(e.原话 || '').slice(0, 500)]))
                for (const s2 of g.会话) for (const f of (组轨迹表.get(s2) || [])) {
                  const n = f.点.length
                  const t0 = f.t ? Date.parse(f.t) : 0
                  for (let i = 0; i < n; i++) {
                    const p = f.点[i] || {}
                    const 间 = n > 1 && f.秒 ? (Number(f.秒) * 1000) / (n - 1) : 0
                    const t = t0 ? new Date(t0 - (n - 1 - i) * 间).toISOString() : null
                    列.push({ t, E: Number(p.E) || 0, S: Number(p.S) || 0, P: Number(p.P) || 0, note: String(p.注 || ''), 段: i + 1, 文件轮: f.轮 == null ? null : f.轮, 原话: 原话表.get(String(f.轮 ?? '')) || null })
                  }
                }
                列.sort((a, b) => (Date.parse(a.t) || 0) - (Date.parse(b.t) || 0))
                const 轨点 = 列.slice(-600)
                let 点 = 轨点
                let 来源 = 轨点.length ? '轨迹' : '空'
                if (!点.length) {
                  const 池s = (池.events || []).filter((e) => e && e.delta_raw && !e.merged_into && g.会话.includes(短会话(e.sid))).slice(-20)
                  let x = { E: 0, S: 0, P: 0 }
                  点 = 池s.map((e) => {
                    for (const k of 轴们) x[k] += Number(e.delta_raw[k]) || 0
                    return { t: e.t, E: Number(x.E.toFixed(4)), S: Number(x.S.toFixed(4)), P: Number(x.P.toFixed(4)), note: String(e.note || ''), 原话: String(e.原话 || '').slice(0, 500) || null }
                  })
                  if (点.length) 来源 = '自报'
                }
                let 最 = null
                for (const s2 of g.会话) for (const f of (组轨迹表.get(s2) || [])) if (!最 || (f.m || 0) > (最.m || 0)) 最 = f
                return { 点, 点来源: 来源, 轨迹: 最 ? { 轮: 最.轮, 段: 最.段, 秒: 最.秒 } : null }
              })(),
              波动: (池.events || []).filter((e) => e && !e.merged_into && g.会话.includes(短会话(e.sid)) && String(e.note || '').trim()).slice(-2).reverse().map((e) => { const 补 = 轨迹补(e) || {}; return { t: e.t, note: String(e.note || ''), delta: e.delta_raw || {}, 名: (e.定名 && e.定名.名) || 补.名 || null, 为谁: e.为谁 || null, 段: e.段数 != null ? e.段数 : null, 注: e.注 || 补.注 || null, 依据: e.依据 || 补.依据 || null } }),
            }
          });
            const 轨近0 = (() => { try { return 轨迹摘要().最近 } catch { return null } })()
            const 曲字段 = { 曲线来源: (轨近0 && 轨近0.主来源) || '空', 分歧: !!(轨近0 && 轨近0.分歧), 反向: !!(轨近0 && 轨近0.反向), 单点: !!(轨近0 && 轨近0.单点) }
            return 组底表.map((x) => ({ ...x, ...曲字段 })).map((x) => {
              const 次 = x.推轴次数 && typeof x.推轴次数 === 'object' ? x.推轴次数 : {}
              const 未推 = (x.会话 || []).every((s2) => !(Number(次[s2]) > 0))
              if (!未推) return { ...x, 轴来源: '快照' }
              // 2026-11-16（卡片前端第 1 项）：没推过但真有数（组快照/池 axes/事件累计）→ 实心显示真值，
              // 只挂「未推」小字；只有完全没数据才画虚线占位。虚线不再是常规状态。
              const 有数 = (x.点 && x.点.length) || Object.values(x.合 || {}).some((v2) => Math.abs(Number(v2) || 0) > 0.0001)
              if (有数) return { ...x, 轴来源: '快照', 未推: true, 未推来源: 组来源(x.名) }
              return { ...x, 轴来源: '未推' }
            })
          })(),
          会话一览: 会话选项(),
          片分布: (() => {
    try {
      // R-3 修正（2026-11-18）：只统计「趋势」轮的 8 片——基线/波动/跳变不进表，不计入分母。
      const 画 = 校准.读轮画像(当前池名 || '总', HOME).记录.slice(-2000).filter((r) => r && r.状态 === '趋势')
      const 计 = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 }
      let 无片 = 0
      for (const r of 画) {
        const n = Number(r && r.片)
        if (n >= 1 && n <= 8) 计[n]++
        else 无片++
      }
      return { 样本数: 画.length, 计数: 计, 无片 }
    } catch {
      return null
    }
  })(),
  状态统计: (() => {
            try {
              const 画 = 校准.读轮画像(当前池名 || '总', HOME).记录.slice(-2000)
              const 计 = { 基线: 0, 波动: 0, 趋势: 0, 跳变: 0 }
              for (const r of 画) if (r && 计[r.状态] != null) 计[r.状态]++
              const 有 = 画.filter((r) => r && r.状态).length
              return { 样本数: 有, 目标: 2000, 最近: 计 }
            } catch {
              return null
            }
          })(),
          校准: (() => {
            try {
              const 画 = 校准.读轮画像(当前池名 || '总', HOME).记录
              const 自算 = 校准.校准(画, { 种子: 校准.读种子(HOME) })
              // 2026-11-18 策划间定：池里存的「先验」门槛/权重是旧值（种子混合只在下次推轴才写进去），
              // /state 展示时若池值是先验，就优先用「按种子现算」的值；只改取值优先级，不写池。
              const 门 = 池.门槛 && !池.门槛.先验 ? 池.门槛 : ((自算 && 自算.门槛) || 池.门槛)
              const w = 池.权重 && !池.权重.先验 ? 池.权重 : ((自算 && 自算.权重) || 池.权重)
              const 旧态 = !池.门槛 || !!池.门槛.先验
              const 基 = 旧态 && 自算 ? 自算.相似度基线 : (池.相似度基线 == null ? 自算.相似度基线 : 池.相似度基线)
              return {
                样本数: 画.length,
                目标: 2000,
                门槛: { 基线: 门.基线, 趋势: 门.趋势, 跳变: 门.跳变, 斜率门: 门.斜率门 || 0, 先验: !!门.先验 },
                权重: { 角: w.角, 数: w.数, 距: w.距, 先验: !!w.先验 },
                相似度基线: 基,
                种子数: 自算.种子数 || 0,
                混合比: 自算.混合比 == null ? 1 : 自算.混合比,
                门种来源: Number(自算 && 自算.种子数) > 0 ? '种子+本池' : (门.先验 ? '先验' : '本池'),
                门槛锁定: !!池.门槛锁定,
              }
            } catch {
              return null
            }
          })(),
          确认问: 池.确认问 && 池.确认问.日 === 日期() ? Number(池.确认问.次) || 0 : 0,
          S经验: 装载名单(配置).map((sid2) => {
            const 短2 = 短会话(sid2)
            const 表 = (池.S经验 && 池.S经验[短2]) || {}
            const 最近 = Object.keys(表).map((题) => ({ 主题: 题, 结论: String((表[题] || {}).结论 || ''), 命中: Number((表[题] || {}).命中) || 0, 翻车: Number((表[题] || {}).翻车) || 0, t: (表[题] || {}).t || null }))
              .sort((a, b) => (Date.parse(b.t) || 0) - (Date.parse(a.t) || 0)).slice(0, 5)
            return { 会话: 短2, 主题数: Object.keys(表).length, 最近 }
          }),
          上次推轴: 池.上次推轴 ? { 轮: 池.上次推轴.轮, t: 池.上次推轴.t, 前: Object.fromEntries(轴们.map((k) => [k, 标值(配置, Number(池.上次推轴.前 && 池.上次推轴.前[k]) || 0)])), 后: Object.fromEntries(轴们.map((k) => [k, 标值(配置, Number(池.上次推轴.后 && 池.上次推轴.后[k]) || 0)])) } : null,
          回落: { 小时: Number((现.回落 ? 现.回落.龄小时 : 0).toFixed(2)), 倍: Number((现.回落 ? 现.回落.倍 : 1).toFixed(4)) },
          cell: 格,
          格名: 基础名(格),
          命名,
          命名注,
          命名来源: 命中 ? (命中.轴级 ? '轴级' : '区间') : '基础名',
          命名轴: 命中 && 命中.轴级 ? 命中.命中轴 : null,
          // 结（2026-11-09 01:53 起面向人的文案统一叫「结」；内部 JSON 仍 spine/刺）：永存、不衰减、不守恒，但计入轴值
          结: 结排序(有效结(池)).slice(0, 20).map(({ c, r }) => ({ ...c, 值: 标值(配置, c.值), 类型: c.类型 || '冲', 速: c.速 || 速率档(c.率), w: r.w, 龄天: r.龄天, 沉底: r.沉底 })),
          结沉底数: 有效结(池).filter((c) => 结留存(c).沉底).length,
          结合计: Object.fromEntries(轴们.map((k) => [k, 标值(配置, 有效结(池).filter((c) => c.轴 === k).reduce((s, c) => s + (Number(c.值) || 0), 0))])),
          // §25.2：坐标仍用 +0- 表方向，但后面跟当前数值；「解释」说清为什么产生
          // 解释优先级：最近一条事件的注（最具体）→ 命中名字的注
          显示: Object.fromEntries(轴们.map((k) => {
            const 号 = 现.轴[k] > 0.05 ? '+' : 现.轴[k] < -0.05 ? '-' : '0'
            const 方向 = `${k}${号}`
            const 值 = 标值(配置, 现.轴[k])
            return [k, { 方向, 值, 刻度: 标值(配置, 刻度(现.轴[k])), 文本: 刻 === 1 ? `${方向} ${值.toFixed(4)}` : `${方向} ${值.toFixed(4)} / ${刻}` }]
          })),
          // 一行给人看的：符号 + 当前数值 + 命中名 + 注（调试窗口直接渲染这句也不会只看到 +/-）
          显示文本: `${轴们.map((k) => {
            const 号 = 现.轴[k] > 0.05 ? '+' : 现.轴[k] < -0.05 ? '-' : '0'
            return `${k}${号} ${标值(配置, 现.轴[k]).toFixed(4)}`
          }).join(' ｜ ')}${刻 === 1 ? '' : ` / ${刻}`} ｜ ${命名}${命名注 ? `：${命名注}` : ''}`,
          解释: (末 && String(末.note || '').trim()) || 命名注,
          // §26：P 轴敏感化 s / 适应 a 当前值（显示前先虚推回落，不写盘）
          敏感适应: Object.fromEntries(['爽', '痛'].map((类) => {
            const 项 = 池.p_state[类]
            const 落 = 回落后的敏感(项)
            const 计入 = 项 && 项.计入 ? Date.parse(项.计入) : NaN
            return [类, {
              敏感: Number(落.s.toFixed(3)),
              适应: Number(落.a.toFixed(3)),
              最近: 项.最近,
              不应期到: Number.isFinite(计入) ? new Date(计入 + 不应期毫秒).toISOString() : null,
              渴求: !!(项 && 项.最近 && Date.now() - Date.parse(项.最近) > 戒断毫秒),
            }]
          })),
          双轨: (() => {
    const 键 = 短会话((配置.写入者 && 配置.写入者[0]) || 'c4b92d68')
    const 信 = 取信誉(池, 键)
    const 我 = 信.我
    const 它 = 信.它
    const 项K = 池.双轨 && 池.双轨.K ? 池.双轨.K[键] : null
    const 轮表 = (项K && Array.isArray(项K.轮)) ? 项K.轮 : []
    const 近20 = 轮表.slice(-20)
    const 额 = 读分身额度()
    const 我轮 = Array.isArray(我.轮) ? 我.轮 : []
    const 中点率 = 我轮.length ? 我轮.filter((r) => r && r.中点).length / 我轮.length : 0
    const 不可靠率 = 我轮.length ? 我轮.filter((r) => r && r.不可靠).length / 我轮.length : 0
    const K选 = K选项()
    const kk我 = 算K(我轮, K选)
    const kk它 = 算K(Array.isArray(它.轮) ? 它.轮 : [], K选)
    return {
      样本: Number(我.样本) || 0,
      K: Number(我.值) || 1,
      裁决度: (池.双轨 && 池.双轨.最近 && 池.双轨.最近.裁决度) || { 我: Number(我.值) || 1, 它: Number(它.值) || 1 },
      认知度: (池.双轨 && 池.双轨.最近 && 池.双轨.最近.认知度) || null,
      中点一致率: 中点率,
      不可靠率,
      被否: Number(我.被否) || 0,
      被否率: Number(我.被否率) || 0,
      信誉: {
        我: { 值: kk我.K, 样本: kk我.样本, 有效样本: kk我.有效样本, 窗口天: kk我.窗口天, 被否: Number(我.被否) || 0, 被否率: kk我.被否率, 不可靠率: kk我.不可靠率 },
        它: { 值: kk它.K, 样本: kk它.样本, 有效样本: kk它.有效样本, 窗口天: kk它.窗口天, 被否: Number(它.被否) || 0, 被否率: kk它.被否率, 不可靠率: kk它.不可靠率 },
      },
      错判: Number(项K && 项K.错判) || 0,
      近20错判: 近20.filter((r) => r && r.错判).length,
      最近: 池.双轨 && 池.双轨.最近 ? 池.双轨.最近 : null,
      缺q轮数: Number(池.双轨 && 池.双轨.缺q轮数) || 0,
      E分布: E分布(池),
      分身权重: Number(配置.分身权重) || 0.7,
      接管轮数: (池.接管轮数 && 池.接管轮数.日 === 日期()) ? (Number(池.接管轮数.次) || 0) : 0,
      当前掌控: 池.接管 === true ? '我' : '分身',
      分身: { 批: 额.批, 已用: 额.已用, 本批上限: 额.本批上限, 累计: 额.累计 },
    }
  })(),
          未命名比例: (() => {
            const 定 = Number(池.stats.定名总数) || 0
            const 未 = Number(池.stats.未命名数) || 0
            return (定 + 未) ? Number((未 / (定 + 未)).toFixed(3)) : 0
          })(),
          强度: Number(强.toFixed(4)),
          警告: (() => {
            const 警 = 警告线(现, 末)
            const 定 = 读定名状态()
            if (Number(定.连续) > 0) 警.push('上轮缺定名')
            return 警
          })(),
          未命名区间数: (池.events || []).filter((e) => e && e.类型 === '区间').length,
          未命名区间明细: (池.events || []).filter((e) => e && e.类型 === '区间').slice(-10).map((e) => ({ t: e.t, t_end: e.t_end || null, 合并数: e.合并数 || (e.merged_ids || []).length, note: e.note || '' })).reverse(),
          stats: 池.stats,
          events: 池.events.length,
          // §23.1 / §24.1：事件只存 t；系数与档名在这里按 Δt 现算（面板/审计用，不写回池）
          事件明细: 池.events.slice(-20).map((e) => {
            const 龄 = 年龄系数(e.t)
            const 差 = e.delta_raw || null
            const 轨 = 事件轨索引.get(短会话(e.sid) + '|' + String(e.turn))
            return { t: e.t, sid: e.sid, turn: e.turn, 段数: 轨 && 轨.分段 ? 轨.分段.length : null, 为谁: (轨 && 轨.为谁) || null, 龄天: Number(龄.天.toFixed(2)), 系数: Number(龄.系数.toFixed(4)), 档: 龄.档名, delta_raw: 差 ? Object.fromEntries(轴们.map((k) => [k, 标值(配置, 差[k] || 0)])) : null, note: e.note, 定名: e.定名 || null, 回忆: e.回忆 === true, 档位: e.档位 || null }
          }),
          总和: {
            缩前: { 正: 标值(配置, 求和(现.合).正), 负: 标值(配置, 求和(现.合).负) },
            缩后: { 正: 标值(配置, 求和(现.轴).正), 负: 标值(配置, 求和(现.轴).负) },
          },
        }
        const 溢们 = 轴们.filter((k) => Math.abs(Number(池.overflow[k]) || 0) >= 0.005)
        if (溢们.length) out.显示文本 += ' ' + 溢们.map((k) => '（溢出 ' + (池.overflow[k] >= 0 ? '+' : '') + 标值(配置, 池.overflow[k]).toFixed(2) + '）').join(' ')
        // deprecated，v0.18 删：旧字段名 刺/刺合计 还给老调用方，但内部只有 结
        out.刺 = out.结
        out.刺合计 = out.结合计
  out.版本 = 版本
  out.轨迹 = 轨迹摘要()
  out.分段 = (() => { try { const 近 = 轨迹摘要().最近; const g = (近 && Array.isArray(近.分段)) ? 近.分段 : []; return { 本轮段数: Number(近 && 近.段数) || 0, 组数: g.length, 未命名组数: g.filter((x) => !x.名).length } } catch (e) { return { 本轮段数: 0, 组数: 0, 未命名组数: 0 } } })()
  out.观测 = (() => {
    try {
      const 表全 = 取轨迹表()
      return 会话选项().map((x) => {
        const 短 = x.值
        const 列 = 表全.get(短) || []
        const 近 = 列.slice().sort((a, b) => String(a.t || '').localeCompare(String(b.t || ''))).slice(-1)[0] || null
        const 信 = (池.双轨 && 池.双轨.信誉 && 池.双轨.信誉[短]) || []
        const k = 算K(信, K选项())
        return {
          会话: 短, 名: x.名 || 短,
          轮: 近 ? 近.轮 : null, t: 近 ? 近.t : null,
          段数: 近 ? 近.段 : null,
          三问: (近 && 近.三问) || null,
          为谁: (近 && 近.为谁) || null,
          判定: { 主来源: (近 && 近.主来源) || null, 偏移: 近 && 近.偏移 != null ? 近.偏移 : null, 分歧: !!(近 && 近.分歧), 反向: !!(近 && 近.反向), 单点: !!(近 && 近.单点), 系数: 近 && 近.系数 != null ? 近.系数 : null },
          双轨: { K: k.K, 有效样本: k.有效样本, 被否率: k.被否率, 不可靠率: k.不可靠率, 窗口天: k.窗口天 },
        }
      })
    } catch (e) { return [] }
  })()
  out.曲线注入 = (() => { const o = 读注入(); const c = o && o.曲线注入; return c && typeof c === 'object' ? { 上次: c.上次 || null, 文案: c.文案 || '' } : { 上次: null, 文案: '' } })()
        const 体 = JSON.stringify(out)
        状态缓存 = { 键, at: Date.now(), 体 }
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.setHeader('cache-control', 'no-store')
        res.end(体)
      } catch (e) {
        res.statusCode = 500
        res.end(JSON.stringify({ ok: false, error: String((e && e.message) || e) }))
      }
  }

  // 2026-11-09 01:53：分页列表——结 / 事件，供挂饰与面板「查看更多」翻到最早
  // v0.10：卡片参数释义（只读文件，缺项就不弹；文件不存在只记一行日志）
  let 释义缺日志 = false
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-emotion-pool/glossary',
    handler: async (req, res) => {
      let 出 = { 项: {} }
      try {
        const o = JSON.parse(readFileSync(join(HOME, '情绪池-卡片释义.json'), 'utf8'))
        if (o && o.项 && typeof o.项 === 'object') 出 = { 项: o.项 }
      } catch (e) {
        if (!释义缺日志) {
          释义缺日志 = true
          写日志(读配置(), '[' + 时分() + '] 释义文件缺失，卡片不弹解释')
        }
      }
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.setHeader('cache-control', 'no-store')
      res.end(JSON.stringify(出))
    },
  }))
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-emotion-pool/list',
    handler: async (req, res) => {
      const 回 = (码, o) => { res.statusCode = 码; res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)) }
      const 来 = String((req.socket && req.socket.remoteAddress) || '')
      if (!['::1', '127.0.0.1', '::ffff:127.0.0.1'].includes(来)) return 回(403, { ok: false, error: '只接受本机 127.0.0.1' })
      try {
        const 地址 = new URL(String(req.url || '/'), 'http://127.0.0.1')
        const 类型 = 地址.searchParams.get('kind') === '结' ? '结' : '事件'
        const 含作废 = 地址.searchParams.get('含作废') === '1'
        const 含并入 = 地址.searchParams.get('含并入') === '1'
        const 偏 = Math.max(0, Math.floor(Number(地址.searchParams.get('offset')) || 0))
        const 限 = Math.min(100, Math.max(1, Math.floor(Number(地址.searchParams.get('limit')) || 20)))
        const 池 = 读池()
        if (类型 === '结') {
          // 2026-11-09 02:05：按留存强度 w 从高到低；w<0.02 的沉底排最后（不删）
          const 排 = 结排序(含作废 ? (池.结 || []).slice() : 有效结(池))
          const 总 = 排.length
          const 片 = 排.slice(偏, 偏 + 限).slice().reverse()
          const 项 = 片.map(({ c, r }) => ({ t: c.t, 类型: c.类型 || '冲', 轴: c.轴, 值: c.值, 率: c.率 == null ? null : c.率, 速: c.速 || 速率档(c.率), w: r.w, 龄天: r.龄天, 沉底: r.沉底, 作废: c.作废 === true, 注: c.注 || '' }))
          return 回(200, { ok: true, kind: 类型, total: 总, offset: 偏, limit: 限, items: 项 })
        }
        // 2026-11-15 22:5x：列表页按会话切、段号/为谁
        const 要会话 = 地址.searchParams.get('sid') || ''
        const 轨索引 = (() => {
          const m = new Map()
          try { for (const [短, 列] of 取轨迹表()) for (const f of 列) if (f.轮 != null) m.set(短 + '|' + String(f.轮), f) } catch (e) {}
          return m
        })()
        const 源 = (池.events || []).filter((e) => {
          if (!含并入 && e && e.merged_into) return false
          if (要会话 && 短会话(e.sid) !== 要会话) return false
          return true
        })
        const 总 = 源.length
        const 尾 = Math.max(0, 总 - 偏)
        const 头 = Math.max(0, 尾 - 限)
        const 片 = 源.slice(头, 尾)
        const 项 = 片.map((e) => {
          const 轨 = 轨索引.get(短会话(e.sid) + '|' + String(e.turn))
          // 2026-11-16 19:4x：事件行要说清「什么情绪 + 因为什么」。
          // 名字优先 定名（来源词一律当没有），其次 注；依据缺时用该轮轨迹里的注/依据补。
          const 来源词 = /^(推轴|自报|命名|事件)$/
          let 名 = typeof e.定名 === 'string' ? e.定名.trim() : (e.定名 && e.定名.名 ? String(e.定名.名).trim() : '')
          if (来源词.test(名)) 名 = ''
          const 注0 = String(e.注 || '').trim() || String((轨 && 轨.注) || '').trim()
          const 依0 = String(e.依据 || '').trim() || String((轨 && 轨.依据) || '').trim()
          if (!名) 名 = 注0 || ''
          const 源0 = e.推轴来源 || (/推轴/.test(e.note || '') ? '推轴' : (/自报/.test(e.note || '') ? '自报' : (/命名/.test(e.note || '') ? '命名' : '事件')))
          return {
            t: e.t, sid: e.sid, turn: e.turn,
            段数: 轨 && 轨.分段 ? 轨.分段.length : null,
            为谁: (轨 && 轨.为谁) || e.为谁 || null,
            delta_raw: e.delta_raw || null,
            note: e.note || '',
            名: 名 || null,
            注: 注0 || null,
            依据: 依0 || null,
            来源: 源0,
            原话: e.原话 || '',
            夹断: Array.isArray(e.夹断) ? e.夹断 : null,
          }
        })
        return 回(200, { ok: true, kind: 类型, total: 总, offset: 偏, limit: 限, items: 项 })
      } catch (e) {
        return 回(500, { ok: false, error: String((e && e.message) || e) })
      }
    },
  }))

  // v0.4 R1：清零（/reset）——事件、结、溢出、轴全部归零；配置不动
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-emotion-pool/reset',
    handler: async (req, res) => {
      const 回 = (码, o) => { res.statusCode = 码; res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)) }
      const 来 = String((req.socket && req.socket.remoteAddress) || '')
      if (!['::1', '127.0.0.1', '::ffff:127.0.0.1'].includes(来)) return 回(403, { ok: false, error: '只接受本机 127.0.0.1' })
      if (req.method !== 'POST') return 回(405, { ok: false, error: '只接受 POST' })
      try {
        const 旧 = 读池()
        const 新池 = { ...空池(), rev: (Number(旧.rev) || 0) + 1, updated: 现在() }
        写池(新池, { 允许清空: true })
        写日志(读配置(), '[' + 时分() + '] 清零 ｜ rev ' + 新池.rev + ' ｜ 事件/结/溢出全部归零')
        return 回(200, { ok: true, rev: 新池.rev })
      } catch (e) {
        return 回(500, { ok: false, error: String((e && e.message) || e) })
      }
    },
  }))

  // 2026-11-09 11:20：归档——作废结 + 7 天前事件 → memory\情绪池-归档-YYYY-MM.jsonl
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-emotion-pool/archive',
    handler: async (req, res) => {
      const 回 = (码, o) => { res.statusCode = 码; res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)) }
      const 来 = String((req.socket && req.socket.remoteAddress) || '')
      if (!['::1', '127.0.0.1', '::ffff:127.0.0.1'].includes(来)) return 回(403, { ok: false, error: '只接受本机 127.0.0.1' })
      if (req.method !== 'POST') return 回(405, { ok: false, error: '只接受 POST' })
      try {
        return 回(200, 归档旧项())
      } catch (e) {
        return 回(500, { ok: false, error: String((e && e.message) || e) })
      }
    },
  }))
  const 取状态 = async () => {
    let 文 = ''
    const 假 = { statusCode: 200, setHeader() {}, end(x) { 文 = String(x) } }
    await 状态处理器({ method: 'GET', url: '/dsh-emotion-pool/state', socket: { remoteAddress: '127.0.0.1' } }, 假)
    return JSON.parse(文 || '{}')
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-emotion-pool/settings',
    handler: async (req, res) => {
      const 回 = (码, o) => { res.statusCode = 码; res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)) }
      const 来 = String((req.socket && req.socket.remoteAddress) || '')
      if (!['::1', '127.0.0.1', '::ffff:127.0.0.1'].includes(来)) return 回(403, { ok: false, error: '只接受本机 127.0.0.1' })
      const 法 = String(req.method || 'GET').toUpperCase()
      if (法 === 'GET') {
        try { const 配0 = 读配置(); return 回(200, { 组: 设置表(), 组配置: 组名单(配0), 池配置: 全部池(配0), 装载: 装载名单(配0), 版本, 打点模型: 打点模型信息() }) } catch (e) { return 回(500, { ok: false, error: String((e && e.message) || e) }) }
      }
      if (法 !== 'POST') return 回(405, { ok: false, error: '只接受 GET/POST' })
      let 体 = null
      try { let x = ''; for await (const c of req) x += c; 体 = JSON.parse(x || '{}') } catch {}
      if (!体 || typeof 体 !== 'object' || Array.isArray(体)) return 回(400, { ok: false, error: '请求体必须是 JSON 对象' })
      const 键 = String(体.键 || '')
      const r = 写设置(键, 体.值)
      if (!r.ok) return 回(r.码 || 400, { ok: false, error: r.错误 })
      return 回(200, { ok: true, 键: r.键, 值: r.值 })
    },
  }))
  // v0.23 B：把某个会话挪到某个组（组名为空 = 不装载）
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-emotion-pool/group',
    handler: async (req, res) => {
      const 回 = (码, o) => { res.statusCode = 码; res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)) }
      const 来 = String((req.socket && req.socket.remoteAddress) || '')
      if (!['::1', '127.0.0.1', '::ffff:127.0.0.1'].includes(来)) return 回(403, { ok: false, error: '只接受本机 127.0.0.1' })
      if (String(req.method || '').toUpperCase() !== 'POST') return 回(405, { ok: false, error: '只接受 POST' })
      let 体 = null
      try { let x = ''; for await (const c of req) x += c; 体 = JSON.parse(x || '{}') } catch {}
      if (!体 || typeof 体 !== 'object' || Array.isArray(体)) return 回(400, { ok: false, error: '请求体必须是 JSON 对象' })
      const 操作 = String(体.操作 || '')
      const 参 = 操作 === '删除' ? (体.删文件 ? '连文件' : '') : (体.新名 != null ? 体.新名 : 体.会话)
      const r = 操作 ? 池操作(操作, 体.池, 参) : 改会话组(体.会话, 体.组)
      if (!r.ok) return 回(r.码 || 400, { ok: false, error: r.错误 })
      return 回(200, { ok: true, 组: r.组, 来源: 装载来源(读配置()), 恢复: !!r.恢复, 连文件: !!r.连文件, 文件还在: r.文件还在 != null ? !!r.文件还在 : false })
    },
  }))
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/dsh-emotion-pool/manual', handler: async (req, res) => {
    const 回 = (码, o) => { res.statusCode = 码; res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)) }
    const 来 = String((req.socket && req.socket.remoteAddress) || '')
    if (!['::1', '127.0.0.1', '::ffff:127.0.0.1'].includes(来)) return 回(403, { ok: false, error: '只接受本机 127.0.0.1' })
    if (String(req.method || 'GET').toUpperCase() !== 'GET') return 回(405, { ok: false, error: '只支持 GET' })
    const 配 = 读配置()
    const p = 说明书路径(配)
    let 文 = ''
    try { 文 = readFileSync(p, 'utf8') } catch (e) { 文 = 说明书全文(读池(), 配) }
    let sec = null
    try { sec = new URL(String(req.url || ''), 'http://127.0.0.1').searchParams.get('sec') } catch (e) { sec = null }
    if (sec != null && sec !== '') {
      const n = Number(sec)
      if (!Number.isInteger(n) || n < 0 || n > 9) return 回(404, { ok: false, error: '没有第 ' + sec + ' 节' })
      const 节文 = 取说明书节(文, n)
      if (!节文) return 回(404, { ok: false, error: '没有第 ' + sec + ' 节' })
      文 = 节文
    }
    res.statusCode = 200
    res.setHeader('content-type', 'text/markdown; charset=utf-8')
    res.end(文)
  } }))
  // 2026-11-16 17:0x（卡片前端第 13 项）：点一下就在本机打开说明书，不是只给路径
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/dsh-emotion-pool/manual/open', handler: async (req, res) => {
    const 回 = (码, o) => { res.statusCode = 码; res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)) }
    if (!本机(req)) return 回(403, { ok: false, 错误: '只接受本机 127.0.0.1' })
    if (String(req.method || 'GET').toUpperCase() !== 'POST') return 回(405, { ok: false, 错误: '只支持 POST' })
    const 配 = 读配置()
    const p = 使用说明路径(配)
    try {
      // 使用说明是给人读的，不自动生成；不存在就明确报错，别拿模型说明书冒充。
      if (!existsSync(p)) return 回(500, { ok: false, 错误: '使用说明文件不存在：' + p })
      // 2026-11-16 18:3x（第 4 项）：路径含中文/空格时，cmd 必须原样拿到带引号的一整个参数
      // （windowsVerbatimArguments 关掉 Node 的二次转义），否则 start 会把它当文件路径拆开打不开。
      // 2026-11-16 19:2x：.md 没有系统关联，`start "" 路径` 只会开一个停在当前目录的 cmd。
      // 改为直接用记事本打开（不经 shell，中文/空格由 Node 自己传给参数数组，不用再拼引号）。
      const 子 = spawn('notepad.exe', [p], { detached: true, stdio: 'ignore', windowsHide: false })
      子.on('error', (e) => { try { 写日志(读配置(), '打开说明书失败：' + String((e && e.message) || e)) } catch {} })
      // 2026-11-16 18:3x（第 4 项）：spawn 的失败是异步的，不 await 就会永远回 ok:true。
      const 起 = await new Promise((好) => {
        let 定 = false
        子.once('spawn', () => { if (!定) { 定 = true; 好({ ok: true }) } })
        子.once('error', (e) => { if (!定) { 定 = true; 好({ ok: false, 错误: String((e && e.message) || e) }) } })
        setTimeout(() => { if (!定) { 定 = true; 好({ ok: true }) } }, 400)
      })
      子.unref()
      if (!起.ok) return 回(500, { ok: false, 错误: '打开失败：' + 起.错误 })
      return 回(200, { ok: true, 路径: p })
    } catch (e) { return 回(500, { ok: false, 错误: String((e && e.message) || e) }) }
  } }))
  // 2026-11-16 20:3x（分享架构 0.2.6）：导出分享码 / 导入（预演→确认）
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/dsh-emotion-pool/pack/export', handler: async (req, res) => {
    const 回 = (码, o) => { res.statusCode = 码; res.setHeader('content-type', 'application/json; charset=utf-8'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(o)) }
    if (!本机(req)) return 回(403, { ok: false, 错误: '只接受本机 127.0.0.1' })
    if (String(req.method || 'GET').toUpperCase() !== 'GET') return 回(405, { ok: false, 错误: '只支持 GET' })
    try {
      const 配 = 读配置()
      const 命名 = 读命名(配)
      // 2026-11-16 20:3x：依据默认不带（?带依据=1 才带）；
      // 2026-11-16 20:4x：默认匿名（?匿名=0 才用真名），匿名时强制不带依据。
      let 带依据 = false, 匿名 = true
      try {
        const u = new URL(String(req.url || ''), 'http://127.0.0.1').searchParams
        const v = String(u.get('带依据') || u.get('依据') || '').toLowerCase()
        带依据 = v === '1' || v === 'true' || v === 'yes' || v === '是'
        const a = String(u.get('匿名') || '').toLowerCase()
        匿名 = !(a === '0' || a === 'false' || a === 'no' || a === '否')
      } catch { 带依据 = false; 匿名 = true }
      const 包 = 生成分享包(命名, { 带依据, 匿名 })
      const 码 = 编码分享包(包)
      return 回(200, { ok: true, 码, 条数: 包.条目.length, 字节数: Buffer.byteLength(码, 'utf8'), 带依据: 包.元.带依据, 匿名: 包.元.匿名, 版本: 包.版本, 种子: { 条数: 包.种子 ? 包.种子.曲线.length : 0, 含: !!包.种子 } })
    } catch (e) { return 回(500, { ok: false, 错误: '导出失败：' + String((e && e.message) || e) }) }
  } }))
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/dsh-emotion-pool/pack/preview', handler: async (req, res) => {
    const 回 = (码, o) => { res.statusCode = 码; res.setHeader('content-type', 'application/json; charset=utf-8'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(o)) }
    if (!本机(req)) return 回(403, { ok: false, 错误: '只接受本机 127.0.0.1' })
    if (String(req.method || 'GET').toUpperCase() !== 'GET') return 回(405, { ok: false, 错误: '只支持 GET' })
    try {
      const 配 = 读配置()
      let 带依据 = false, 匿名 = true
      try {
        const u = new URL(String(req.url || ''), 'http://127.0.0.1').searchParams
        const v = String(u.get('带依据') || u.get('依据') || '').toLowerCase()
        带依据 = v === '1' || v === 'true' || v === 'yes' || v === '是'
        const a = String(u.get('匿名') || '').toLowerCase()
        匿名 = !(a === '0' || a === 'false' || a === 'no' || a === '否')
      } catch { 带依据 = false; 匿名 = true }
      return 回(200, { ok: true, ...分享预览(读命名(配), { 带依据, 匿名 }) })
    } catch (e) { return 回(500, { ok: false, 错误: '预览失败：' + String((e && e.message) || e) }) }
  } }))
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/dsh-emotion-pool/pack/import', handler: async (req, res) => {
    const 回 = (码, o) => { res.statusCode = 码; res.setHeader('content-type', 'application/json; charset=utf-8'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(o)) }
    if (!本机(req)) return 回(403, { ok: false, 错误: '只接受本机 127.0.0.1' })
    if (String(req.method || 'GET').toUpperCase() !== 'POST') return 回(405, { ok: false, 错误: '只支持 POST' })
    let 体 = {}
    try { let s = ''; for await (const c of req) s += c; 体 = JSON.parse(s || '{}') } catch (e) { return 回(400, { ok: false, 错误: '请求体不是 JSON' }) }
    const 码 = String((体 && 体.码) || '').trim()
    if (!码) return 回(400, { ok: false, 错误: '分享码是空的：请先粘贴 EPN1: 开头的码' })
    let 包
    try { 包 = 解码分享包(码) } catch (e) { return 回(400, { ok: false, 解析失败: String((e && e.message) || e), 将新增: 0, 撞名: 0, 版本不符: 0 }) }
    if (!包 || 包.格式 !== 'EPN-pack') return 回(400, { ok: false, 解析失败: '格式不是 EPN-pack（实际：' + String(包 && 包.格式) + '）', 将新增: 0, 撞名: 0, 版本不符: 0 })
    const 校 = 包校验和(包)
    if (包.校验 && 包.校验.sha256 && String(包.校验.sha256) !== 校) {
      return 回(400, { ok: false, 解析失败: '校验不符：包内容被改过（声明 ' + String(包.校验.sha256).slice(0, 12) + '…，实算 ' + 校.slice(0, 12) + '…）', 将新增: 0, 撞名: 0, 版本不符: 0 })
    }
    const 配 = 读配置()
    const 本地 = 读命名(配).名字.map((x) => String(x.名))
    const 分类 = 导入分类(包, 本地, 版本)
    const 明 = (arr) => arr.slice(0, 5).map((x) => ({ 名字: String((x && (x.名字 || x.名)) || ''), 依据: String((x && x.依据) || '（无）').slice(0, 120) }))
    // 2026-11-19 任务单 1505：v2 = 可选种子；v1 无种子照旧。
    const 包版 = Number(包.版本) || 1
    if (包版 !== 1 && 包版 !== 2) return 回(400, { ok: false, 解析失败: '不支持的分享包版本：' + String(包.版本), 将新增: 0, 撞名: 0, 版本不符: 0 })
    let 入种子 = null
    if (包版 === 2 && 包.种子 != null) {
      if (!种子合法(包.种子)) {
        return 回(400, { ok: false, 解析失败: '种子结构不对：应为 500 条、每轴等长且 ≥2 点、值在 [-1,1]', 将新增: 0, 撞名: 0, 版本不符: 0 })
      }
      if (包.种子哈希 && String(包.种子哈希) !== 种子哈希(包.种子)) {
        return 回(400, { ok: false, 解析失败: '种子校验不符：种子内容被改过', 将新增: 0, 撞名: 0, 版本不符: 0 })
      }
      入种子 = 规范化种子(包.种子)
    }
    const 本地正 = 读本地种子正()
    let 种子摘要
    if (!入种子) 种子摘要 = { 条数: 0, 将写入: false, 原因: 包版 === 2 ? '本包未含种子' : 'v1 包不含种子' }
    else if (!本地正) 种子摘要 = { 条数: 500, 将写入: true, 原因: '本地无种子' }
    else if (种子哈希(本地正) === 种子哈希(入种子)) 种子摘要 = { 条数: 500, 将写入: false, 原因: '本地已有同种子' }
    else 种子摘要 = { 条数: 500, 将写入: false, 原因: '本地种子不同，保留本地' }
    const 摘要 = { 预演: true, 匿名: !!分类.匿名, 种子: 种子摘要, 提示: 分类.匿名 ? '这是匿名包（名字1…N），已加「导入·」前缀，名字需要你自己起' : undefined, 将新增: 分类.将新增.length, 撞名: 分类.撞名.length, 版本不符: 分类.版本不符.length, 解析失败: 0, 明细: { 将新增: 明(分类.将新增), 撞名: 明(分类.撞名), 版本不符: 明(分类.版本不符) } }
    if (体.预演 !== false) return 回(200, { ok: true, ...摘要 })
    if (!体.确认) return 回(400, { ok: false, 错误: '确认导入必须显式带 确认:true（预演不写盘）', ...摘要, 预演: true })
    // 2026-11-19：先写种子（原子 + .bak-导入前），成功后再写命名表；命名表失败用 .bak 回滚种子，不许「部分成功」。
    let 种子写入 = null
    try {
      if (种子摘要.将写入) 种子写入 = 写本地种子(入种子)
    } catch (e) {
      return 回(500, { ok: false, 错误: '种子写入失败：' + String((e && e.message) || e), ...摘要 })
    }
    try {
      const r = 应用导入(分类, 配)
      return 回(200, {
        ok: true,
        预演: false,
        ...摘要,
        种子: { ...种子摘要, 已写: !!种子写入, 路径: 种子写入 ? 种子写入.路径 : null, 备份: 种子写入 ? 种子写入.备份 : null },
        已写盘: { ...r, 种子: 种子写入 ? 500 : 0 },
        命名表: 命名文件(配),
        只读表: 命名只读路径,
      })
    } catch (e) {
      if (种子写入) {
        try {
          if (种子写入.备份) {
            copyFileSync(种子写入.备份, 种子写入.路径)
            unlinkSync(种子写入.备份)
          } else {
            unlinkSync(种子写入.路径)
          }
        } catch {}
      }
      return 回(500, { ok: false, 错误: '写盘失败（种子已回滚）：' + String((e && e.message) || e), ...摘要 })
    }
  } }))
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/dsh-emotion-pool/state', handler: 状态处理器 }))
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/dsh-emotion-pool/v1/state', handler: async (req, res) => {
    const o = await 取状态()
    delete o.刺
    delete o.刺合计
    o.版本 = 'v1'
    res.statusCode = 200
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(o))
  } }))

  // 0.3：分片存储只读接口（两种模式都可用，结构一致）
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/dsh-emotion-pool/v2/meta', handler: (req, res) => {
    res.statusCode = 200
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({
      version: 1,
      字段说明: {
        全局: { 轴: 'axes 之和（含 spine，已乘刻度）', 零点: '各组零点之和（已乘刻度）', spine: '全局固定偏置' },
        会话: { 轴: '该会话快照 + 所属组零点', 快照: '会话快照 x/t/τ', 六头计: '所属组近 7 天六头计数' },
        模板: { 总: '模板总数', 候选: '候选数' },
      },
      生成时间: new Date().toISOString(),
    }))
  } }))
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/dsh-emotion-pool/v2/state', handler: (req, res) => {
    try {
      const 池 = 读池()
      const 配 = 读配置()
      const 刻 = 读数刻度(配)
      const 组s = 组名单(配)
      const 会话 = {}
      for (const 短 of Object.keys(池.会话快照 || {})) {
        const 组 = 组s.find((g) => (g.会话 || []).includes(短))
        const 零 = (组 && 池.组零点 && 池.组零点[组.名]) || { E: 0, S: 0, P: 0 }
        const x = 池.会话快照[短] || {}
        const 轴 = {}
        for (const k of 轴们) 轴[k] = 标值(配, (Number(x[k] && x[k].x) || 0) + (Number(零[k]) || 0))
        会话[短] = { 轴, 快照: x, 六头计: (组 && 池.组六头 && 池.组六头[组.名]) || {} }
      }
      const 零点 = {}
      for (const k of 轴们) 零点[k] = 标值(配, 池.零点 && 池.零点[k])
      const 出 = {
        version: 1,
        时间: new Date().toISOString(),
        存储模式: 配.存储模式 || '旧',
        刻度: 刻,
        全局: {
          轴: { E: 标值(配, 池.axes && 池.axes.E), S: 标值(配, 池.axes && 池.axes.S), P: 标值(配, 池.axes && 池.axes.P) },
          零点,
          spine: 池.spine || {},
        },
        会话,
        模板: { 总: (读模板().模板 || []).length, 候选: (读模板().候选 || []).length },
      }
      res.statusCode = 200
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(出))
    } catch (e) {
      res.statusCode = 500
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ ok: false, error: String((e && e.message) || e) }))
    }
  } }))
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/dsh-emotion-pool/v2/events', handler: (req, res) => {
    try {
      const u = new URL(String(req.url || ''), 'http://127.0.0.1')
      const sid = String(u.searchParams.get('sid') || '')
      const since = u.searchParams.get('since')
      const 限 = Math.max(1, Math.min(500, Number(u.searchParams.get('limit')) || 200))
      const 池 = 读池()
      let 条 = (池.events || []).slice()
      if (sid) 条 = 条.filter((e) => 短会话(e.sid) === 短会话(sid))
      if (since) {
        const t0 = Date.parse(since)
        if (Number.isFinite(t0)) 条 = 条.filter((e) => Date.parse(String(e.t || '')) > t0)
      }
      条.sort((a, b) => {
        const d = Date.parse(String(a.t || '')) - Date.parse(String(b.t || ''))
        if (d) return d
        const s = String(a.sid || '').localeCompare(String(b.sid || ''))
        return s || (Number(a.turn) || 0) - (Number(b.turn) || 0)
      })
      const 还有 = 条.length > 限
      条 = 条.slice(0, 限)
      res.statusCode = 200
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ version: 1, 事件: 条, 还有 }))
    } catch (e) {
      res.statusCode = 500
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ ok: false, error: String((e && e.message) || e) }))
    }
  } }))

  // v0.4 R2：手动归并未命名事件
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-emotion-pool/merge',
    handler: async (req, res) => {
      const 回 = (码, o) => { res.statusCode = 码; res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)) }
      const 来 = String((req.socket && req.socket.remoteAddress) || '')
      if (!['::1', '127.0.0.1', '::ffff:127.0.0.1'].includes(来)) return 回(403, { ok: false, error: '只接受本机 127.0.0.1' })
      if (req.method !== 'POST') return 回(405, { ok: false, error: '只接受 POST' })
      try {
        return 回(200, 归并未命名())
      } catch (e) {
        return 回(500, { ok: false, error: String((e && e.message) || e) })
      }
    },
  }))

  // §24.2：命名表只读接口 + 新增接口（区间重叠/跨度不足直接拒）
  // 2026-11-09 04:15：SSE——写池成功就推 rev，挂饰收到立刻刷新（保留滚动位置）
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-emotion-pool/stream',
    handler: (req, res) => {
      try {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store',
          Connection: 'keep-alive',
        })
        res.write('data: ' + JSON.stringify({ rev: 读池().rev }) + '\n\n')
      } catch (e) { return }
      订阅者.add(res)
      const 收 = () => { 订阅者.delete(res) }
      try { req.on && req.on('close', 收) } catch (e) {}
      try { res.on && res.on('close', 收) } catch (e) {}
    },
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-emotion-pool/v1/stream',
    handler: async (req, res) => {
      try {
        const o = await 取状态()
        o.版本 = 'v1'
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store',
          Connection: 'keep-alive',
        })
        res.write('event: state\ndata: ' + JSON.stringify(o) + '\n\n')
      } catch (e) { return }
      订阅者.add(res)
      const 收 = () => { 订阅者.delete(res) }
      try { req.on && req.on('close', 收) } catch (e) {}
      try { res.on && res.on('close', 收) } catch (e) {}
    },
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-emotion-pool/v1/schema',
    handler: (req, res) => {
      res.statusCode = 200
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({
        $schema: 'http://json-schema.org/draft-07/schema#',
        title: '鲸汐ESP /v1/state',
        type: 'object',
        required: ['版本', 'ok', '刻度', 'rev', 'axes', 'cell'],
        properties: {
          版本: { const: 'v1' },
          ok: { type: 'boolean' },
          刻度: { type: 'number', description: '对外数值的刻度倍数；axes/坐标向量/结值/事件 delta_raw 已乘刻度' },
          启用: { type: 'boolean' },
          注入启用: { type: 'boolean' },
          写入者: { type: 'array', items: { type: 'string' } },
          rev: { type: 'integer' },
          updated: { type: 'string' },
          axes: { type: 'object', properties: { E: { type: 'number' }, S: { type: 'number' }, P: { type: 'number' } } },
          axes归一化: { type: 'object', description: '内部 −1～+1 原值' },
          坐标向量: { type: 'object', description: '每轴 {值, 溢出, 向量}，向量=值+溢出' },
          spine: { type: 'object' },
          回落: { type: 'object', properties: { 小时: { type: 'number' }, 倍: { type: 'number' } } },
          cell: { type: 'string', description: '27 格，例如 E0S+P0' },
          格名: { type: 'string' },
          命名: { type: ['string', 'null'] },
          命名注: { type: ['string', 'null'] },
          命名来源: { type: 'string', enum: ['轴级', '区间', '基础名'] },
          命名轴: { type: ['string', 'null'] },
          显示: { type: 'object' },
          显示文本: { type: 'string' },
          解释: { type: 'string' },
          结: { type: 'array', description: '最近 20 条，或按 w 排序；带 t/轴/值/率/速/w/沉底' },
          结合计: { type: 'object' },
          结沉底数: { type: 'integer' },
          事件明细: { type: 'array', description: '最近 5 条事件（t/delta_raw/note/定名）' },
          双轨: { type: 'object' },
          未命名比例: { type: 'number' },
          未命名区间数: { type: 'integer' },
          警告: { type: 'array', items: { type: 'string' } },
          stats: { type: 'object' },
        },
      }))
    },
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-emotion-pool/names',
    handler: async (req, res) => {
      const 配置 = 读配置()
      const 池 = 读池()
      const 现 = 现值(池)
      const 强 = Math.max(...轴们.map((k) => Math.abs(现.轴[k])))
      const 格 = 算格(池.prev_cell, 现.轴)
      const 基础 = {}
      for (const e of ['+', '0', '-']) for (const s of ['+', '0', '-']) for (const p of ['+', '0', '-']) {
        const 格 = `E${e}S${s}P${p}`
        基础[格] = 基础名(格)
      }
      const out = {
        ok: true,
        基础,
        刻度: 读数刻度(配置),
        名字: (() => {
          const o = 读命名()
          const 刻 = 读数刻度(配置)
          const 放 = (r) => ({ lo: Number((Number(r[0]) * 刻).toFixed(3)), hi: Number((Number(r[1]) * 刻).toFixed(3)) })
          return (o.名字 || []).map((n) => ({ ...n, E: 放(n.E), S: 放(n.S), P: 放(n.P) }))
        })(),
        当前: (() => { const 命 = 命中命名(现.轴, { 配置 }); return { cell: 格, 格名: 基础名(格), 三轴: 现.轴, 强度: Number(强.toFixed(4)), 命中: 条名(命) || null, 命中轴: (命 && 命.命中轴) || null } })(),
      }
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(out))
    },
  }))

  // 主人手动改：只本机、无口令；直接改 spine（轴值的旋钮），每次写进 情绪池-手动记录.md
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-emotion-pool/set',
    handler: async (req, res) => {
      const 回 = (码, o) => { res.statusCode = 码; res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)) }
      const 来 = String((req.socket && req.socket.remoteAddress) || '')
      if (!['::1', '127.0.0.1', '::ffff:127.0.0.1'].includes(来)) return 回(403, { ok: false, error: '只接受本机 127.0.0.1' })
      if (String(req.method || '').toUpperCase() !== 'POST') return 回(405, { ok: false, error: '只接受 POST' })
      let 体 = null
      try { let s = ''; for await (const c of req) s += c; 体 = JSON.parse(s || '{}') } catch {}
      if (!体 || typeof 体 !== 'object') return 回(400, { ok: false, error: '请求体必须是 JSON' })
      const 刻 = 读数刻度(读配置())
      const 改 = {}
      for (const k of 轴们) if (体.spine && 体.spine[k] != null) 改[k] = 夹(Number(体.spine[k]) / 刻, -1, 1)
      for (const k of 轴们) if (体[k] != null) 改[k] = 夹(Number(体[k]) / 刻, -1, 1)
      if (!Object.keys(改).length) return 回(400, { ok: false, error: '至少给一个轴（E/S/P 或 spine.E）' })
      const 原因 = String(体.原因 || 体.reason || '').trim()
      const 后 = 带锁(() => {
        const 池 = 读池()
        const 前 = { ...池.spine }
        for (const k of 轴们) if (改[k] != null) 池.spine[k] = 改[k]
        池.rev += 1
        池.updated = 现在()
        写池(池)
        return { 前, 后: { ...池.spine }, 池 }
      })
      const 行 = `- [${现在()}] 改 ${Object.keys(改).map((k) => `spine.${k}: ${Number(后.前[k] || 0).toFixed(3)} → ${Number(后.后[k] || 0).toFixed(3)}`).join('；')}${原因 ? ` ｜ 原因：${原因}` : ''} ｜ 来源：127.0.0.1`
      try { appendFileSync(手动记录路径, 行 + '\n', 'utf8') } catch {}
      写日志(读配置(), `[${时分()}] /set ${行}`)
      return 回(200, { ok: true, spine: 后.后, rev: 后.池.rev, 记录: 手动记录路径 })
    },
  }))

  // 工具/接口自报：正文不再写 `<!-- EMO … -->`，直接 POST 到这里；
  // 和正文自报走同一套入库（同 rev、同事件、同守恒/刺）。
  const 报处理器 = async (req, res, v1) => {
      const 回 = (码, o) => { res.statusCode = 码; res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)) }
      const 来 = String((req.socket && req.socket.remoteAddress) || '')
      if (!['::1', '127.0.0.1', '::ffff:127.0.0.1'].includes(来)) return 回(403, { ok: false, error: '只接受本机 127.0.0.1' })
      if (String(req.method || '').toUpperCase() !== 'POST') return 回(405, { ok: false, error: '只接受 POST' })
      let 体 = null
      try { let s = ''; for await (const c of req) s += c; 体 = JSON.parse(s || '{}') } catch {}
      if (!体 || typeof 体 !== 'object' || Array.isArray(体)) return 回(400, { ok: false, error: '请求体必须是 JSON 对象' })
      const 认 = ['E', 'S', 'P', '注', '档', '结', '刺', '会话', '轮', '用户话', '来源']
      const 未知 = Object.keys(体).filter((k) => !认.includes(k))
      if (未知.length) return 回(400, { ok: false, error: '只认 E/S/P/注/档/结/刺/会话/轮/用户话/来源；不认识：' + 未知.join(',') })
      if (v1) {
        const 源 = String(体.来源 || '').trim()
        if (!源) return 回(400, { ok: false, error: 'v1/report 必须带 来源（插件名）' })
        const 谁 = String(体.会话 || '')
        const 名 = (读配置().写入者 || []).map((x) => 短会话(String(x)))
        const 准 = 名.length > 0 && 名.includes(短会话(谁))
        if (!准) {
          写日志(读配置(), '[' + 时分() + '] 外部写入被拒 ｜ 来源 ' + 源 + ' ｜ 会话 ' + (谁 || '(空)'))
          return 回(403, { ok: false, error: '只接受写入者名单内的会话' })
        }
      }

      // v0.5：外部按「刻度单位」报（刻度 10 时 E+1 = 内部 0.1）；|Δ|≤0.30 仍按内部判
      const 配置早 = 读配置()
      const 刻 = 读数刻度(配置早)
      const delta = {}
      for (const k of 轴们) {
        const v = 体[k]
        if (v == null) { delta[k] = 0; continue }
        if (typeof v !== 'number' || !Number.isFinite(v)) return 回(400, { ok: false, error: `${k} 必须是数字` })
        const 内 = v / 刻
        if (Math.abs(内) > 0.3 + 1e-9) return 回(400, { ok: false, error: `${k} 的 |Δ| 超过 ${(0.3 * 刻).toFixed(2)}（刻度 ${刻}）` })
        delta[k] = 内
      }
      if (!轴们.some((k) => Math.abs(delta[k]) > 1e-9)) return 回(400, { ok: false, error: 'E/S/P 至少有一个非 0' })

      const 配置 = 读配置()
      const sid = String(体.会话 || (配置.写入者 && 配置.写入者[0]) || '').trim()
      if (!sid) return 回(400, { ok: false, error: '没有会话，也没有配置写入者' })
      const 轮 = 体.轮 != null ? String(体.轮) : 'api-' + Date.now()
      const 注 = String(体.注 || '').slice(0, 200)
      const 结 = {}
      if (体.结 && typeof 体.结 === 'object') {
        for (const k of 轴们) if (体.结[k] != null) 结[k] = 夹((Number(体.结[k]) || 0) / 刻, -0.2, 0.2)
      } else if (体.刺 && typeof 体.刺 === 'object') {
        // 旧调用兼容（deprecated：v1 只认 结）
        for (const k of 轴们) if (体.刺[k] != null) 结[k] = 夹((Number(体.刺[k]) || 0) / 刻, -0.2, 0.2)
      }
      const 号 = (v) => (v > 0 ? '+' : v < 0 ? '-' : '0')
      const 解 = {
        自报: 轴们.map((k) => `${k}${号(delta[k])}`).join(' ') + (体.档 ? ` @${String(体.档)}` : ''),
        delta, 注, 结, 档名无效: false,
      }
      if (v1) 解.来源 = String(体.来源 || '').trim()
      const 用户话 = String(体.用户话 || 最近用户.get(sid) || 最后用户 || '')
      const r = 写自报(sid, 轮, 解, 用户话)
      if (!r || !r.已写) return 回(200, { ok: false, 说: '已记录但没有进池（未启用，或不是配置里的写入者）；看日志' })

      const 池 = 读池()
      const 现 = 现值(池)
      const 格 = 算格(池.prev_cell, 现.轴)
      const 命中 = 命中命名(现.轴, { 配置 })
      const 命名 = 命中 ? 条名(命中) : 基础名(格)
      const 命名注 = 命中 ? String(命中.注 || '') : `落在 ${格} 这一格；这一格还没有区间名。`
      const 显示文本 = `${轴们.map((k) => {
        const s = 现.轴[k] > 0.05 ? '+' : 现.轴[k] < -0.05 ? '-' : '0'
        return `${k}${s} ${Number(现.轴[k]).toFixed(4)}`
      }).join(' ｜ ')} ｜ ${命名}${命名注 ? `：${命名注}` : ''}`
      return 回(200, {
        ok: true,
        rev: 池.rev,
        命名,
        命名注,
        命名来源: 命中 ? (命中.轴级 ? '轴级' : '区间') : '基础名',
        显示文本,
        轴值: 现.轴,
        事件数: 池.events.length,
      })
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/dsh-emotion-pool/report', handler: (req, res) => 报处理器(req, res, false) }))
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/dsh-emotion-pool/v1/report', handler: (req, res) => 报处理器(req, res, true) }))

  // 状态面板：纯 HTML + 内联 JS，每 5 秒自拉 /state；不写任何文件，不引外链
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-emotion-pool/panel',
    handler: async (req, res) => {
      const 来 = String((req.socket && req.socket.remoteAddress) || '')
      if (!['::1', '127.0.0.1', '::ffff:127.0.0.1'].includes(来)) {
        res.statusCode = 403
        res.setHeader('content-type', 'text/plain; charset=utf-8')
        res.end('只接受本机 127.0.0.1')
        return
      }
      res.statusCode = 200
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.end(面板HTML())
    },
  }))

  // 挂到 DSH 界面：右下角小卡片（照 dsh-feiyu-mood 的注册方式：serve 脚本 + index-inject）
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-emotion-pool/widget.js',
    handler: async (req, res) => {
      try {
        const text = readFileSync(join(包根, 'assets', 'widget.js'), 'utf8')
        res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
        res.end(text)
      } catch (e) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('widget.js not found')
      }
    },
  }))
  try {
    // 2026-11-09 15:15：加构建时间戳，防止浏览器缓存旧挂饰
    // 2026-11-09：版本号改成按 widget.js 的修改时间取——只改前端、不重启，刷新也能拿到新的
  const 界面版本 = (() => {
    try { return String(statSync(join(包根, 'assets', 'widget.js')).mtimeMs).replace(/\./g, '') } catch { return String(Date.now()) }
  })()
    const 注入行 =
      '(function(){try{var d=document.body||document.head||document.documentElement;if(!d)return;' +
      'if(window.__emotionPoolWidget)return;' +
      'var s=document.createElement("script");s.src="/dsh-emotion-pool/widget.js?v=' + 界面版本 + '";' +
      's.onerror=function(){};d.appendChild(s)}catch(e){}})()'
    ctx.on('webserver/index-inject', (table) => {
      if (!Array.isArray(table)) return
      for (const row of table) {
        if (row && ((row.kind === 'script-src' && row.src === '/dsh-emotion-pool/widget.js') ||
          (row.kind === 'script' && typeof row.text === 'string' && row.text.indexOf('/dsh-emotion-pool/widget.js') >= 0))) return
      }
      table.push({ kind: 'script', placement: 'body', text: 注入行 })
    })
  } catch (e) { /* 注入失败不影响主功能 */ }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-emotion-pool/name',
    handler: async (req, res) => {
      const 配置 = 读配置()
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end(JSON.stringify({ ok: false, error: '只接受 POST' }))
        return
      }
      let 体 = null
      try {
        let s = ''
        for await (const c of req) s += c
        体 = JSON.parse(s || '{}')
      } catch {}
      if (!体) { res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: '请求体必须是 JSON' })); return }
      const 刻 = 读数刻度(配置)
      const 换体 = JSON.parse(JSON.stringify(体))
      for (const k of 轴们) if (Array.isArray(换体[k])) 换体[k] = 换体[k].map((v) => Number(v) / 刻)
      const r = 加命名(配置, 换体)
      res.statusCode = r.ok ? 200 : 400
      res.end(JSON.stringify(r))
    },
  }))
  // 待确认页：模板/候选读接口与确认/丢弃/改名（都只本机；写操作校验写入者）
  const 本机 = (req) => ['::1', '127.0.0.1', '::ffff:127.0.0.1'].includes(String((req.socket && req.socket.remoteAddress) || ''))
  const 回JSON = (res, 码, o) => { res.statusCode = 码; res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)) }
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/dsh-emotion-pool/perf', handler: async (req, res) => {
    if (!本机(req)) return 回JSON(res, 403, { ok: false, error: '只接受本机 127.0.0.1' })
    if (String(req.method || '').toUpperCase() !== 'POST') return 回JSON(res, 405, { ok: false, error: '只接受 POST' })
    const 体 = await 读JSON体(req)
    if (!体) return 回JSON(res, 400, { ok: false, error: '请求体必须是 JSON' })
    记性能(体)
    return 回JSON(res, 200, { ok: true })
  } }))
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/dsh-emotion-pool/tpl', handler: (req, res) => {
    if (!本机(req)) return 回JSON(res, 403, { ok: false, error: '只接受本机 127.0.0.1' })
    try {
      // 2026-11-19 命名闭环：候选改读 待命名表（不再读已删除的 情绪模板.json）
      const 候 = 待命名候选()
      const 表 = 读命名(读配置())
      const 模 = (表.名字 || []).map((t) => {
        const 原 = Array.isArray(t.原型) ? t.原型 : []
        return {
          名: t.名,
          次数: 原.length,
          建: (t.来源 && t.来源.时间) || t.建 || null,
          有原型: 原.length > 0,
          原型数: 原.length,
          样本: 原型样本(原),
        }
      })
      return 回JSON(res, 200, { ok: true, 模板: 模, 候选: 候 })
    } catch (e) { return 回JSON(res, 500, { ok: false, error: String((e && e.message) || e) }) }
  } }))
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/dsh-emotion-pool/tpl/confirm', handler: async (req, res) => {
    if (!本机(req)) return 回JSON(res, 403, { ok: false, error: '只接受本机 127.0.0.1' })
    if (String(req.method || '').toUpperCase() !== 'POST') return 回JSON(res, 405, { ok: false, error: '只接受 POST' })
    const 体 = await 读JSON体(req)
    if (!体) return 回JSON(res, 400, { ok: false, error: '请求体必须是 JSON' })
    const 配 = 读配置()
    if (!会话可写(体, 配)) return 回JSON(res, 403, { ok: false, error: '只接受写入者名单内的会话' })
    const 待 = 体.待命名
    if (!待 || !Number.isFinite(Number(待.E)) || !Number.isFinite(Number(待.S)) || !Number.isFinite(Number(待.P))) {
      return 回JSON(res, 400, { ok: false, error: '缺 待命名 的 E/S/P 格点' })
    }
    try {
      const r = 收录待命名(配, 体.名, 待.E, 待.S, 待.P)
      return 回JSON(res, r.ok ? 200 : 400, r)
    } catch (e) { return 回JSON(res, 500, { ok: false, error: String((e && e.message) || e) }) }
  } }))
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/dsh-emotion-pool/tpl/drop', handler: async (req, res) => {
    if (!本机(req)) return 回JSON(res, 403, { ok: false, error: '只接受本机 127.0.0.1' })
    if (String(req.method || '').toUpperCase() !== 'POST') return 回JSON(res, 405, { ok: false, error: '只接受 POST' })
    const 体 = await 读JSON体(req)
    if (!体) return 回JSON(res, 400, { ok: false, error: '请求体必须是 JSON' })
    const 配 = 读配置()
    if (!会话可写(体, 配)) return 回JSON(res, 403, { ok: false, error: '只接受写入者名单内的会话' })
    try {
      const r = 丢弃待命名(配, 体.E, 体.S, 体.P)
      return 回JSON(res, r.ok ? 200 : 400, r)
    } catch (e) { return 回JSON(res, 500, { ok: false, error: String((e && e.message) || e) }) }
  } }))
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/dsh-emotion-pool/tpl/rename', handler: async (req, res) => {
    if (!本机(req)) return 回JSON(res, 403, { ok: false, error: '只接受本机 127.0.0.1' })
    if (String(req.method || '').toUpperCase() !== 'POST') return 回JSON(res, 405, { ok: false, error: '只接受 POST' })
    const 体 = await 读JSON体(req)
    if (!体) return 回JSON(res, 400, { ok: false, error: '请求体必须是 JSON' })
    const 配 = 读配置()
    if (!会话可写(体, 配)) return 回JSON(res, 403, { ok: false, error: '只接受写入者名单内的会话' })
    const 旧 = String(体.旧 || '').trim()
    const 新 = String(体.新 || '').trim().slice(0, 24)
    if (!旧 || !新) return 回JSON(res, 400, { ok: false, error: '缺 旧/新' })
    if (旧 === 新) return 回JSON(res, 200, { ok: true })
    try {
      const o = 读命名(配)
      if ((o.名字 || []).some((x) => String(x.名) === 新)) return 回JSON(res, 400, { ok: false, error: '该名字已存在' })
      const t = (o.名字 || []).find((x) => String(x.名) === 旧)
      if (!t) return 回JSON(res, 400, { ok: false, error: '命名表里没有这个名字：' + 旧 })
      t.名 = 新
      写命名(o, 配)
      写日志(配, '[' + 时分() + '] 命名改名 ' + 旧 + ' -> ' + 新)
      return 回JSON(res, 200, { ok: true })
    } catch (e) { return 回JSON(res, 500, { ok: false, error: String((e && e.message) || e) }) }
  } }))

  // 设置第二批：清零（先备份）、命名表删除/改名（改台账，不记 inbox）
  const 台账路径 = join(HOME, '改动台账.md')
  const 记台账 = (行) => { try { appendFileSync(台账路径, 行 + '\n', 'utf8') } catch {} }

  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/dsh-emotion-pool/data/reset', handler: async (req, res) => {
    const 回 = (码, o) => { res.statusCode = 码; res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)) }
    const 来 = String((req.socket && req.socket.remoteAddress) || '')
    if (!['::1', '127.0.0.1', '::ffff:127.0.0.1'].includes(来)) return 回(403, { ok: false, error: '只接受本机 127.0.0.1' })
    if (String(req.method || '').toUpperCase() !== 'POST') return 回(405, { ok: false, error: '只接受 POST' })
    const 体 = await 读JSON体(req)
    if (!体) return 回(400, { ok: false, error: '请求体必须是 JSON' })
    const 配 = 读配置()
    if (!会话可写(体, 配)) return 回(403, { ok: false, error: '只接受写入者名单内的会话' })
    try { return 回(200, 清零池(现在())) } catch (e) { return 回(500, { ok: false, error: String((e && e.message) || e) }) }
  } }))

  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/dsh-emotion-pool/names/delete', handler: async (req, res) => {
    const 回 = (码, o) => { res.statusCode = 码; res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)) }
    const 来 = String((req.socket && req.socket.remoteAddress) || '')
    if (!['::1', '127.0.0.1', '::ffff:127.0.0.1'].includes(来)) return 回(403, { ok: false, error: '只接受本机 127.0.0.1' })
    if (String(req.method || '').toUpperCase() !== 'POST') return 回(405, { ok: false, error: '只接受 POST' })
    const 体 = await 读JSON体(req)
    if (!体) return 回(400, { ok: false, error: '请求体必须是 JSON' })
    const 配 = 读配置()
    if (!会话可写(体, 配)) return 回(403, { ok: false, error: '只接受写入者名单内的会话' })
    const 名 = String(体.名 || '').trim()
    if (!名) return 回(400, { ok: false, error: '缺 名' })
    const o = 读命名()
    const 前 = o.名字.length
    o.名字 = o.名字.filter((x) => 条名(x) !== 名)
    if (o.名字.length === 前) return 回(400, { ok: false, error: '命名表里没有：' + 名 })
    写命名(o)
    写日志(配, '[' + 时分() + '] 命名删除 ' + 名)
    记台账('| ' + 现在().slice(0, 10) + ' | 情绪池-命名.json | 删除了「' + 名 + '」 | ' + String(体.会话 || '3be73c36') + ' |')
    return 回(200, { ok: true, 剩: o.名字.length })
  } }))

  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/dsh-emotion-pool/names/rename', handler: async (req, res) => {
    const 回 = (码, o) => { res.statusCode = 码; res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)) }
    const 来 = String((req.socket && req.socket.remoteAddress) || '')
    if (!['::1', '127.0.0.1', '::ffff:127.0.0.1'].includes(来)) return 回(403, { ok: false, error: '只接受本机 127.0.0.1' })
    if (String(req.method || '').toUpperCase() !== 'POST') return 回(405, { ok: false, error: '只接受 POST' })
    const 体 = await 读JSON体(req)
    if (!体) return 回(400, { ok: false, error: '请求体必须是 JSON' })
    const 配 = 读配置()
    if (!会话可写(体, 配)) return 回(403, { ok: false, error: '只接受写入者名单内的会话' })
    const 旧 = String(体.旧 || '').trim(), 新 = String(体.新 || '').trim().slice(0, 24)
    if (!旧 || !新) return 回(400, { ok: false, error: '缺 旧/新' })
    if (旧 === 新) return 回(200, { ok: true })
    const o = 读命名()
    if (o.名字.some((x) => 条名(x) === 新)) return 回(400, { ok: false, error: '命名表里已经有「' + 新 + '」' })
    const t = o.名字.find((x) => 条名(x) === 旧)
    if (!t) return 回(400, { ok: false, error: '命名表里没有：' + 旧 })
    t.名 = 新
    写命名(o)
    let 警 = null
    try { if ((读模板().模板 || []).some((x) => String(x.名) === 新)) 警 = '与情绪模板同名：' + 新 + '（两套命名空间不同，不阻止）' } catch {}
    写日志(配, '[' + 时分() + '] 命名改名 ' + 旧 + ' → ' + 新 + (警 ? ' ｜ 警告 ' + 警 : ''))
    记台账('| ' + 现在().slice(0, 10) + ' | 情绪池-命名.json | 改名「' + 旧 + '」→「' + 新 + '」 | ' + String(体.会话 || '3be73c36') + ' |')
    return 回(200, { ok: true, 警告: 警 })
  } }))
}
