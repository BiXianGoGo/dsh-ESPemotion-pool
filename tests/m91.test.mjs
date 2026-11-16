import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as 模 from '../lib/index.js'
import * as v06 from '../lib/v06.js'

const 后端 = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
const 今 = new Date().toISOString().slice(0, 10)

function 池(六头数) {
  return {
    组零点: { '常用聊天组': { E: 0, S: 0, P: 0 } },
    组六头: { '常用聊天组': 六头数 },
    spine: { E: 0, S: 0, P: 0 }, 零点: { E: 0, S: 0, P: 0 },
  }
}

test('零点回归：六头达条件且结非零时，生产分支应用零点 +0.01', () => {
  const p = 池({ 'E+': { 累计: 6, 桶: [{ d: 今, n: 6 }] } })
  const 子 = 模.组份(p, '常用聊天组')
  const 结 = { E: 0.5, S: 0, P: 0 }
  const 出 = v06.判零点(子, { 单次偏移: 0.01, 冷却: 6, 阈值倍数: 1.5, 封顶: 0.2 }, 结, 'E')
  assert.deepEqual(Object.keys(出), ['E'])
  v06.应用零点(子, 出)
  assert.equal(Number(p.组零点['常用聊天组'].E.toFixed(4)), 0.01)
})

test('零点回归反例：结为 0 时封顶为 0，零点不动', () => {
  const p = 池({ 'E+': { 累计: 6, 桶: [{ d: 今, n: 6 }] } })
  const 子 = 模.组份(p, '常用聊天组')
  const 出 = v06.判零点(子, { 单次偏移: 0.01 }, { E: 0, S: 0, P: 0 }, 'E')
  assert.deepEqual(出, {})
  v06.应用零点(子, 出)
  assert.equal(p.组零点['常用聊天组'].E, 0)
})

test('零点回归：推轴里带 应用零点（轨迹与兜底共用）', () => {
  assert.ok(后端.includes('const 组名 = 组归名(sid, 配)'))
  assert.ok(后端.includes('应用零点(子, 判零点(子, 配, 结, 最高, now), now)'))
  const 位 = 后端.indexOf('export function 推轴')
  const 尾 = 后端.indexOf('// 2026-11-09 03:55', 位)
  assert.ok(位 > 0 && 尾 > 位)
  assert.ok(后端.slice(位, 尾).includes('应用零点(子, 判零点('))
})
