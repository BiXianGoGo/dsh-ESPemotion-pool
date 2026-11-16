import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const 后端 = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
const 前端 = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')

test('v0.25d：推轴时累加会话推轴次数', () => {
  assert.ok(后端.includes('池.推轴次数[短] = (Number(池.推轴次数[短]) || 0) + 1'))
})

// 2026-11-16 卡片前端第 1 项改了语义：没推过但真有数（组快照/池 axes/事件累计）→ 实心显示真值 +
// 「未推」小字；只有完全没数据才画虚线。原有「不许拿轨迹末点覆盖轴值」的意图保留，断言照这个改。
test('v0.25d：组轴来源区分快照/未推；未推但有数仍实心，只有无数据才虚线', () => {
  assert.ok(后端.includes("if (!未推) return { ...x, 轴来源: '快照' }"))
  assert.ok(后端.includes("if (有数) return { ...x, 轴来源: '快照', 未推: true, 未推来源: 组来源(x.名) }"))
  assert.ok(后端.includes("return { ...x, 轴来源: '未推' }"))
  assert.ok(!后端.includes('轴: 末 ? { E: 标值(配置, 末.E)'))
})

test('v0.25d：卡片标题有「未推」标记、条灰虚线、数字带点', () => {
  assert.ok(前端.includes('<em class="ep-gunp">·未推</em>'))
  assert.ok(前端.includes('.ep-gcard-fill.unpushed'))
  assert.ok(前端.includes("(g.轴来源 === '未推' ? '·' : '')"))
})

test('v0.25d：未推组数字仍按刻度换算（组表轴统一走标值）', () => {
  assert.ok(后端.includes("轴: Object.fromEntries(轴们.map((k) => [k, 标值(配置, Number(v.轴[k].toFixed(4)))]))"))
})
