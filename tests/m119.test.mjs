import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const 前端 = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')

test('观测页：两会话页签 + 四组折叠 + 折叠记忆', () => {
  assert.ok(前端.includes("function 观名(k)"))
  assert.ok(前端.includes('data-obs="'))
  assert.ok(前端.includes("观组('本轮判定'"))
  assert.ok(前端.includes("观组('双轨与接管'"))
  assert.ok(前端.includes("观组('敏感与上瘾'"))
  assert.ok(前端.includes("观组('注入与曲线'"))
  assert.ok(前端.includes("localStorage.getItem('ep-obs-fold')"))
  assert.ok(前端.includes("localStorage.setItem('ep-obs-fold'"))
})

test('观测页：单位 / — / 现算 / 旧轮无，且删掉旧名', () => {
  assert.ok(前端.includes("' px/s'"))
  assert.ok(前端.includes("'（旧轮无）'"))
  assert.ok(前端.includes("（现算）"))
  assert.ok(前端.includes("' 天'"))
  assert.ok(!前端.includes('Δ_实'))
  assert.ok(!前端.includes('封顶'))
})

test('观测页：tooltip 不删，新参数也带 data-tip', () => {
  assert.ok(前端.includes('data-tip="'))
  assert.ok(前端.includes('该会话最新一条打点'))
  assert.ok(前端.includes('按 1+0.4(s−a) 现算'))
})

