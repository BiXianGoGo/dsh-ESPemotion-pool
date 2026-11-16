import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const w = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')

test('几何只有一份：__geo 画图时建一次，底栏与悬停都读同一对象', () => {
  assert.match(w, /var geo0 = null/)
  assert.match(w, /svgEl\.__geo = geo0/)
  assert.match(w, /组图\[选\]\.geo = geo0/)
  assert.match(w, /window\.__epGeo = geo0/)
  assert.match(w, /window\.__epGeoText = 调试态 && geo0 \?/)
  assert.match(w, /var geo = 取几何\(\)/)
  assert.match(w, /组图\[选\]\.几何 = 几何/)
})

test('三轴行不换行、基行不改变行数：label 不缩、vwrap 纵排两行', () => {
  assert.match(w, /\.ep-gcard-row\{[^}]*flex-wrap:nowrap/)
  assert.match(w, /\.ep-gcard-k\{flex:none/)
  assert.match(w, /\.ep-gcard-vwrap\{[^}]*flex-direction:column/)
  assert.match(w, /\.ep-gwrap\{[^}]*min-height:96px/)
})
