import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// 2026-11-16 17:2x（策划间 m01846）：配置与池文件会不一致——
//  ①配置没有、池文件在：新建时要恢复文件，不许覆盖、不许重名拒绝；
//  ②删池要能选「只移列表（文件留着）」或「连文件一起删」。
const 根 = join(process.env.TEMP || 'C:/temp', 'ep-m141-' + process.pid)
mkdirSync(join(根, '情绪池', '池'), { recursive: true })
process.env.EMOTION_POOL_DIR = 根
const 池文件 = join(根, '情绪池', '池', '常用聊天组.json')
const 写配 = (o) => writeFileSync(join(根, '情绪池配置.json'), JSON.stringify(o, null, 2))
const 读配 = () => JSON.parse(readFileSync(join(根, '情绪池配置.json'), 'utf8'))
写配({ 组: [{ 名: '测试组', 会话: ['6a169bce'] }] })
writeFileSync(池文件, JSON.stringify({ 会话: ['8f689553'], axes: { E: 0.3, S: 0.1, P: 0 } }, null, 2))
const 模 = await import(pathToFileURL(join(process.cwd(), 'lib', 'index.js')).href)

test('新建池：配置没有但池文件在 → 恢复文件会话，不覆盖不拒绝', () => {
  const r = 模.池操作('新建', null, '常用聊天组')
  assert.equal(r.ok, true)
  assert.equal(r.恢复, true)
  assert.equal(r.会话, 1)
  const 中 = 读配().组.filter((g) => g.名 === '常用聊天组')[0]
  assert.ok(中, '配置里要恢复出这个池')
  assert.deepEqual(中.会话, ['8f689553'])
  const 文 = JSON.parse(readFileSync(池文件, 'utf8'))
  assert.equal(文.axes.E, 0.3, '池文件不许被新建覆盖')
})

test('删除池：默认只移列表，池文件留着', () => {
  const r = 模.池操作('删除', '常用聊天组')
  assert.equal(r.ok, true)
  assert.equal(r.连文件, false)
  assert.equal(r.文件还在, true)
  assert.ok(!读配().组.some((g) => g.名 === '常用聊天组'))
  assert.ok(existsSync(池文件), '只移列表时池文件要留着')
})

test('删除池：连文件一起删', () => {
  写配({ 组: [{ 名: '测试组', 会话: ['6a169bce'] }, { 名: '常用聊天组', 会话: ['8f689553'] }] })
  writeFileSync(池文件, JSON.stringify({ 会话: ['8f689553'] }, null, 2))
  const r = 模.池操作('删除', '常用聊天组', '连文件')
  assert.equal(r.ok, true)
  assert.equal(r.连文件, true)
  assert.equal(r.文件已删, true)
  assert.ok(!existsSync(池文件), '连文件删时池文件要没了')
})

test('新建同名且配置里已有 → 仍报重名（配置与文件一致时）', () => {
  写配({ 组: [{ 名: '测试组', 会话: ['6a169bce'] }] })
  writeFileSync(池文件, JSON.stringify({ 会话: ['8f689553'] }, null, 2))
  const r = 模.池操作('新建', null, '测试组')
  assert.equal(r.ok, false)
  assert.match(String(r.错误), /已经有这个池/)
})
