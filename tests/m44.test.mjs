import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const 这里 = dirname(fileURLToPath(import.meta.url))
const 源 = readFileSync(join(这里, '..', 'assets', 'widget.js'), 'utf8')

function 取观测行() {
  const 元素 = () => ({
    style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false } },
    appendChild() {}, insertAdjacentHTML() {}, addEventListener() {}, setAttribute() {},
    querySelector() { return null }, querySelectorAll() { return [] }, getBoundingClientRect() { return { left: 0, top: 0, bottom: 0, right: 0 } }
  })
  const document = {
    body: null,
    addEventListener() {},
    getElementById() { return null },
    createElement: 元素,
    querySelector() { return null },
    querySelectorAll() { return [] }
  }
  const window = {
    innerWidth: 760, innerHeight: 900,
    addEventListener() {},
    localStorage: { getItem() { return null }, setItem() {} },
    EventSource: function () { this.onmessage = null }
  }
  const f = new Function('window', 'document', 源 + '\nreturn window.__ep观测行')
  return f(window, document)
}

test('观测行：第 2 页三组（波动/轨迹/双轨）按 0.2 口径', () => {
  const 观测行 = 取观测行()
  const s = {
    注入: { 吸附系数: 0.4, 本轮是否推轴: true },
    上次推轴: { 前: { E: 0.2, S: 0.1, P: 0 }, 后: { E: 0.3, S: 0.2, P: 0 } },
    轨迹: { 最近: { 段数: 4, 秒: 6.2, 波动: [{ E: 0.1, S: 0.2, P: 0 }] } },
    组: [{ 点来源: '轨迹', 点: [{ E: 1 }] }],
    双轨: {
      最近: {
        采用: '中点', 曲线: { 对齐: 0.8, 偏移: 0.12 },
        裁决度: { 我: 1, 它: 0.9 },
        认知度: { 合成: 0.767, 我: 0.763 }
      }
    }
  }
  const 出 = 观测行(s, {})
  assert.match(出.对比, /波动/)
  assert.match(出.对比, /轨迹/)
  assert.match(出.对比, /双轨/)
  assert.match(出.对比, /吸附系数 k/)
  assert.match(出.对比, /推前 → 推后/)
  assert.match(出.对比, /段数/)
  assert.match(出.对比, /点来源/)
  assert.match(出.对比, /裁决 K/)
  assert.match(出.对比, /转折对齐率/)
  assert.match(出.对比, /平均偏移/)
  assert.equal(出.写入, '')
})

test('观测行：双轨缺失时给兜底文案，不返回空', () => {
  const 观测行 = 取观测行()
  const 出 = 观测行({ 事件明细: [], 坐标向量: {} }, {})
  assert.match(出.对比, /波动/)
  assert.match(出.对比, /没推/)
  assert.notEqual(出.对比.trim(), '')
})