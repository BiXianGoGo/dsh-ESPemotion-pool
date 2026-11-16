import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const 此 = dirname(fileURLToPath(import.meta.url))
const 根 = join(此, '..')
const 挂饰 = readFileSync(join(根, 'assets', 'widget.js'), 'utf8')
const 源 = readFileSync(join(根, 'lib', 'index.js'), 'utf8')

test('挂饰：作废 / 已归并不再给入口', () => {
  assert.doesNotMatch(挂饰, /显示作废/)
  assert.doesNotMatch(挂饰, /显示已归并/)
  assert.doesNotMatch(挂饰, /含作废=/)
  assert.doesNotMatch(挂饰, /含并入=/)
})

test('挂饰：三轴用 坐标向量 显示「值 + 溢出」', () => {
  assert.match(挂饰, /坐标向量/)
  assert.match(挂饰, /溢出/)
  assert.match(挂饰, /ep-of/)
})

test('挂饰：第 2 页显示双轨认知度、缺q、分身额度', () => {
  assert.match(挂饰, /双轨/)
  assert.match(挂饰, /认知度/)
  assert.match(挂饰, /吸附系数/)
  assert.match(挂饰, /推前 → 推后/)
})

test('挂饰：长列表默认折叠，可展开', () => {
  assert.match(挂饰, /ep-list/)
  assert.match(挂饰, /full/)
  assert.match(挂饰, /展开/)
  assert.match(挂饰, /收起/)
})

test('注入的 script 标签带构建版本号 ?v=', () => {
  assert.match(源, /widget\.js\?v=/)
  assert.match(源, /界面版本/)
})

test('挂饰没有外链（不引 http(s):// 资源）', () => {
  assert.doesNotMatch(挂饰, /https?:\/\//)
})