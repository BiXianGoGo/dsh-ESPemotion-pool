import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const 目录 = mkdtempSync(join(tmpdir(), 'v14-'))
process.env.EMOTION_POOL_DIR = 目录
const 模 = await import('../lib/index.js')
const 配置路径 = join(目录, '情绪池配置.json')

function 写原(o) { writeFileSync(配置路径, JSON.stringify(o, null, 2)) }
function 读原() { return JSON.parse(readFileSync(配置路径, 'utf8')) }

test('设置清单：三十九个键，含 注入启用/默认页/结累计阈值/波动阈值/动画三键/曲线速度/模板两键/推轴三键', () => {
  const 表 = 模.设置清单()
  assert.equal(表.length, 39)
  assert.ok(表.some((x) => x.键 === '波动阈值'))
  const 键们 = 表.map((x) => x.键)
  for (const k of ['注入启用', '注入日限', '双轨阈值', '错判告知', 'QQ报警', '报警冷却小时', '刻度', '默认页', '结累计阈值', '动画时长', '缓动强度', '蓝收缩时长']) assert.ok(键们.includes(k), k)
  assert.equal(表.find((x) => x.键 === '注入启用').名, '注入')
})

test('校验：布尔字符串归一；整数必须整数；范围外拒绝；未知键拒绝', () => {
  assert.equal(模.校验设置('注入启用', 'off').值, false)
  assert.equal(模.校验设置('注入启用', '开').值, true)
  assert.equal(模.校验设置('错判告知', 0).值, false)
  assert.ok(模.校验设置('注入启用', '乱写').错误)
  assert.ok(模.校验设置('默认页', 1.5).错误)
  assert.ok(模.校验设置('刻度', 120).错误)
  assert.ok(模.校验设置('不存在', 1).错误)
})

test('写设置：保留未知键，只改目标键，缩进 2 空格', () => {
  写原({ 写入者: ['aaaaaaaa'], 自定义键: { a: 1 }, 默认页: 0 })
  const r = 模.写设置('默认页', 2)
  assert.equal(r.ok, true)
  const 原 = 读原()
  assert.equal(原.默认页, 2)
  assert.deepEqual(原.写入者, ['aaaaaaaa'])
  assert.deepEqual(原.自定义键, { a: 1 })
  assert.match(readFileSync(配置路径, 'utf8'), /\n  "默认页": 2/)
})

test('设置表：缺键补默认，已有键用文件值', () => {
  写原({ 刻度: 5 })
  const 表 = 模.设置表()
  const 取 = (k) => 表.find((x) => x.键 === k).值
  assert.equal(取('刻度'), 5)
  assert.equal(取('双轨阈值'), 0.15)
  assert.equal(取('结累计阈值'), 0.60)
  assert.equal(取('错判告知'), true)
  assert.equal(取('默认页'), 0)
})

test('校验失败时不写文件', () => {
  写原({ 默认页: 1 })
  const 前 = readFileSync(配置路径, 'utf8')
  const r = 模.写设置('默认页', 9)
  assert.equal(r.ok, false)
  assert.equal(readFileSync(配置路径, 'utf8'), 前)
})

test('布尔全表：true/1/on/是/开 与 false/0/off/否/关', () => {
  for (const v of ['true', '1', 'on', '是', '开', true, 1]) assert.equal(模.校验设置('QQ报警', v).值, true, String(v))
  for (const v of ['false', '0', 'off', '否', '关', false, 0]) assert.equal(模.校验设置('QQ报警', v).值, false, String(v))
})

test('卡片源码：第 4 页、设置接口、默认页手翻优先', () => {
  const 源 = readFileSync(fileURLToPath(new URL('../assets/widget.js', import.meta.url)), 'utf8')
  assert.ok(源.includes('data-page="3"'), '第 4 个页码点')
  assert.ok(源.includes('ep-set'), '设置容器')
  assert.ok(源.includes('/dsh-emotion-pool/settings'), '设置接口')
  assert.ok(源.includes('ep-page-manual'), '手翻标记')
  assert.ok(源.includes('默认页'), '读默认页')
  assert.ok(源.includes("method: 'POST'"), '保存走 POST')
})
test('写设置：配置带 BOM 也能读，未知键不丢（2026-11-11 事故回归）', () => {
  const 带BOM = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(JSON.stringify({ 写入者: ['aaaaaaaa'], 恢复备份: true, 默认页: 0 }, null, 2))])
  writeFileSync(配置路径, 带BOM)
  const r = 模.写设置('默认页', 3)
  assert.equal(r.ok, true)
  const 原 = 读原()
  assert.equal(原.默认页, 3)
  assert.deepEqual(原.写入者, ['aaaaaaaa'])
  assert.equal(原.恢复备份, true)
})

test('写设置：配置坏掉时返回 500 且一个字节都不写（不覆盖）', () => {
  writeFileSync(配置路径, '{"默认页": 1, 坏掉', 'utf8')
  const 前 = readFileSync(配置路径, 'utf8')
  const r = 模.写设置('默认页', 2)
  assert.equal(r.ok, false)
  assert.equal(r.码, 500)
  assert.equal(readFileSync(配置路径, 'utf8'), 前)
  // 只读的 设置表 仍给默认值，不抛
  assert.equal(模.设置表().length, 39)
})
