import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// 2026-11-16 17:3x（策划间 m01989）：新池建出来不许走重放——
// 文件初始化 axes 0/0/0、spine {}、当前快照=创建时刻、快照启用=false、带 迁移 标记；来源标 axes。
const 根 = join(process.env.TEMP || 'C:/temp', 'ep-m142-' + process.pid)
mkdirSync(join(根, '情绪池', '池'), { recursive: true })
process.env.EMOTION_POOL_DIR = 根
const 写配 = (o) => writeFileSync(join(根, '情绪池配置.json'), JSON.stringify(o, null, 2))
const 读配 = () => JSON.parse(readFileSync(join(根, '情绪池配置.json'), 'utf8'))
写配({ 组: [{ 名: '测试组', 会话: ['cccccccc'] }] })
const 模 = await import(pathToFileURL(join(process.cwd(), 'lib', 'index.js')).href)

test('新建池：写初始化池文件（axes 0、快照启用 false、当前快照有 t）', () => {
  const r = 模.池操作('新建', null, '新池A')
  assert.equal(r.ok, true)
  const 文 = JSON.parse(readFileSync(join(根, '情绪池', '池', '新池A.json'), 'utf8'))
  assert.deepEqual(文.axes, { E: 0, S: 0, P: 0 })
  assert.equal(文.快照启用, false)
  assert.ok(文.当前快照 && 文.当前快照.E && Number.isFinite(Date.parse(文.当前快照.E.t)))
  assert.ok(文.迁移, '带迁移标记，现值才会走 axes 分支')
})

test('新池现值：来源 axes、轴 0/0/0，不重放', () => {
  const 视 = 模.池视图(读配(), '新池A')
  const v = 模.展示现值(视)
  assert.equal(v.来源, 'axes')
  assert.equal(v.轴.E, 0)
  assert.equal(v.轴.S, 0)
  assert.equal(v.轴.P, 0)
})

test('池化后的池（带迁移标记）即使有事件也不许重放', () => {
  const 池 = {
    迁移: { 版本: '0.2.5' },
    axes: { E: 0, S: 0, P: 0 },
    spine: {},
    会话快照: {},
    快照启用: false,
    events: [{ t: new Date().toISOString(), sid: 'cccccccc', delta_raw: { E: 0.5, S: 0.5, P: 0.5 } }],
    零点: { E: 0, S: 0, P: 0 },
  }
  const v = 模.展示现值(池)
  assert.equal(v.来源, 'axes')
  assert.equal(v.轴.E, 0, '有事件也不许按历史 delta 累加')
})
