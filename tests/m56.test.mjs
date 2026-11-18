// 正式名：鲸汐ESP情绪插件
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const 此 = join(fileURLToPath(import.meta.url), '..', '..')
const 包 = JSON.parse(readFileSync(join(此, 'package.json'), 'utf8'))
const 挂饰 = readFileSync(join(此, 'assets', 'widget.js'), 'utf8')

test('package.json：displayName 与 description 是正式名', () => {
  assert.equal(包.displayName, '鲸汐ESP情绪插件')
  assert.equal(包.description, '鲸汐ESP情绪插件：三轴情绪状态 + 思考轨迹波动打点（0.2）')
})

test('卡片命名条 title 带正式名，后面才是当前命名与注', () => {
  assert.match(挂饰, /名字\.title = '鲸汐ESP情绪插件' \+ \(s\.命名/)
})