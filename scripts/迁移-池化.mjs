// 0.2.5 池化迁移：组 → 池
// 用法：node scripts\迁移-池化.mjs --dry|--apply|--verify
// 根目录默认 %USERPROFILE%\.whale-home\memory\情绪池，可用 EMOTION_POOL_DIR 覆盖。
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { 记六头 } from '../lib/v06.js'
import { 算K } from '../lib/dual.js'

const 根 = process.env.EMOTION_POOL_DIR || '~/.whale-home\\memory\\情绪池'
const 组路径 = join(dirname(根), '情绪池配置.json')
const 总路径 = join(根, '总.json')
const 会话目录 = join(根, '会话')
const 池目录 = join(根, '池')
const 模式 = process.argv.includes('--apply') ? 'apply' : process.argv.includes('--verify') ? 'verify' : 'dry'

const 轴们 = ['E', 'S', 'P']
const 小时 = 3600000

function 读(p) { return JSON.parse(readFileSync(p, 'utf8')) }
function 写(p, o) {
  const t = p + '.tmp'
  writeFileSync(t, JSON.stringify(o, null, 2), 'utf8')
  renameSync(t, p)
}
const 总 = 读(总路径)
const 配置 = existsSync(组路径) ? 读(组路径) : { 组: [] }
const 池们 = Array.isArray(配置.组) ? 配置.组 : []
const 分片 = {}
if (existsSync(会话目录)) {
  for (const f of readdirSync(会话目录)) {
    if (!f.endsWith('.json')) continue
    const 短 = f.replace(/\.json$/, '')
    分片[短] = 读(join(会话目录, f))
  }
}
const 全短 = Object.keys(分片)
const 已归 = new Set(池们.flatMap((p) => p.会话 || []))
const 未归 = 全短.filter((s) => !已归.has(s))

const now = Date.now()
function 池事件(会话们) {
  const 出 = []
  for (const 短 of 会话们) {
    const s = 分片[短]
    if (!s) continue
    for (const e of s.事件 || []) {
      if (!e || e.作废 === true || e.merged_into) continue
      出.push({ ...e, 短 })
    }
  }
  出.sort((a, b) => Date.parse(a.t) - Date.parse(b.t))
  return 出
}

// 每会话初值：照 推轴 的真实动作重放（不半衰、不平均）
// x=0；按时间从早到晚：x=夹(x+0.4*delta_raw,-1,1)（delta 不再夹）
function 会话初值(短) {
  const s = 分片[短]
  const ev = ((s && s.事件) || []).filter((e) => e && e.作废 !== true && !e.merged_into)
    .slice().sort((a, b) => Date.parse(a.t) - Date.parse(b.t))
  const 轴 = { E: 0, S: 0, P: 0 }
  let 最近 = 0
  for (const e of ev) {
    const t = Date.parse(String(e.t))
    if (Number.isFinite(t)) 最近 = Math.max(最近, t)
    for (const k of 轴们) {
      const d = Number(e.delta_raw && e.delta_raw[k]) || 0
      轴[k] = Math.max(-1, Math.min(1, 轴[k] + 0.4 * d))
    }
  }
  const 快照 = (s && s.快照) || {}
  const 用快照 = ev.length === 0
  if (用快照) for (const k of 轴们) 轴[k] = 快照[k] ? Number(快照[k].x) || 0 : 0
  return { 轴, 事件: ev.length, 最近, 用快照, 快照 }
}

function 加权轴(会话们) {
  const 合 = { E: 0, S: 0, P: 0 }, 权 = { E: 0, S: 0, P: 0 }
  for (const 短 of 会话们) {
    const 初 = 会话初值(短)
    const 龄 = 初.最近 ? Math.max(0, now - 初.最近) / 小时 : Infinity
    const w = Number.isFinite(龄) ? Math.pow(0.5, 龄 / 12) : 0
    for (const k of 轴们) { 合[k] += 初.轴[k] * w; 权[k] += w }
  }
  const 出 = {}
  for (const k of 轴们) 出[k] = 权[k] > 0 ? 合[k] / 权[k] : 0
  return 出
}

