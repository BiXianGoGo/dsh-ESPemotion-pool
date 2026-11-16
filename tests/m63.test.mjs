import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const 此 = dirname(fileURLToPath(import.meta.url))
const 挂饰 = readFileSync(join(此, '..', 'assets', 'widget.js'), 'utf8')
const 后端 = readFileSync(join(此, '..', 'lib', 'index.js'), 'utf8')

test('收起宽度自适应：168–300，先 auto 量再夹', () => {
  assert.match(挂饰, /卡\.style\.width = 'auto'/)
  assert.match(挂饰, /收起宽 = Math\.max\(168, Math\.min\(300, 自\)\)/)
  assert.match(挂饰, /收起宽 = Math\.max\(168, Math\.min\(300, 自0\)\)/)
  assert.match(挂饰, /document\.fonts\.ready/)
})

test('收起时贴右边缘：right - 宽', () => {
  assert.match(挂饰, /夹位置\(右 - 宽, 上/)
})

test('Y 轴：普通范围画 ±1 刻度，极差 <0.2 改实际范围并标范围', () => {
  assert.match(挂饰, /var 小 = \(mx - mn\) < 0\.2/)
  assert.match(挂饰, /var lo = 小 \? Math\.max\(-1, mn - 0\.1\) : -1/)
  assert.match(挂饰, />范围 ' \+ 一位\(lo\)/)
  assert.match(挂饰, /font-size="8" fill="#7d869c">' \+ 一位\(v\)/)
})

test('悬停：18px 命中、命中不到不弹、其余线 30%', () => {
  assert.match(挂饰, /if \(!最 \|\| 距 > 18\)/)
  assert.match(挂饰, /p\.getAttribute\('data-line'\) === 最\.k \? '1' : '0\.3'/)
  assert.match(挂饰, /'<b>' \+ 最\.k \+ '<\/b> · ' \+ 两位\(最\.v\)/)
})

test('图例可点：点 E/S/P 只看那根，全部关掉时恢复', () => {
  assert.match(挂饰, /看图\[k\] = !看图\[k\]/)
  assert.match(挂饰, /if \(!看图\.E && !看图\.S && !看图\.P\) 看图\[k\] = true/)
})

test('三轴数字下移：条下一行、方向标签 + 右对齐数值', () => {
  assert.match(挂饰, /<div class="ep-sub" data-sub="' \+ k \+ '">/)
  assert.match(挂饰, /dir\.textContent = '← ' \+ k \+ '− ' \+ 负/)
  assert.match(挂饰, /num\.innerHTML = 显文 \+ 增文 \+ 溢文2/)
  assert.equal(/<span class="ep-v"><\/span>/.test(挂饰), false)
})

test('刻度默认 100：默认配置与设置键表两处', () => {
  assert.match(后端, /刻度: 100,/)
  assert.match(后端, /说明: '数值显示倍率（100 即 0–100 口径）'/)
  assert.match(后端, /默认: 100, 范围: \[1, 100\]/)
})

test('Δ 阈值随刻度：100 口径下 1 分才显示箭头', () => {
  assert.match(挂饰, /var 阈 = 刻度 >= 100 \? 1 : 0\.01/)
  assert.match(挂饰, /Math\.abs\(增\) >= 阈/)
})