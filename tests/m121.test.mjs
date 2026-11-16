import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { 切分段 } from '../lib/index.js'

const 前端 = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')
const 后端 = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')

test('第四页标题：页内标题与标题数组都叫「情绪待命名确认页」', () => {
  assert.ok(前端.includes('<div class="ep-pagetitle">情绪待命名确认页</div>'))
  assert.ok(前端.includes("'情绪待命名确认页', '设置'"))
})

test('分段最长段数：默认 6，配置键在清单里', () => {
  assert.ok(后端.includes('分段最长段数: 6'))
  assert.ok(后端.includes("键: '分段最长段数'"))
  assert.ok(后端.includes('范围: [2, 20]'))
})

test('切分段：超过上限时尾部并成最后一段，起止仍连续', () => {
  const 点s = Array.from({ length: 10 }, (_, i) => ({ E: i / 100, S: 0, P: 0 }))
  const 给定 = Array.from({ length: 10 }, (_, i) => ({ 起: i + 1, 止: i + 1, 名: '', 依据: '' }))
  const 三 = 切分段(点s, 给定, { 分段最长段数: 3 })
  assert.equal(三.length, 3)
  assert.equal(三[0].起, 1); assert.equal(三[0].止, 1)
  assert.equal(三[1].起, 2); assert.equal(三[1].止, 2)
  assert.equal(三[2].起, 3); assert.equal(三[2].止, 10)
  const 六 = 切分段(点s, 给定, {})
  assert.equal(六.length, 6)
  assert.equal(六[5].止, 10)
})
