// 补丁3：拉伸后内容跟着变宽
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const 此 = join(fileURLToPath(import.meta.url), '..', '..')
const 挂饰 = readFileSync(join(此, 'assets', 'widget.js'), 'utf8')

test('轨迹按容器实测宽度重画，不再写死 322', () => {
  assert.match(挂饰, /var 量 = 盒\.clientWidth \|\| 0\n    if \(!量\) return\n    var W = Math\.max\(220, Math\.round\(量\)\)/)
  assert.equal(/var W = 322/.test(挂饰), false)
  assert.match(挂饰, /preserveAspectRatio="none"/)
})

test('拖动 200ms 防抖，拖完/resize/展开立即重画', () => {
  assert.match(挂饰, /轨迹钟 = setTimeout\(function \(\) \{ 轨迹钟 = null; 画轨迹\(最新\) \}, 200\)/)
  assert.match(挂饰, /function 立即重画轨迹\(\)/)
  assert.match(挂饰, /立即重画轨迹\(\)\n        立即刷\(\)\n      \}\)/) // 抓 pointerup
  assert.match(挂饰, /立即重画轨迹\(\)\n        立即刷\(\)\n        存位置\(位, 展开宽, 记忆高\)/) // resize
})

test('收起时清掉重画定时器，展开立即重画', () => {
  assert.match(挂饰, /if \(收起\) \{ if \(轨迹钟\) \{ clearTimeout\(轨迹钟\); 轨迹钟 = null \} \} else \{ 测开始\('打开'\); 立即重画轨迹\(\); 立即刷\(\) \}/)
})

test('数值列与首列不再写死，空态撑满', () => {
  assert.match(挂饰, /\.ep-v\{flex:none;min-width:92px/)
  assert.match(挂饰, /\.ep-obs \.obr\{display:flex/)
  assert.match(挂饰, /\.ep-srow\{display:grid;grid-template-columns:minmax\(56px,76px\) 1fr 78px/)
  assert.match(挂饰, /\.ep-card\.empty \.ep-panel\{width:100%\}/)
})