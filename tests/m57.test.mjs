// 正式名：README 与设置页
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const 此 = join(fileURLToPath(import.meta.url), '..', '..')
const 挂饰 = readFileSync(join(此, 'assets', 'widget.js'), 'utf8')
const 读我 = readFileSync(join(此, 'README.md'), 'utf8')

test('README 标题与首句是正式名', () => {
  assert.match(读我, /^# 鲸汐ESP情绪插件/)
  assert.match(读我, /鲸汐ESP情绪插件：三轴情绪状态 \+ 思考轨迹波动打点（0\.2）/)
})

test('设置页顶部有插件名 + 版本，灰色小字', () => {
  assert.match(挂饰, /\.ep-pname\{color:#6c7488;font-size:11px/)
  assert.match(挂饰, /盒\.innerHTML = '<div class="ep-pname">鲸汐ESP情绪插件 · v'/)
})