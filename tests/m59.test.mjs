// 补丁4：底部不再压住最后一行；窄屏时间单行
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const 此 = join(fileURLToPath(import.meta.url), '..', '..')
const w = readFileSync(join(此, 'assets', 'widget.js'), 'utf8')

test('面板用 flex 三段：body 不写死 maxHeight，pages 滚动 + 8px 内边距', () => {
  assert.match(w, /\.ep-pages\{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding-bottom:8px\}/)
  assert.equal(/b\.style\.maxHeight = Math\.max/.test(w), false)
})

test('底栏在面板里正常占位（body 之后、panel 之内），不是绝对定位', () => {
  assert.match(w, /<\/div>\s*' \+\n\s*'  <div class="ep-foot">/)
  assert.equal(/\.ep-foot\{[^}]*position:absolute/.test(w), false)
  assert.match(w, /\.ep-foot span\{min-width:0\}/)
  assert.match(w, /\.ep-foot\{[^}]*flex-wrap:wrap/)
})

test('窄卡片时间只显示 HH:mm，并保留完整 title', () => {
  assert.match(w, /卡\.clientWidth < 340 \? 时\.slice\(11, 16\) : 时/)
  assert.match(w, /setAttribute\('title', 时\)/)
})