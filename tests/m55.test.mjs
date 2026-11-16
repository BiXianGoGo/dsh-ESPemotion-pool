// 补丁2：收起成一条 + 高度每次重算
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const 此 = join(fileURLToPath(import.meta.url), '..', '..')
const 挂饰 = readFileSync(join(此, 'assets', 'widget.js'), 'utf8')

test('收起高度按实测头高，不写死像素', () => {
  assert.match(挂饰, /function 头高\(\) \{ var h = 卡 && 卡\.querySelector\('\.ep-head'\); return h \? h\.offsetHeight : 0 \}/)
  assert.match(挂饰, /卡\.style\.height = \(收起 \? 头高\(\) : 记忆高\) \+ 'px'/)
})

test('展开高度由 flex 占位决定；内容区不写死 height，maxHeight 按面板−底栏算', () => {
  assert.match(挂饰, /\.ep-pages\{flex:1 1 auto;min-height:0;overflow-y:auto/)
  assert.equal(/b\.style\.maxHeight = Math\.max/.test(挂饰), false)
  assert.equal(/b\.style\.height\s*=/.test(挂饰), false)
})

test('收起状态持久化在位置键里，重载后恢复', () => {
  assert.match(挂饰, /收起: 收起 \}\)\)/)
  assert.match(挂饰, /收起 = !!\(存 && 存\.收起\)/)
})

test('收起时抓手/底部/页码点/内容都隐藏，只有一行头', () => {
  assert.match(挂饰, /\.ep-card\.收起 \.ep-body,\.ep-card\.收起 \.ep-foot,\.ep-card\.收起 \.ep-dots,\.ep-card\.收起 \.ep-grip\{display:none\}/)
  assert.match(挂饰, /\.ep-card\.收起 \.ep-head\{display:flex;align-items:center/)
})

test('拖拽缩放期间不触发收起，点头部才切换', () => {
  assert.match(挂饰, /else if \(!缩\) \{\s*切换收起\(!收起\)/)
})