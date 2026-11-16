import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const 前端 = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')

test('待确认页：插在第 4 页，设置页顺延到第 5 页', () => {
  assert.ok(前端.includes('data-page="3">\' +\n    \'    <div class="ep-pagetitle">情绪待命名确认页'))
  assert.ok(前端.includes('<div class="ep-page" data-page="4">'))
  assert.ok(前端.includes('data-page="4"></i>'))
  assert.ok(前端.includes('if (页 === 3) 画待确认()'))
})

test('待确认页：候选行有确认/丢弃与迷你曲线', () => {
  assert.ok(前端.includes('function 迷你曲线(点s)'))
  assert.ok(前端.includes("data-ok="))
  assert.ok(前端.includes("data-drop="))
  assert.ok(前端.includes("无曲线"))
  assert.ok(前端.includes('Math.min(10, 候.length)'))
})

test('待确认页：确认/丢弃/改名走 POST，模板可折叠', () => {
  assert.ok(前端.includes("'/dsh-emotion-pool/tpl/confirm'"))
  assert.ok(前端.includes("'/dsh-emotion-pool/tpl/drop'"))
  assert.ok(前端.includes("'/dsh-emotion-pool/tpl/rename'"))
  assert.ok(前端.includes('data-rn='))
  assert.ok(前端.includes("localStorage.setItem('ep-tpl-open'"))
})
