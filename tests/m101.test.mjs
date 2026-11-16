import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const 后 = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
const 前 = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')

test('清零：备份到 情绪池/归档/reset-<ts>，会话/总表都归 0', () => {
  assert.ok(后.includes("join(HOME, '情绪池', '归档', 'reset-' + ts)"))
  assert.ok(后.includes('o.rev = 0'))
  assert.ok(后.includes('t.rev = 0'))
  assert.ok(后.includes('o.归零时间 = 现在()'))
})

test('清零：命名表不动（备份只 copy 池文件）', () => {
  assert.ok(后.includes('复(POOL_PATH, join(备'))
  assert.ok(!后.includes("copyFileSync(命名路径"))
})

test('清零与命名管理路由都在，写操作校验写入者', () => {
  for (const p of ['/dsh-emotion-pool/data/reset', '/dsh-emotion-pool/names/delete', '/dsh-emotion-pool/names/rename']) {
    assert.ok(后.includes("path: '" + p + "'"), p)
  }
  assert.ok(后.includes('if (!会话可写(体, 配)) return 回(403'))
})

test('命名删除/改名记改动台账，不记 inbox', () => {
  assert.ok(后.includes('记台账('))
  assert.ok(后.includes('删除了「'))
  assert.ok(后.includes('改名「'))
  assert.ok(!后.includes("appendFileSync(INBOX_PATH"))
})

test('改名只查命名表；与模板同名只警告不阻止', () => {
  assert.ok(后.includes("error: '命名表里已经有「' + 新 + '」'"))
  assert.ok(后.includes('两套命名空间不同，不阻止'))
})

test('设置页有「高级」组与三个动作', () => {
  assert.ok(前.includes("['高级', []]"))
  for (const a of ['data-act="reset"', 'data-act="archive"', 'data-act="names"']) assert.ok(前.includes(a), a)
})

test('二次确认：3 秒倒计时后恢复，不弹窗', () => {
  assert.ok(前.includes("btn.textContent = '确定？3'"))
  assert.ok(前.includes("btn.dataset.ok === '1'"))
  assert.ok(!/window\.(alert|confirm|prompt)/.test(前))
})

test('失败红字、警告黄色与 ? 悬停说明', () => {
  assert.ok(前.includes('.ep-smsg.err{color:#ff9b9b}'))
  assert.ok(前.includes('.ep-smsg.warn{color:#ffd166}'))
  assert.ok(前.includes('class="ep-q"'))
})

test('命名管理走 /names 与 delete/rename 接口', () => {
  assert.ok(前.includes("'/dsh-emotion-pool/names'"))
  assert.ok(前.includes("'/dsh-emotion-pool/names/delete'"))
  assert.ok(前.includes("'/dsh-emotion-pool/names/rename'"))
  assert.ok(前.includes('画命名管理(盒, 提示, 行)'))
})

test('归档按钮显示搬了多少条', () => {
  assert.ok(前.includes("'搬了 ' + (o.事件 || 0) + ' 条事件、' + (o.结 || 0) + ' 条结'"))
})
