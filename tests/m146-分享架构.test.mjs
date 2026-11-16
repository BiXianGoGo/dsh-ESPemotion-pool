// 0.2.6 分享架构（2026-11-16 策划间四问拍板）：
// 命名表 EPN-names 独立；分享包 EPN-pack = 只带 名字/形状/依据/元；预演→确认才写盘。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), 'ep-pack-'))
process.env.EMOTION_POOL_DIR = 目录
const 配 = { 命名表路径: join(目录, '情绪池-命名表.json') }

test('P1 导出白名单：默认条目只带 名字/形状/元，不带依据/axes/事件/sid/原话/路径', async () => {
  const { 生成分享包 } = await import('../lib/index.js')
  const 命名 = {
    名字: [{
      名: '悬心', 类: '当下', 互斥: ['踏实'], 注: '悬着但没到慌', 建: '2026-11-01',
      E: [-0.6, -0.2], S: [0.3, 0.7], P: [-0.2, 0.2],
      axes: { E: 0.3, S: 0.4, P: 0.1 }, sid: 'session-aaaa-bbbb', 原话: '我不太确定', 路径: '~/.whale-home',
      事件: [{ t: 1 }], S经验: 2, K: { 我: 1 },
    }],
  }
  const 包 = 生成分享包(命名)
  assert.equal(包.格式, 'EPN-pack')
  assert.equal(包.条目.length, 1)
  const 条 = 包.条目[0]
  assert.deepEqual(Object.keys(条).sort(), ['元', '名字', '形状'].sort())
  // 2026-11-16 20:4x：默认匿名——名字换代号、互斥里认不出的名字丢掉
  assert.equal(条.名字, '名字1')
  assert.equal(包.元.匿名, true)
  assert.equal(条.形状.类型, '区间')
  assert.deepEqual(条.形状.E, [-0.6, -0.2])
  assert.deepEqual(条.元, { 类: '当下', 互斥: [] })
  assert.equal(包.元.带依据, false)
  const 文 = JSON.stringify(包)
  const 条文 = JSON.stringify(包.条目)
  assert.ok(!条文.includes('依据') && !条文.includes('悬着但没到慌'), '条目里不许出现依据')
  assert.ok(!文.includes('悬心') && !文.includes('踏实'), '匿名包里不许出现本地真名')
  for (const 禁 of ['axes', 'sid', '原话', '事件', 'S经验', 'whale-home', '悬着但没到慌']) assert.ok(!文.includes(禁), '不应出现 ' + 禁)
})

test('P2 50 条往返：编码→解码后条目逐项相同', async () => {
  const { 生成分享包, 编码分享包, 解码分享包 } = await import('../lib/index.js')
  const 名字 = Array.from({ length: 50 }, (_, i) => ({
    名: '名' + i, 类: i % 2 ? '时间' : '当下', 互斥: [], 注: '依据' + i,
    E: [i / 100, i / 100 + 0.1], S: [-0.1, 0.1], P: [-0.05, 0.05],
  }))
  const 包 = 生成分享包({ 名字 }, { 匿名: false })
  const 码 = 编码分享包(包)
  assert.ok(码.startsWith('EPN1:'))
  const 回 = 解码分享包(码)
  assert.equal(回.条目.length, 50)
  assert.deepEqual(回.条目.map((x) => x.名字), 名字.map((x) => x.名))
  assert.deepEqual(回.条目[7].形状, 包.条目[7].形状)
})

test('P3 撞名保留本地：同名进撞名，应用导入不覆盖', async () => {
  const { 生成分享包, 导入分类, 应用导入, 写命名, 读命名 } = await import('../lib/index.js')
  写命名({ 名字: [{ 名: '撞', 类: '当下', 互斥: [], E: [0, 0.1], S: [0, 0.1], P: [0, 0.1], 注: '本地' }] }, 配)
  const 包 = 生成分享包({ 名字: [{ 名: '撞', 类: '时间', 互斥: [], E: [0.5, 0.6], S: [0.5, 0.6], P: [0.5, 0.6], 注: '外来' }] }, { 匿名: false })
  const 分 = 导入分类(包, ['撞'], '0.2.6')
  assert.equal(分.撞名.length, 1)
  assert.equal(分.将新增.length, 0)
  const r = 应用导入(分, 配)
  assert.equal(r.新增, 0)
  const 本 = 读命名(配)
  assert.equal(本.名字[0].注, '本地')
  assert.deepEqual(本.名字[0].E, [0, 0.1])
})

