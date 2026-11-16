import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const 前端 = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')

test('v025：Y 轴自适应（min/max + 10% + 最小跨度 0.2 + 取整 0.1）', () => {
  assert.ok(前端.includes('var 范围 = (function () {'))
  assert.ok(前端.includes('var 低0 = Math.min(0, lo), 高0 = Math.max(0, hi)'))
  // 2026-11-15 21:4x：改为上下对称取整（±极值），保证五条线等距、标签由 y 反推
  assert.ok(前端.includes('极 = Math.ceil(极 * 10) / 10'))
  assert.ok(前端.includes('return { lo: -极, hi: 极 }'))
  assert.ok(前端.includes('组图[gi] = { W: 可用宽, H: H, lo: 低, hi: 高, n: 点s.length'))
})
test('v025：刻度和位换算都按 lo/hi，不写死 ±1', () => {
  assert.ok(前端.includes('var tv = 去重[tk0]'))
  assert.ok(前端.includes('(高N - Math.max(低N, Math.min(高N, Number(v) || 0))) / (高N - 低N)'))
  assert.ok(!前端.includes('(hi - v) / (hi - lo) * (高 - 8) + 4'))
})
test('v025：空组画网格 + 居中「暂无曲线（该组还没有思考轨迹）」', () => {
  assert.ok(前端.includes('暂无曲线（该组还没有思考轨迹）'))
  assert.ok(前端.includes('text-anchor="middle"'))
})
test('v025：字号与标题分隔线', () => {
  assert.ok(前端.includes('font-size:14px;font-weight:700;color:#e7e9f0;margin-bottom:4px;padding-bottom:4px;border-bottom:1px solid #262c3a'))
  assert.ok(前端.includes('.ep-gcard-k{flex:none;width:14px;color:#c9d0e2;font-weight:700;font-size:12px}'))
  assert.ok(前端.includes('.ep-gticks{position:absolute;left:2px;top:0;bottom:0;width:30px;pointer-events:none;font-size:10px'))
})
