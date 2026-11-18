import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const 源 = readFileSync(join(process.cwd(), 'lib', 'index.js'), 'utf8')
const 前端 = readFileSync(join(process.cwd(), 'assets', 'widget.js'), 'utf8')

test('B：默认配置两组', () => {
  assert.ok(源.includes("名: '常用聊天组', 会话: ['c4b92d68']"))
  assert.ok(源.includes("名: '测试组', 会话: ['6a169bce']"))
})

test('B：组轴值 = 组内快照和 + spine，不混其他组', () => {
  assert.ok(源.includes('export function 组现值(池, 组)'))
  assert.ok(源.includes('for (const k of 轴们) 轴[k] = 显示值(合[k], 份.零点[k])'))
  assert.ok(源.includes('for (const k of 轴们) 和[k] += Number(池.spine && 池.spine[k]) || 0'))
  assert.ok(源.includes('for (const sid of (组 && 组.会话) || [])'))
})

test('B：装载会话降级，组优先并标来源', () => {
  assert.ok(源.includes("if (组名单(配置).some((g) => g.会话.length)) return '组'"))
  assert.ok(源.includes("return 装载名单(配置).length ? '装载会话' : '全部'"))
  assert.ok(源.includes('装载来源: 装载来源(配置)'))
})

test('B：/state 里每组带轴/命名/点/波动', () => {
  assert.ok(源.includes('组: (() => {'))
  assert.ok(源.includes('命名: 条名(命) || null'))
  assert.ok(源.includes('点, 点来源: 来源'))
  assert.ok(源.includes('波动: (池.events || []).filter'))
})

test('B：POST /group 改会话组，组名为空等于不装载', () => {
  assert.ok(源.includes("path: '/dsh-emotion-pool/group'"))
  assert.ok(源.includes('export function 改会话组(会话, 组名)'))
  assert.ok(源.includes("const 名 = String(组名 == null ? '' : 组名).trim()"))
})

test('B：设置 GET 暴露组配置，供下拉', () => {
  assert.ok(源.includes('组配置: 组名单(配0)'))
})

test('B：第一页组容器与小页签（折线 130）', () => {
  assert.ok(前端.includes("ep-gcards"))
  assert.ok(前端.includes('function 画组(s)'))
  assert.ok(前端.includes('var H = 130'))
  assert.ok(前端.includes('g.波动.slice(0, 3)'))
})

test('B：数据源：组选会话下拉（可搜索/可清空），旧勾选不再用', () => {
  assert.ok(前端.includes('data-psel'))
  assert.ok(前端.includes('/dsh-emotion-pool/group'))
  assert.ok(前端.includes('池→会话是唯一真相'))
  assert.ok(!前端.includes('select[data-ses]'))
})
