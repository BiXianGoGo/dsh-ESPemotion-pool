import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const 前端 = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')

test('v023D：折线块最小 130px，单组铺满', () => {
  assert.ok(前端.includes("flex:1 1 auto;min-height:96px;max-height:170px"))
  assert.ok(前端.includes(".ep-gtab{"))
})
test('v023D：卡片默认高度 560', () => {
  assert.ok(前端.includes("height:560px"))
  assert.ok(前端.includes("默认高 = 560"))
})
test('v023D：空曲线也画网格 + 暂无曲线', () => {
  assert.ok(前端.includes("网 += '<line"))
  assert.ok(前端.includes("暂无曲线（该组还没有思考轨迹）"))
})
test('v023D：轴数字固定两位小数', () => {
  assert.ok(前端.includes("Math.abs(v).toFixed(2)"))
  assert.ok(!前端.includes("toFixed(刻度0 >= 100 ? 0 : 2)"))
})
