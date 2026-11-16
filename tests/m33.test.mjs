// v0.5.2：空态只显示一行，不各区块重复占位
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const 此 = dirname(fileURLToPath(import.meta.url))
const 挂饰 = readFileSync(join(此, '..', 'assets', 'widget.js'), 'utf8')

test('空态只有一行「暂无记录」并带原因', () => {
  const 行 = 挂饰.match(/暂无记录/g) || []
  assert.equal(行.length, 1) // 只有空态那一行
  assert.match(挂饰, /池子是空的：还没开始记录，或刚清空过/)
  assert.match(挂饰, /ep-empty/)
})

test('空态不显示第 2、3 页（观测与列表都不出现）', () => {
  assert.match(挂饰, /\.ep-page\[data-page="1"\], \.ep-page\[data-page="2"\]/)
  assert.match(挂饰, /if \(空\) 换页\(0\)/)
})

test('空态保留刷新、三轴与 rev', () => {
  assert.match(挂饰, /classList\.toggle\('empty'/)
  assert.match(挂饰, /ep-refresh/)
  assert.match(挂饰, /'rev ' \+ s\.rev/)
  assert.match(挂饰, /\.ep-page\[data-page="1"\], \.ep-page\[data-page="2"\]/)
})