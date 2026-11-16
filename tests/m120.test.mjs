process.env.EP_LEGACY_INJECT = '1'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const 模 = await import('../lib/index.js')

test('设置清单：0.2.3 六新键在位且范围正确', () => {
  const 表 = 模.设置清单()
  const 取 = (k) => 表.find((x) => x.键 === k)
  for (const [k, d, r] of [['不应期小时', 6, [1, 72]], ['敏感增益系数', 0.4, [0.1, 1]], ['渴求阈值天', 3, [1, 14]], ['命名强制小时', 6, [1, 48]], ['曲线注入开关', true, null], ['同句不重复分钟', 30, [1, 240]]]) {
    const x = 取(k)
    assert.ok(x, k)
    assert.equal(x.默认, d, k)
    assert.deepEqual(x.范围, r, k)
  }
})

test('设置页：七组 + 说明书待补 + 组选会话复选', () => {
  const w = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')
  for (const g of ['数据源', '判定与阈值', '双轨与接管', '敏感与上瘾', '通知', '界面', '高级', '说明书']) assert.ok(w.includes("['" + g + "'"), g)
  assert.ok(w.includes('（只读，路径在「界面」组改）'))
  assert.ok(w.includes('data-psel'))
  assert.ok(w.includes('data-pname'))
  assert.ok(w.includes('data-pname'))
  assert.ok(w.includes('池→会话是唯一真相'))
})

test('设置页：第 5 页索引是 4，点设置会载入配置', () => {
  const w = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')
  assert.ok(w.includes('if (页 === 4) 载设置()'))
  assert.ok(!w.includes('if (页 === 3) 载设置()'))
})

test('设置页：打点模型灰字只读，旧下拉已删', () => {
  const w = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')
  assert.ok(w.includes('（只读）'))
  assert.ok(w.includes('ep-gray'))
  assert.ok(!w.includes('select[data-ses]'))
})