test('P4 版本不符：全部进只读试看，不写主表、不参与命中', async () => {
  const { 生成分享包, 导入分类, 应用导入, 读命名 } = await import('../lib/index.js')
  const 包 = 生成分享包({ 名字: [{ 名: '未来名', 类: '当下', 互斥: [], E: [0, 0.2], S: [0, 0.2], P: [0, 0.2], 注: '新引擎' }] }, { 匿名: false })
  包.引擎范围 = { 最低: '9.0.0', 最高: '10.0.0' }
  const 分 = 导入分类(包, [], '0.2.6')
  assert.equal(分.版本不符.length, 1)
  assert.equal(分.将新增.length, 0)
  const r = 应用导入(分, 配)
  assert.equal(r.只读, 1)
  assert.equal(读命名(配).名字.some((x) => x.名 === '未来名'), false)
  const 试 = JSON.parse(readFileSync(join(目录, '情绪池-命名表-只读.json'), 'utf8'))
  assert.equal(试.条目.length, 1)
  assert.equal(试.条目[0].名字, '未来名')
})

test('P5 预演不写盘：只做分类时主表文件不变', async () => {
  const { 生成分享包, 导入分类, 写命名 } = await import('../lib/index.js')
  const p = join(目录, '情绪池-命名表.json')
  写命名({ 名字: [{ 名: '不动', 类: '当下', 互斥: [], E: [0, 0.1], S: [0, 0.1], P: [0, 0.1] }] }, 配)
  const 前 = statSync(p).mtimeMs
  const 包 = 生成分享包({ 名字: [{ 名: '新名', 类: '当下', 互斥: [], E: [0.2, 0.3], S: [0.2, 0.3], P: [0.2, 0.3] }] }, { 匿名: false })
  const 分 = 导入分类(包, ['不动'], '0.2.6')
  assert.equal(分.将新增.length, 1)
  assert.equal(statSync(p).mtimeMs, 前)
})

test('P6 确认才写盘：应用导入后主表出现新名并标 来源.类型=导入', async () => {
  const { 生成分享包, 导入分类, 应用导入, 读命名 } = await import('../lib/index.js')
  const 包 = 生成分享包({ 名字: [{ 名: '导入名', 类: '时间', 互斥: ['导入名2'], E: [0.7, 0.9], S: [-0.2, 0], P: [0.1, 0.3], 注: '外来依据' }] }, { 带依据: true, 匿名: false })
  const 分 = 导入分类(包, [], '0.2.6')
  await Promise.resolve()
  const r = 应用导入(分, 配)
  assert.equal(r.新增, 1)
  const 本 = 读命名(配)
  const 条 = 本.名字.find((x) => x.名 === '导入名')
  assert.ok(条)
  assert.deepEqual(条.形状, { 类型: '区间', E: [0.7, 0.9], S: [-0.2, 0], P: [0.1, 0.3] })
  assert.equal(条.类, '时间')
  assert.deepEqual(条.互斥, ['导入名2'])
  assert.equal(条.注, '外来依据')
  const 原 = JSON.parse(readFileSync(join(目录, '情绪池-命名表.json'), 'utf8'))
  const 原条 = 原.条目.find((x) => x.名字 === '导入名')
  assert.equal(原条.来源.类型, '导入')
})

