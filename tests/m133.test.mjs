import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { 说明书全文 } from '../lib/index.js'

function 假池() {
  const events = []
  for (let i = 0; i < 3; i++) events.push({ t: '2026-11-16T10:0' + i + ':00+08:00', type: '推轴', note: '推轴 ' + i, E: 0.1 * i, S: -0.05 * i, P: 0.02 })
  return { rev: 3, events, axes: { E: 0.2, S: -0.1, P: 0.05 }, spine: { S: 0 }, 上轮波动: { sid: null } }
}

test('说明书：版本头、9 节、目录行号与正文行号一致、每节 ≤25 行', () => {
  const 文 = 说明书全文(假池(), {})
  const 行 = 文.split('\n')
  assert.ok(行[0].startsWith('<!-- 版本 0.2.5'))
  const 头们 = []
  行.forEach((x, i) => { if (/^## \d+\. /.test(x)) 头们.push({ i, 题: x }) })
  assert.equal(头们.length, 10)
  assert.ok(头们[0].题.startsWith('## 0. 目录'))
  for (let k = 0; k < 头们.length - 1; k++) {
    const 长 = 头们[k + 1].i - 头们[k].i - 1 // 不含下一节标题，空行已在内
    assert.ok(长 <= 25, 头们[k].题 + ' 行数 ' + 长)
  }
  // 目录里写的起止行号，要与真实标题行号对上
  for (let n = 1; n <= 9; n++) {
    const 目录行 = 行.find((x) => x.startsWith(n + ' · '))
    assert.ok(目录行, '目录缺第 ' + n + ' 节')
    const m = /(\d+)–(\d+)$/.exec(目录行)
    assert.ok(m, 目录行)
    const 起 = Number(m[1])
    assert.ok(/^## /.test(行[起 - 1]), '第 ' + n + ' 节起行不是标题：' + 行[起 - 1])
  }
  const 第9 = 头们[9].i
  const 尾 = 行.slice(第9).join('\n')
  assert.ok(尾.includes('三轴现值'))
  assert.ok(尾.includes('最近 20 个推轴点'))
  assert.ok(尾.includes('最近 5 条事件'))
  assert.ok(尾.includes('推轴 2'))
})

test('写池两个分支都重写说明书（不许 60 秒合并）', () => {
  const src = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
  const 次数 = (src.match(/写说明书\(池\)/g) || []).length
  assert.ok(次数 >= 3, '写池两处 + 定义一处，实际 ' + 次数)
  assert.ok(!src.includes('60 * 1000') || src.includes('写说明书(池)'))
})
