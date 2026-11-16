import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync as wf } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as 模 from '../lib/index.js'

const 前端 = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')
const 后端 = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')

test('前端：五段计时常驻，测结束静默 POST /perf，不 console', () => {
  assert.ok(前端.includes("fetch('/dsh-emotion-pool/perf'"))
  assert.ok(前端.includes("method: 'POST'"))
  assert.ok(前端.includes('报数(记)'))
  const 段 = 前端.slice(前端.indexOf('function 报数'), 前端.indexOf('function 测结束'))
  assert.ok(!/console\./.test(段))
  assert.ok(段.includes('catch(function () {})'))
})

test('后端：/perf 只收本机、只收 POST', () => {
  assert.ok(后端.includes("path: '/dsh-emotion-pool/perf'"))
  const 段 = 后端.slice(后端.indexOf("path: '/dsh-emotion-pool/perf'"), 后端.indexOf("path: '/dsh-emotion-pool/tpl'"))
  assert.ok(段.includes('if (!本机(req)) return 回JSON(res, 403'))
  assert.ok(段.includes("!== 'POST'"))
  assert.ok(段.includes('记性能(体)'))
})

test('记性能：写表头、保留其它段、只留最近 20 行', () => {
  const d = mkdtempSync(join(tmpdir(), 'ep-perf-'))
  const f = join(d, 'perf.md')
  wf(f, '# 标题\n\n## 别的\n\nx\n', 'utf8')
  for (let i = 0; i < 25; i++) 模.记性能({ 段: { 取数: i, 解析: 1, 建DOM: 2, 画SVG: 3, 首次布局: 4 }, 毫秒: i, 条数: 539, 页: i % 5, t: 'T' + i }, f)
  const 文 = readFileSync(f, 'utf8')
  assert.ok(文.includes('## 别的'))
  assert.ok(文.includes('## 真机数字'))
  const 行 = 文.split(/\r?\n/).filter((x) => x.startsWith('| T'))
  assert.equal(行.length, 20)
  assert.ok(行[行.length - 1].includes('| 24.'))
})

test('记性能：坏输入不抛', () => {
  const d = mkdtempSync(join(tmpdir(), 'ep-perf2-'))
  const f = join(d, 'perf.md')
  assert.doesNotThrow(() => 模.记性能(null, f))
  assert.doesNotThrow(() => 模.记性能({ 段: 'x', 毫秒: 'y' }, f))
})

test('页名固定：三轴/观测/列表/待确认/设置；后端用追加写', () => {
  assert.ok(前端.includes("['三轴', '观测', '列表', '待命名', '设置']"))
  assert.ok(后端.includes('appendFileSync(目标, 行'))
  assert.ok(后端.includes("地写\\n") === false)
})
