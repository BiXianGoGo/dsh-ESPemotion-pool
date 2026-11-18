// m152：0.2.7 发布前两件——定名只跑趋势轮 + 种子随包回退
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as 校准 from '../lib/calib.js'

const 插件 = 'C:/Users/Administrator/Documents/deepseek-harness/default-workspace/plugins/emotion-pool'
const 源码 = readFileSync(join(插件, 'lib/index.js'), 'utf8')
const calib源 = readFileSync(join(插件, 'lib/calib.js'), 'utf8')

function 临时家() {
  const d = mkdtempSync(join(tmpdir(), 'ep-m152-'))
  process.env.EMOTION_POOL_DIR = d
  return d
}

test('m152-1 定名只在推轴之后、且只给趋势轮（源码守卫）', () => {
  const i推 = 源码.indexOf("推回 = 推轴(")
  const i定 = 源码.indexOf('定名 = 定名波动(')
  assert.ok(i推 > 0 && i定 > 0)
  assert.ok(i定 > i推, '定名调用必须在推轴之后（非趋势轮不命名）')
  assert.ok(源码.includes("if (推回 && 推回.状态 === '趋势') {"), '条件必须兜住 推回 为空/未归池')
  assert.ok(源码.includes('状态: 轮廓贴 ? 轮廓贴.状态 : null'), '推轴 return 必须带状态')
  // 旧的无条件调用应已删除
  assert.equal(源码.includes('try { 定名 = 定名波动(sid, turn, 主.点, 波动, 读配置()) } catch (e) { 定名 = null }\n    let 推回'), false)
})

test('m152-2 种子回退：空 HOME 回插件包，HOME 有种子时优先 HOME', () => {
  const 空 = join(tmpdir(), '__m152_no_home__')
  const 回 = 校准.读种子(空)
  assert.ok(回 && 回.曲线.length === 500, '空 HOME 应回退 assets/seed-500.json')
  assert.equal(回.n0, 500)

  const 家 = 临时家()
  const 自 = {
    版本: 1,
    格式: 'EPN-seed',
    n0: 3,
    曲线: [
      { id: 's1', 轴: { E: [0, 0.2], S: [0, 0.1], P: [0, 0.3] } },
      { id: 's2', 轴: { E: [0, 0.2], S: [0, 0.1], P: [0, 0.3] } },
      { id: 's3', 轴: { E: [0, 0.2], S: [0, 0.1], P: [0, 0.3] } },
    ],
  }
  writeFileSync(join(家, 校准.种子文件名), JSON.stringify(自), 'utf8')
  const 优 = 校准.读种子(家)
  assert.ok(优 && 优.曲线.length === 3, 'HOME 有种子时应优先 HOME')
  assert.equal(优.n0, 3)
})

test('m152-3 回退解析与 HOME 走同一白名单（三轴各 ≥2 点）', () => {
  const 家 = 临时家()
  writeFileSync(
    join(家, 校准.种子文件名),
    JSON.stringify({ n0: 2, 曲线: [{ 轴: { E: [0, 0.2], S: [0], P: [0, 0.1] } }] }),
    'utf8'
  )
  // HOME 里那条不合格 → 解析 null → 回退插件种子
  const r = 校准.读种子(家)
  assert.ok(r && r.曲线.length === 500, 'HOME 种子不合格时应回退插件种子，而不是报错')
  assert.ok(calib源.includes('插件种子路径'), 'calib 里应有插件回退路径')
  assert.ok(calib源.includes('解析种子('), '回退与 HOME 应共用解析/白名单')
})