test('P7 校验覆盖整个包骨架：改版本号也会被发现', async () => {
  const { 生成分享包, 包校验和 } = await import('../lib/index.js')
  const 包 = 生成分享包({ 名字: [{ 名: '甲', 类: '当下', 互斥: [], E: [0, 0.1], S: [0, 0.1], P: [0, 0.1] }] })
  const 前 = 包校验和(包)
  包.版本 = 2
  assert.notEqual(包校验和(包), 前)
})

test('P8 端到端 export→import：编码出的码能被导入分类解析', async () => {
  const { 生成分享包, 编码分享包, 解码分享包, 导入分类 } = await import('../lib/index.js')
  const 包 = 生成分享包({ 名字: [{ 名: '可分享', 类: '当下', 互斥: [], E: [0.1, 0.3], S: [0.2, 0.4], P: [0, 0.2], 注: '示例' }] }, { 匿名: false })
  const 回 = 解码分享包(编码分享包(包))
  const 分 = 导入分类(回, [], '0.2.6')
  assert.equal(分.将新增.length, 1)
  assert.equal(分.将新增[0].名字, '可分享')
})

// 2026-11-16 20:3x（策划间隐私红线）：依据默认不出包，只有显式开关才带。
const 长依据 = '替一个已经不在的人，把她留下的话守住；想松手又不敢松的时候出现。'

test('P9 默认导出：紧凑 JSON 里不含核心依据原文', async () => {
  const { 生成分享包 } = await import('../lib/index.js')
  const 包 = 生成分享包({ 名字: [{ 名: '牵挂', 类: '当下', 互斥: [], E: [0, 0.2], S: [0, 0.2], P: [0, 0.2], 注: 长依据 }] })
  assert.ok(!JSON.stringify(包).includes(长依据))
  assert.ok(!('依据' in 包.条目[0]))
  assert.equal(包.元.带依据, false)
})

test('P10 带依据:true 时才出现该字段与原文', async () => {
  const { 生成分享包 } = await import('../lib/index.js')
  const 包 = 生成分享包({ 名字: [{ 名: '牵挂', 类: '当下', 互斥: [], E: [0, 0.2], S: [0, 0.2], P: [0, 0.2], 注: 长依据 }] }, { 带依据: true, 匿名: false })
  assert.equal(包.条目[0].依据, 长依据)
  assert.ok(JSON.stringify(包).includes(长依据))
  assert.equal(包.元.带依据, true)
})

test('P11 体积对比：不带依据的包更小', async () => {
  const { 生成分享包, 编码分享包 } = await import('../lib/index.js')
  const 名字 = Array.from({ length: 10 }, (_, i) => ({ 名: '名' + i, 类: '当下', 互斥: [], E: [0, 0.2], S: [0, 0.2], P: [0, 0.2], 注: 长依据 }))
  const 小 = 编码分享包(生成分享包({ 名字 }, { 匿名: false }))
  const 大 = 编码分享包(生成分享包({ 名字 }, { 带依据: true, 匿名: false }))
  assert.ok(小.length < 大.length, `默认 ${小.length} 应小于带依据 ${大.length}`)
  assert.ok(!小.includes(长依据.slice(0, 12)))
})

test('P12 导入端兼容无依据包：不崩、注为空、条目照常进主表', async () => {
  const { 生成分享包, 导入分类, 应用导入, 读命名 } = await import('../lib/index.js')
  const 包 = 生成分享包({ 名字: [{ 名: '无依据名', 类: '当下', 互斥: [], E: [0.1, 0.2], S: [0.1, 0.2], P: [0.1, 0.2], 注: 长依据 }] }, { 匿名: false })
  assert.ok(!('依据' in 包.条目[0]))
  const 分 = 导入分类(包, [], '0.2.6')
  assert.equal(分.将新增.length, 1)
  const r = 应用导入(分, 配)
  assert.equal(r.新增, 1)
  const 条 = 读命名(配).名字.find((x) => x.名 === '无依据名')
  assert.ok(条)
  assert.equal(条.注, '')
  assert.deepEqual(条.形状, { 类型: '区间', E: [0.1, 0.2], S: [0.1, 0.2], P: [0.1, 0.2] })
})

