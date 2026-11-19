import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { 原型样本 } from '../lib/index.js'

const 后端 = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
const 前端 = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')

const 点 = (v) => ({ θ: [], 折数: 0, g: [], 路径: 0, 点: v })

test('名字库：取点最多的原型（并列取靠前）', () => {
  const 少 = { E: 点([0, 0.1, 0.2]), S: 点([0, 0.1, 0.2]), P: 点([0, 0.1, 0.2]) }
  const 多 = { E: 点([0, 0.1, 0.2, 0.3, 0.4]), S: 点([0, 0.1, 0.2, 0.3, 0.4]), P: 点([0, 0.1, 0.2, 0.3, 0.4]) }
  const a = 原型样本([少, 多])
  assert.equal(a.length, 5)
  const b = 原型样本([多, 少])
  assert.equal(b.length, 5)
  // 并列时取靠前的那条（值不同以便区分）
  const 甲 = { E: 点([1, 1]), S: 点([1, 1]), P: 点([1, 1]) }
  const 乙 = { E: 点([-1, -1]), S: 点([-1, -1]), P: 点([-1, -1]) }
  assert.deepEqual(原型样本([甲, 乙]), [{ E: 1, S: 1, P: 1 }, { E: 1, S: 1, P: 1 }])
})

test('名字库：三轴按最短对齐，不补假点；兼容 {点} 与纯数组', () => {
  const p = {
    E: 点([0, 0.1, 0.2, 0.3]),
    S: [0.5, 0.6],
    P: 点([-0.1, -0.2, -0.3]),
  }
  const 样 = 原型样本([p])
  assert.equal(样.length, 2)
  assert.deepEqual(样, [{ E: 0, S: 0.5, P: -0.1 }, { E: 0.1, S: 0.6, P: -0.2 }])
})

test('名字库：空原型/短原型返回空样本', () => {
  assert.deepEqual(原型样本([]), [])
  assert.deepEqual(原型样本(null), [])
  assert.deepEqual(原型样本([{ E: 点([0]), S: 点([0]), P: 点([0]) }]), [])
  assert.deepEqual(原型样本([{ E: 点([]), S: 点([]), P: 点([]) }]), [])
})

test('/tpl 条目带 有原型/原型数/样本 三个只读字段', () => {
  assert.ok(后端.includes('有原型: 原.length > 0'))
  assert.ok(后端.includes('原型数: 原.length'))
  assert.ok(后端.includes('样本: 原型样本(原)'))
})

test('前端：名字库折叠标题、两列卡片、旧条折叠、标题带新/旧计数', () => {
  assert.ok(前端.includes('id="tplfold">名字库'))
  assert.ok(前端.includes('.ep-ncards{display:grid;grid-template-columns:1fr 1fr'))
  assert.ok(前端.includes('旧条目 '))
  assert.ok(前端.includes("（新 ' + 新条.length + ' · 旧 ' + 旧条.length"))
  assert.ok(前端.includes('无样本'))
  assert.ok(前端.includes('data-rn='))
})