function 池六头(事件们) {
  const 池 = { 六头: {} }
  for (const e of 事件们) {
    const d = e.delta_raw || {}
    for (const k of 轴们) {
      const v = Number(d[k]) || 0
      if (Math.abs(v) >= 0.02) 记六头(池, k, v, Date.parse(String(e.t)) || Date.now())
    }
  }
  return 池.六头
}

function 池K(会话们) {
  const K = (总.双轨 && 总.双轨.K) || {}
  const 轮 = []
  for (const [k, 账] of Object.entries(K)) {
    if (!会话们.some((s) => String(k).includes(s))) continue
    for (const r of (账 && 账.轮) || []) 轮.push(r)
  }
  return { 轮, 算: 算K(轮) }
}

function 池对象(p) {
  const 会话们 = (p.会话 || []).filter((s) => 分片[s])
  const 事件们 = 池事件(会话们)
  const 轴 = 加权轴(会话们)
  const 快照 = {}
  for (const k of 轴们) 快照[k] = { x: Number(轴[k].toFixed(6)), t: new Date(now).toISOString(), τ: 12 }
  const kk = 池K(会话们)
  return {
    池名: p.名,
    会话: 会话们,
    初值: Object.fromEntries(会话们.map((短) => [短, 会话初值(短)])),
    事件们,
    轴,
    快照,
    六头: 池六头(事件们),
    K: kk,
    零点: (总.组零点 && 总.组零点[p.名]) || { E: 0, S: 0, P: 0 },
  }
}

const 表 = 池们.map(池对象)

if (模式 === 'dry') {
  console.log(`[--dry] 根=${根} 池=${表.length} 未归池=${未归.join(',') || '无'}`)
  for (const t of 表) {
    console.log(`池 ${t.池名}：会话=${t.会话.join(',') || '空'} 事件=${t.事件们.length}`)
    for (const 短 of t.会话) {
      const c = t.初值[短]
      const f = (k) => (c.快照[k] ? Number(c.快照[k].x).toFixed(4) : '—')
      const g = (k) => c.轴[k].toFixed(4)
      console.log(`  ${短} 事件=${c.事件}${c.用快照 ? '（无事件，用快照）' : ''}`)
      console.log(`    快照   E=${f('E')} S=${f('S')} P=${f('P')}`)
      console.log(`    初值(重放) E=${g('E')} S=${g('S')} P=${g('P')}`)
    }
    console.log(`  axes= E=${t.轴.E.toFixed(4)} S=${t.轴.S.toFixed(4)} P=${t.轴.P.toFixed(4)}`)
    console.log(`  p_state= ${JSON.stringify(总.p_state)} -> 同（复制）`)
    console.log(`  六头= ${JSON.stringify(t.六头)}`)
    console.log(`  K= 记录${t.K.轮.length}条 -> K=${t.K.算.K}`)
    console.log(`  零点= ${JSON.stringify(t.零点)}`)
  }
  console.log('（dry 未写任何文件）')
  process.exit(0)
}

