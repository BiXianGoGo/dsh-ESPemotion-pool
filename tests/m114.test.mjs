// 命名提醒「一致」按情绪组判（2026-11-15）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-组一致-'))
process.env.EMOTION_POOL_DIR = 目录
const M = await import('../lib/index.js')
const 配 = { 启用: true, 写入者: ['aaaaaaaa'], 装载会话: ['aaaaaaaa'], 刻度: 100, 一致阈值: 0.15, 日志: ['情绪池-日志.md', '情绪池-日志.jsonl'] }
const 存 = () => {
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify({ rev: 0, axes: { E: 0, S: 0, P: 0 }, spine: { S: 0 }, events: [], stats: {} }))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify(配))
  for (const f of ['情绪池-注入.json', '情绪池-命名.json']) { const p = join(目录, f); if (existsSync(p)) rmSync(p) }
}

test('组平均 ≤15 点：命中', () => {
  存()
  const 组 = M.切分段([{ E: 0 }, { E: 0.2 }], [{ 起: 1, 止: 2, 名: '' }])
  // 2026-11-16 C：段点已是 ±1 制，它点 ÷9 后同尺（不再 ×0.05）。
  // 组增量平均 0.2；分身 2 点 ÷9 ≈ 0.222，差 0.022 ≤ 0.15
  assert.equal(M.命名提醒记账('aaaaaaaa', 1, 组, {}, 配, { E: 2, S: 0, P: 0 }), 1)
})

test('组平均 >15 点：不命中', () => {
  存()
  const 组 = M.切分段([{ E: 0 }, { E: 0.2 }], [{ 起: 1, 止: 2, 名: '' }])
  // 分身 8 点 ÷9 ≈ 0.889，与 0.2 差 0.689 > 0.15
  assert.equal(M.命名提醒记账('aaaaaaaa', 2, 组, {}, 配, { E: 8, S: 0, P: 0 }), 0)
})