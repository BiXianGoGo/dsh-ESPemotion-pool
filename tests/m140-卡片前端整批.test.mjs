import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { 全部池, 组名单 } from '../lib/index.js'

const 前端 = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')
const 后端 = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')

test('第 2 项：悬停按屏幕像素找最近折点，阈 10px，并留测试钩子', () => {
  assert.ok(前端.includes('function 最近点(几何, vx, vy, 比W, 比H, 阈, 隐)'))
  assert.ok(前端.includes('if (!命 || 像素 > 10)'))
  assert.ok(前端.includes('window.__ep最近点 = 最近点'))
})

test('第 7 项：事件注释带 时间/段/为谁/Δ 两位带号/来源/原话', () => {
  assert.ok(前端.includes("差.push(轴们[j] + ' ' + 带号(dr[轴们[j]]))"))
  assert.ok(前端.includes('function 带号(v)'))
  assert.ok(前端.includes('class="ep-ev-q"'))
  assert.ok(前端.includes('class="ep-ev-src"'))
})

test('第 6 项：观测默认判定+双轨展开，折叠由 details toggle 持久化', () => {
  assert.ok(前端.includes('{ 判定: true, 双轨: true, 敏感: false, 注入: false }'))
  assert.ok(前端.includes("dt.addEventListener('toggle'"))
  assert.ok(!前端.includes("btn.addEventListener('click', function (ev) {"))
})

test('第 10/12 项：未归池会话可从全部会话里选（会话选项聚合分片）', () => {
  assert.ok(后端.includes('Object.values(分片.读全部()'))
  assert.ok(后端.includes('配置.组'))
  assert.ok(前端.includes('data-psel='))
})

test('第 11 项：空池进页签且排最后（全部池不丢空组）', () => {
  const 配 = { 组: [{ 名: '有空', 会话: ['8f689553'] }, { 名: '空池', 会话: [] }] }
  const 全 = 全部池(配)
  assert.equal(全.length, 2)
  assert.deepEqual(全[1].会话, [])
  assert.equal(组名单(配).length, 2) // 2026-11-16 策划间口径：空池也进页签（排最后，0/0/0）
  assert.ok(后端.includes('const 全部 = 全部池(配置)'))
  assert.ok(后端.includes('空: !g.会话.length'))
})

test('第 13 项：说明书点一下就能打开（前端按钮 + 后端 /manual/open）', () => {
  assert.ok(前端.includes('data-openmanual="1"'))
  assert.ok(前端.includes("'/dsh-emotion-pool/manual/open'"))
  assert.ok(后端.includes("path: '/dsh-emotion-pool/manual/open'"))
})

test('第 8 项：/tpl 成功响应带 ok，失败能显示真实错误', () => {
  assert.ok(后端.includes('ok: true'))
  assert.ok(前端.includes("throw new Error((o && o.error) || '读取失败')"))
})

test('第 14 项：推轴单步上限进设置表并被推轴体读取', () => {
  assert.ok(后端.includes("{ 键: '推轴单步上限'"))
  assert.ok(后端.includes('Number(配.推轴单步上限) || 0.3'))
  assert.ok(前端.includes("'推轴单步上限'"))
  assert.ok(前端.includes("['其他', []]"))
})