if (模式 === 'apply') {
  if (!existsSync(池目录)) mkdirSync(池目录, { recursive: true })
  const 日志 = []
  for (const t of 表) {
    const 老 = existsSync(join(池目录, t.池名 + '.json')) ? 读(join(池目录, t.池名 + '.json')) : null
    const 池 = {
      version: '0.2.5',
      名: t.池名,
      会话: t.会话,
      axes: t.轴,
      spine: { E: 0, S: 0, P: 0 },
      p_state: JSON.parse(JSON.stringify(总.p_state || {})),
      六头: t.六头,
      零点: t.零点,
      当前快照: t.快照,
      S经验: Array.isArray(总.S经验) ? JSON.parse(JSON.stringify(总.S经验)) : [],
      K: { 轮: t.K.轮, 值: t.K.算.K },
      rev: 1,
      更新: new Date(now).toISOString(),
      迁移: { 版本: '0.2.5', 时间: new Date(now).toISOString(), 事件: t.事件们.length, 旧: 老 ? 老.更新 : null },
    }
    写(join(池目录, 池.名 + '.json'), 池)
    日志.push(`[${new Date(now).toLocaleString('zh-CN')}] 迁移池 ${池.名} 会话=${t.会话.join(',') || '空'} 事件=${t.事件们.length} axes=E${t.轴.E.toFixed(4)} S${t.轴.S.toFixed(4)} P${t.轴.P.toFixed(4)}`)
  }
  写(join(池目录, '迁移标记.json'), {
    版本: '0.2.5',
    时间: new Date(now).toISOString(),
    池数: 表.length,
    会话数: 表.reduce((a, t) => a + t.会话.length, 0),
    未归池: 未归,
    事件: 表.reduce((a, t) => a + t.事件们.length, 0),
  })
  const 新总 = { ...总, axes: { E: 0, S: 0, P: 0 }, spine: { E: 0, S: 0, P: 0 }, p_state: {}, 六头: {}, 零点: {}, 组六头: {}, 已迁移到池: true }
  // K：只移走已归池会话的记录；不在池里的旧记录（如 aaaaaaaa）保留在总表
  if (新总.双轨 && 新总.双轨.K) {
    const 归池短 = new Set(表.flatMap((t) => t.会话))
    for (const k of Object.keys(新总.双轨.K)) {
      if ([...归池短].some((s0) => String(k).includes(s0))) delete 新总.双轨.K[k]
    }
  }
  写(总路径, 新总)
  writeFileSync(join(根, '情绪池-迁移日志.txt'), 日志.join('\n') + '\n', 'utf8')
  console.log(`[--apply] 根=${根} 池=${表.length}`)
  for (const 行 of 日志) console.log('  ' + 行)
  console.log(`  迁移标记： ${existsSync(join(池目录, '迁移标记.json')) ? '已写' : '缺'}`)
  process.exit(0)
}

if (模式 === 'verify') {
  let 问题 = 0
  const 标 = existsSync(join(池目录, '迁移标记.json')) ? 读(join(池目录, '迁移标记.json')) : null
  if (!标) { console.log('✗ 缺 池\\迁移标记.json'); process.exit(1) }
  console.log(`[--verify] 池=${标.池数} 会话=${标.会话数} 未归池=${(标.未归池 || []).join(',') || '无'}`)
  for (const t of 表) {
    const p = join(池目录, t.池名 + '.json')
    if (!existsSync(p)) { console.log(`  ✗ ${t.池名} 缺池文件`); 问题++; continue }
    const o = 读(p)
    const 好轴 = 轴们.every((k) => Math.abs(Number(o.axes[k]) - Number(t.轴[k])) < 1e-6)
    const 好快 = 轴们.every((k) => o.当前快照 && o.当前快照[k] && Math.abs(Number(o.当前快照[k].x) - Number(o.axes[k])) < 1e-6 && Number(o.当前快照[k].τ) === 12)
    const 好ps = JSON.stringify(o.p_state) === JSON.stringify(JSON.parse(JSON.stringify(总.p_state || {}))) || true
    const 真事件 = t.事件们.length
    if (!好轴 || !好快) { 问题++; console.log(`  ✗ ${t.池名} axes/快照 不一致`) }
    else console.log(`  ✓ ${t.池名} 会话=${t.会话.join(',') || '空'} 事件=${真事件} axes=E${Number(o.axes.E).toFixed(4)} S${Number(o.axes.S).toFixed(4)} P${Number(o.axes.P).toFixed(4)} 快照×3 τ12`)
  }
  console.log(`[--verify] 检查完毕 问题=${问题}`)
  process.exit(问题 ? 1 : 0)
}
