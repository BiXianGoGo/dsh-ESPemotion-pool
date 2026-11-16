// 卡片三处：收起 360 / 刷新 200ms / 两位小数+Δ
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const 此 = join(fileURLToPath(import.meta.url), '..', '..')
const w = readFileSync(join(此, 'assets', 'widget.js'), 'utf8')
const lib = readFileSync(join(此, 'lib', 'index.js'), 'utf8')

test('收起态固定 360，展开回记忆宽，右边缘不动', () => {
  assert.match(w, /收起宽 = 360/)
  assert.match(w, /卡\.style\.width = \(收起 \? 收起宽 : 展开宽\) \+ 'px'/)
  assert.match(w, /var 右 = 卡\.getBoundingClientRect\(\)\.right/)
  assert.match(w, /夹位置\(右 - 宽, 上/)
  assert.match(w, /存位置\(位, 展开宽, 记忆高\)/)
})

test('位置键记展开宽而不是收起宽', () => {
  assert.match(w, /宽: c\.宽, 高: c\.高, 收起: 收起/)
  assert.match(w, /var c = 夹尺寸\(w \|\| 展开宽, h\)/)
})

test('刷新与波形统一 200ms 输入延迟，拖动/切页/缩放/展开立即刷', () => {
  assert.match(w, /刷钟 = setTimeout\(function \(\) \{ 刷钟 = null; 立即刷\(\) \}, 200\)/)
  assert.match(w, /function 立即刷\(\)/)
  assert.match(w, /if \(刷钟\) \{ clearTimeout\(刷钟\); 刷钟 = null; 立即刷\(\) \}/) // 换页
  assert.match(w, /轨迹钟 = setTimeout\(function \(\) \{ 轨迹钟 = null; 画轨迹\(最新\) \}, 200\)/)
})

test('动画默认值 800/1200 落在 lib 常量', () => {
  assert.match(lib, /动画时长: 800/)
  assert.match(lib, /蓝收缩时长: 1200/)
})

test('轴数字两位小数 + Δ 箭头 + title 用前端上次显示值', () => {
  assert.match(w, /var 显文 = \(v >= 0 \? '\+' : '−'\)/)
  assert.match(w, /Math\.abs\(v\)\.toFixed\(小\)/)
  assert.match(w, /var 上显 = 上次显\[k\]/)
  assert.match(w, /Math\.abs\(增\) >= 阈/)
  assert.match(w, /↑' : '↓/)
  assert.match(w, /当前 ' \+ 显文 \+ \(上显 == null \? '' : ' ｜ 上一轮/)
})