import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const w = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')

test('设置分组：七组定义（含说明书）、数据源组', () => {
  for (const g of ['数据源', '判定与阈值', '双轨与接管', '敏感与上瘾', '通知', '界面', '高级', '说明书']) assert.ok(w.includes("['" + g + "'"), g)
})

test('折叠：组头、箭头、localStorage esp-set-fold', () => {
  assert.ok(w.includes('.ep-gh'))
  assert.ok(w.includes('esp-set-fold'))
  assert.ok(w.includes("名 === 设置组[0][0]"))
})

test('多选：勾选框、data-mval、三按钮、不选=全部', () => {
  assert.ok(w.includes('data-mval'))
  assert.ok(w.includes('data-mact="none"'))
  assert.ok(w.includes('data-mact="all"'))
  assert.ok(w.includes('data-mact="flip"'))
  assert.ok(w.includes('不选 = 全部'))
})

test('多选提交走 POST /settings，数组值不转数字', () => {
  assert.ok(w.includes("键: '装载会话'") || w.includes("'装载会话'"))
  assert.ok(w.includes('Array.isArray(原值) ? 原值 : []'))
})

test('分组只影响展示：SETTINGS 仍整表返回（后端测试覆盖）', () => {
  assert.ok(w.includes('设置数据.filter'))
})
