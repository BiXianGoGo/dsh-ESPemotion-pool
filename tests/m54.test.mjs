// 0.2 补丁：轨迹并入第一页、固定尺寸、可拖拽缩放
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const 此 = join(fileURLToPath(import.meta.url), '..', '..')
const 挂饰 = readFileSync(join(此, 'assets', 'widget.js'), 'utf8')
const 目录 = mkdtempSync(join(tmpdir(), 'v020b-'))
process.env.EMOTION_POOL_DIR = 目录
const 模 = await import('../lib/index.js')

test('页结构：5 个页码点（含待确认），标题也按 5 页排', () => {
  assert.ok(挂饰.includes('<i data-page="4"></i>'), '第 5 个页码点')
  assert.match(挂饰, /\[.三轴., .本轮观测., .事件., .情绪待命名确认页., .设置.\]\[页\]/)
})

test('默认页：范围 [0,4]，5 被设置接口拒绝，4 通过', () => {
  const 键 = 模.设置清单().find((x) => x.键 === '默认页')
  assert.deepEqual(键.范围, [0, 4])
  assert.ok(模.校验设置('默认页', 5).错误)
  assert.equal(模.校验设置('默认页', 4).值, 4)
  assert.equal(模.校验设置('默认页', 0).值, 0)
})

test('旧 localStorage 页:4 读出来夹到 4，不主动写回', () => {
  assert.match(挂饰, /Math\.min\(4, Math\.max\(0, Number\(快\.页\) \|\| 0\)\)/)
  assert.equal(/localStorage\.setItem\('ep-page-manual', '1'\);\s*\/\/ 夹/.test(挂饰), false)
})

test('尺寸读写：默认 360×560，最小 280×320、最大 720×900，坏值回默认', () => {
  const 段 = 挂饰.match(/var 默认宽[\s\S]*?\n  function 夹尺寸\(w, h\) \{[\s\S]*?\n  \}/)
  assert.ok(段, '找不到尺寸段')
  const 夹尺寸 = new Function(段[0] + '\n return 夹尺寸')()
  assert.deepEqual(夹尺寸(100, 100), { 宽: 280, 高: 320 })
  assert.deepEqual(夹尺寸(9999, 9999), { 宽: 720, 高: 900 })
  assert.deepEqual(夹尺寸(420, 600), { 宽: 420, 高: 600 })
  assert.deepEqual(夹尺寸('x', null), { 宽: 360, 高: 560 })
  assert.match(挂饰, /宽: c\.宽, 高: c\.高/)
  assert.match(挂饰, /localStorage\.setItem\(位置键, JSON\.stringify\(\{ left: 位\.left, top: 位\.top, 宽: c\.宽, 高: c\.高, 收起: 收起 \}\)\)/)
})

test('抓手：右下角存在，拖动夹尺寸，双击恢复 360×560', () => {
  assert.match(挂饰, /class="ep-grip"/)
  assert.match(挂饰, /ep-grip\{[^}]*cursor:nwse-resize/)
  assert.match(挂饰, /抓\.addEventListener\('pointermove'/)
  assert.match(挂饰, /抓\.addEventListener\('dblclick'/)
  assert.match(挂饰, /应用尺寸\(默认宽, 默认高\)/)
})

test('固定尺寸：头尾不滚、中间滚动，窄屏不溢出', () => {
  assert.match(挂饰, /\.ep-pages\{flex:1 1 auto;min-height:0;overflow-y:auto/)
  assert.match(挂饰, /\.ep-head\{display:block;flex:none/)
  assert.match(挂饰, /\.ep-foot\{display:flex;flex:none/)
  assert.match(挂饰, /max-width:calc\(100vw - 24px\)/)
})

test('轨迹并入第 1 页；空轨迹显示「本轮无波动」', () => {
  assert.match(挂饰, /data-page="0"[\s\S]*?ep-trace/)
  assert.match(挂饰, /本轮无波动/)
  assert.match(挂饰, /if \(页 === 0\) 画轨迹\(最新\)/)
})