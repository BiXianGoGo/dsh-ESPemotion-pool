// 情绪池分片存储（0.3 地基）
// 目录：<HOME>\情绪池\总.json、<HOME>\情绪池\会话\<短>.json
// 只负责读写与聚合原料；判定与数值口径仍在 lib\index.js，本文件不动。
import { mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const HOME = process.env.EMOTION_POOL_DIR || 'E:\\whale-home\\memory'
export const 根目录 = join(HOME, '情绪池')
export const 会话目录 = join(根目录, '会话')
export const 归档目录 = join(根目录, '归档')
export const 总表路径 = join(根目录, '总.json')

const 轴们 = ['E', 'S', 'P']

// 短 sid：与 index.js 的短会话() 同一规则
export function 短会话(id) {
  return String(id || '').replace(/^session-/, '').slice(0, 8)
}

export function 准备目录() {
  mkdirSync(根目录, { recursive: true })
  mkdirSync(会话目录, { recursive: true })
}

// 原子写：先写 .tmp 再 rename；绝不留下半截文件
export function 原子写(路径, 对象) {
  mkdirSync(join(路径, '..'), { recursive: true })
  const tmp = 路径 + '.tmp'
  writeFileSync(tmp, JSON.stringify(对象), 'utf8')
  renameSync(tmp, 路径)
  return true
}

const 坏 = []
export function 坏文件() {
  return 坏.slice()
}

const 会话缓存 = new Map() // 短 -> { mtimeMs, 本 }
let 目录签名 = ''
let 全部缓存 = null

function 记坏(路径, 因) {
  坏.push({ 路径, 因: String((因 && 因.message) || 因), t: new Date().toISOString() })
  if (坏.length > 50) 坏.shift()
}

export function 清缓存() {
  会话缓存.clear()
  目录签名 = ''
  全部缓存 = null
}

export function 读会话(短) {
  const p = join(会话目录, String(短) + '.json')
  try {
    const st = statSync(p)
    const 旧 = 会话缓存.get(String(短))
    if (旧 && 旧.mtimeMs === st.mtimeMs) return 旧.本
    const 本 = JSON.parse(readFileSync(p, 'utf8'))
    会话缓存.set(String(短), { mtimeMs: st.mtimeMs, 本 })
    return 本
  } catch (e) {
    if (e && e.code === 'ENOENT') return null
    记坏(p, e)
    return null
  }
}

export function 读全部() {
  准备目录()
  let 名们 = []
  try {
    名们 = readdirSync(会话目录).filter((n) => n.endsWith('.json'))
  } catch (e) {
    return {}
  }
  // 目录签名用文件名+各自 mtime，避免「删/增/改」任一漏掉
  const 签们 = []
  for (const n of 名们.sort()) {
    try {
      const st = statSync(join(会话目录, n))
      签们.push(n + ':' + st.mtimeMs)
    } catch {}
  }
  const 签 = 签们.join('|')
  if (全部缓存 && 签 === 目录签名) return 全部缓存
  const 出 = {}
  for (const n of 名们) {
    const 短 = n.replace(/\.json$/, '')
    const 本 = 读会话(短)
    if (本) 出[短] = 本
  }
  目录签名 = 签
  全部缓存 = 出
  return 出
}

export function 写会话(短, 本) {
  准备目录()
  const 路径 = join(会话目录, String(短) + '.json')
  const 新 = {
    version: 1,
    sid: 本.sid || null,
    短: String(短),
    updated: new Date().toISOString(),
    rev: Number(本.rev) || 0,
    事件: Array.isArray(本.事件) ? 本.事件 : [],
    结: Array.isArray(本.结) ? 本.结 : [],
    快照: 本.快照 && typeof 本.快照 === 'object' ? 本.快照 : {},
    状态: 本.状态 && typeof 本.状态 === 'object' ? 本.状态 : {},
  }
  原子写(路径, 新)
  会话缓存.delete(String(短))
  目录签名 = ''
  全部缓存 = null
  return 新
}

export function 读总表() {
  try {
    return JSON.parse(readFileSync(总表路径, 'utf8'))
  } catch (e) {
    if (e && e.code === 'ENOENT') return { version: 1 }
    try { renameSync(总表路径, 总表路径 + '.corrupt-' + Date.now()) } catch {}
    return { version: 1 }
  }
}

// 补丁合并：顶层键替换；嵌套对象合并一层；并发时只覆盖本次给的键
function 并(旧, 补) {
  if (!补 || typeof 补 !== 'object' || Array.isArray(补)) return 补
  if (!旧 || typeof 旧 !== 'object' || Array.isArray(旧)) return { ...补 }
  const 出 = { ...旧 }
  for (const [k, v] of Object.entries(补)) {
    出[k] = v && typeof v === 'object' && !Array.isArray(v) ? 并(旧[k], v) : v
  }
  return 出
}

export function 写总表(补丁) {
  准备目录()
  const 旧 = 读总表()
  const 新 = 并(旧, 补丁 || {})
  新.version = 1
  新.updated = new Date().toISOString()
  原子写(总表路径, 新)
  return 新
}

// 池对象 -> { 本们, 总表, 未归组事件, 未归组结 }
export function 拆池(池) {
  const 本们 = new Map()
  const 事件按 = new Map()
  const 结按 = new Map()
  for (const e of Array.isArray(池.events) ? 池.events : []) {
    const 短 = 短会话(e && e.sid)
    const 键 = /^[a-z0-9]{8}$/.test(短) ? 短 : null
    const 归 = 键 || '__未归组'
    if (!事件按.has(归)) 事件按.set(归, [])
    事件按.get(归).push(e)
    if (键 && !本们.has(键)) 本们.set(键, { 短: 键, sid: (e && e.sid) || null })
  }
  const 结源 = [].concat(Array.isArray(池.结) ? 池.结 : [], Array.isArray(池.刺) ? 池.刺 : [])
  for (const c of 结源) {
    const 短 = 短会话(c && c.sid)
    const 键 = /^[a-z0-9]{8}$/.test(短) ? 短 : null
    const 归 = 键 || '__未归组'
    if (!结按.has(归)) 结按.set(归, [])
    结按.get(归).push(c)
    if (键 && !本们.has(键)) 本们.set(键, { 短: 键, sid: (c && c.sid) || null })
  }
  for (const 短 of Object.keys(池.会话快照 || {})) {
    if (!本们.has(短)) 本们.set(短, { 短, sid: null })
  }
  const 本表 = {}
  const 空会话 = []
  for (const [短, 元] of 本们) {
    const 事件 = 事件按.get(短) || []
    const 结 = 结按.get(短) || []
    if (!事件.length && !结.length) { 空会话.push(短); continue }
    本表[短] = {
      sid: 元.sid,
      rev: Number(池.rev) || 0,
      事件,
      结,
      快照: (池.会话快照 && 池.会话快照[短]) || {},
      状态: {
        推轴次数: (池.推轴次数 && 池.推轴次数[短]) || 0,
        ...((池.会话状态 && 池.会话状态[短]) || {}),
      },
      S经验: (池.S经验 && 池.S经验[短]) || {},
    }
  }
  const 总 = {}
  for (const [k, v] of Object.entries(池 || {})) {
    if (k === 'events' || k === '刺' || k === '结' || k === '会话快照' || k === 'S经验') continue
    总[k] = v
  }
  总.未归组 = {
    事件: 事件按.get('__未归组') || [],
    结: 结按.get('__未归组') || [],
  }
  总.会话数 = Object.keys(本表).length
  总.未归组快照 = {}
  总.未归组推轴 = {}
  for (const 短 of 空会话) {
    if (池.会话快照 && 池.会话快照[短]) 总.未归组快照[短] = 池.会话快照[短]
    if (池.推轴次数 && 池.推轴次数[短] != null) 总.未归组推轴[短] = 池.推轴次数[短]
  }
  if (!Object.keys(总.未归组快照).length) delete 总.未归组快照
  if (!Object.keys(总.未归组推轴).length) delete 总.未归组推轴
  return { 本表, 总表: 总, 空会话 }
}

// 分片 -> 与旧池同形的对象（供 index.js 的 规整池/现值 等继续用）
export function 合池() {
  const 总 = 读总表()
  const 本们 = 读全部()
  const events = []
  const 结们 = []
  const 会话快照 = {}
  const 推轴次数 = { ...(总.推轴次数 || {}) }
  const 会话状态 = { ...(总.会话状态 || {}) }
  const S经验 = { ...(总.S经验 || {}) }
  for (const [短, 本] of Object.entries(本们)) {
    if (Array.isArray(本.事件)) events.push(...本.事件)
    if (Array.isArray(本.结)) 结们.push(...本.结)
    if (本.快照 && typeof 本.快照 === 'object') 会话快照[短] = 本.快照
    if (本.S经验 && typeof 本.S经验 === 'object') S经验[短] = 本.S经验
    const 次 = 本.状态 && 本.状态.推轴次数
    if (次 != null) 推轴次数[短] = Number(次) || 0
    if (本.状态 && typeof 本.状态 === 'object') {
      const { 推轴次数: _x, ...其余 } = 本.状态
      if (Object.keys(其余).length) 会话状态[短] = 其余
    }
  }
  if (Array.isArray(总.未归组事件)) events.push(...总.未归组事件)
  if (Array.isArray(总.未归组结)) 结们.push(...总.未归组结)
  if (总.未归组 && typeof 总.未归组 === 'object') {
    if (Array.isArray(总.未归组.事件)) events.push(...总.未归组.事件)
    if (Array.isArray(总.未归组.结)) 结们.push(...总.未归组.结)
  }
  if (总.未归组快照 && typeof 总.未归组快照 === 'object') {
    for (const [短, 快] of Object.entries(总.未归组快照)) 会话快照[短] = 快
  }
  if (总.未归组推轴 && typeof 总.未归组推轴 === 'object') {
    for (const [短, 次] of Object.entries(总.未归组推轴)) 推轴次数[短] = Number(次) || 0
  }
  const 池 = { ...总 }
  delete 池.未归组事件
  delete 池.未归组结
  delete 池.未归组
  delete 池.未归组快照
  delete 池.未归组推轴
  delete 池.会话数
  池.events = events
  池.结 = 结们
  delete 池.刺
  池.会话快照 = 会话快照
  池.推轴次数 = 推轴次数
  池.会话状态 = 会话状态
  池.S经验 = S经验
  return 池
}

// 只读视图：给 /v2 接口用的稳定结构
export function 元数据(池, 配置) {
  return {
    version: 1,
    sid: null,
    短: null,
    轴: { ...(池.axes || {}) },
    零点: { ...(池.零点 || {}) },
    spine: { ...(池.spine || {}) },
    刻度: Number(配置 && 配置.刻度) || 1,
    生成时间: new Date().toISOString(),
  }
}
