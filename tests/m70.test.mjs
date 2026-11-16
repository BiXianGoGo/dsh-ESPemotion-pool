import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const 前端 = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')

test('v023E：第一页有小页签，默认用 localStorage 组页，切页签只重画组', () => {
  assert.ok(前端.includes("ep-gtabs"))
  assert.ok(前端.includes("data-gtab="))
  assert.ok(前端.includes("localStorage.setItem('组页'"))
  assert.ok(前端.includes("当前组 = n"))
  assert.ok(前端.includes("if (最近组状态) 画组(最近组状态)"))
})
test('v023E：只渲染当前一组，波动最多 3 行，空曲线仍画网格', () => {
  assert.ok(前端.includes("for (var gi = 选; gi < 选 + 1; gi++)"))
  assert.ok(前端.includes("g.波动.slice(0, 3)"))
  assert.ok(前端.includes("暂无曲线（该组还没有思考轨迹）</text></svg>"))
})