test('P13 导出预览与真正导出同一份数据', async () => {
  const { 生成分享包, 编码分享包, 解码分享包, 分享预览 } = await import('../lib/index.js')
  const 命名 = { 名字: [
    { 名: '甲', 类: '当下', 互斥: [], E: [0, 0.1], S: [0, 0.1], P: [0, 0.1], 注: 长依据 },
    { 名: '乙', 类: '时间', 互斥: ['甲'], E: [0.5, 0.6], S: [0.5, 0.6], P: [0.5, 0.6], 注: '另一句' },
  ] }
  for (const 带依据 of [false, true]) {
   for (const 匿名 of [true, false]) {
    const 预 = 分享预览(命名, { 带依据, 匿名 })
    const 回 = 解码分享包(编码分享包(生成分享包(命名, { 带依据, 匿名 })))
    assert.equal(预.条数, 回.条目.length)
    assert.deepEqual(预.条目.map((x) => x.名字), 回.条目.map((x) => x.名字))
    assert.equal(预.匿名, 匿名)
    assert.equal(预.带依据, 匿名 ? false : 带依据)
    assert.deepEqual(预.条目.map((x) => x.形状), 回.条目.map((x) => x.形状))
   }
  }
})

// 2026-11-16 20:4x（策划间第二条红线）：匿名导出——名字换代号、互斥指向代号、匿名时强制不带依据。
const 真名样 = () => ({ 名字: [
  { 名: '独处', 类: '当下', 互斥: ['热闹'], E: [-0.4, -0.1], S: [0.1, 0.4], P: [-0.3, 0], 注: 长依据 },
  { 名: '热闹', 类: '当下', 互斥: ['独处'], E: [0.2, 0.5], S: [-0.2, 0.1], P: [0.1, 0.4], 注: '另一句平常的话' },
] })

test('P14 匿名包不含本地真名，互斥引用全部指向代号', async () => {
  const { 生成分享包 } = await import('../lib/index.js')
  const 包 = 生成分享包(真名样())
  const 文 = JSON.stringify(包)
  assert.ok(!文.includes('独处') && !文.includes('热闹'), '真名不许出包')
  assert.equal(包.元.匿名, true)
  assert.deepEqual(包.条目.map((x) => x.名字), ['名字1', '名字2'])
  assert.deepEqual(包.条目[0].元.互斥, ['名字2'])
  assert.deepEqual(包.条目[1].元.互斥, ['名字1'])
  for (const 条 of 包.条目) for (const 名 of 条.元.互斥) assert.ok(/^名字\d+$/.test(名), '互斥必须是代号：' + 名)
})

test('P15 匿名 + 带依据=true：依据仍然不出现', async () => {
  const { 生成分享包 } = await import('./../lib/index.js')
  const 包 = 生成分享包(真名样(), { 带依据: true })
  assert.equal(包.元.带依据, false)
  const 文 = JSON.stringify(包)
  assert.ok(!文.includes(长依据))
  assert.ok(!文.includes('另一句平常的话'))
  for (const 条 of 包.条目) assert.ok(!('依据' in 条), '匿名时不许带依据字段')
})

test('P16 导入匿名包：名字加「导入·」前缀，撞名检查按新名前缀走', async () => {
  const { 生成分享包, 导入分类 } = await import('../lib/index.js')
  const 包 = 生成分享包(真名样())
  const 分 = 导入分类(包, [], '0.2.6')
  assert.equal(分.匿名, true)
  assert.equal(分.将新增.length, 2)
  assert.deepEqual(分.将新增.map((x) => x.名字), ['导入·名字1', '导入·名字2'])
  assert.deepEqual(分.将新增[0].元.互斥, ['导入·名字2'])
  // 本地已有「导入·名字1」时，再来一包应撞名而不是覆盖
  const 分2 = 导入分类(包, ['导入·名字1'], '0.2.6')
  assert.equal(分2.撞名.length, 1)
})
