// 补收尾：默认值一致 + 底部不再压行
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const 此 = join(fileURLToPath(import.meta.url), '..', '..')
const lib = readFileSync(join(此, 'lib', 'index.js'), 'utf8')
const w = readFileSync(join(此, 'assets', 'widget.js'), 'utf8')

test('设置键表默认值与 lib 默认常量一致（800/1200），无 420/600 残留', () => {
  assert.match(lib, /默认: 800, 范围: \[0, 2000\], 整数: true/)
  assert.match(lib, /默认: 1200, 范围: \[0, 2000\], 整数: true/)
  assert.equal(/默认: 420/.test(lib), false)
  assert.equal(/默认: 600/.test(lib), false)
})

test('面板滚动：flex 三段，body 不写 maxHeight，pages 留 8px 底部内边距', () => {
  assert.equal(/b\.style\.maxHeight = Math\.max/.test(w), false)
  assert.match(w, /\.ep-pages\{[^}]*padding-bottom:8px/)
  assert.match(w, /\.ep-card\.open \.ep-panel\{display:flex;overflow:hidden\}/)
})

test('底栏在面板内正常流，不绝对定位', () => {
  assert.equal(/\.ep-foot\{[^}]*position:absolute/.test(w), false)
  assert.match(w, /<div class="ep-foot">/)
})
