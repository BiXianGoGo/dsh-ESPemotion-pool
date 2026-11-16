import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const 前端 = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')
const 后端 = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')

test('v0.25：组卡里只留一个图例（内层 ep-legend 隐藏）', () => {
  assert.ok(前端.includes('.ep-gcard .ep-legend{display:none}'))
  assert.ok(前端.includes('class="ep-glegend"'))
})

test('v0.25：组轨迹按组内会话各自取最新文件，用于说明行轮次/秒数', () => {
  // 2026-11-15：轨迹表改成按文件 mtime 增量的 取轨迹表()（原来每次 /state 全量读 1600+ 文件要 ~900ms）
  assert.ok(后端.includes('function 取轨迹表()'))
  assert.ok(后端.includes('const 组轨迹表 = 取轨迹表()'))
  assert.ok(后端.includes('for (const f of (组轨迹表.get(s2) || []))'))
  assert.ok(后端.includes('轨迹: 最 ? { 轮: 最.轮, 段: 最.段, 秒: 最.秒 } : null'))
  assert.ok(!后端.includes('最近轨迹.sid'))
})

test('v0.25：说明行用 tr.轮 / tr.秒，不用 — 占位', () => {
  assert.ok(前端.includes("(tr.轮 != null ? tr.轮 : '—')"))
  assert.ok(前端.includes("(tr.秒 != null ? tr.秒 : '—')"))
})
