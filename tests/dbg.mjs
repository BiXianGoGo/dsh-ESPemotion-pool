import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const 目录 = mkdtempSync(join(tmpdir(), 'dbg-'))
process.env.EMOTION_POOL_DIR = 目录
const 模 = await import('../lib/index.js')
const 会话='session-aaaaaaaa-f40c-4fc3-ad69-f8338376753b'
const 配置={启用:true,校验启用:false,双轨重做:true,双轨阈值:0.15,分身每批:300,提醒启用:true,守恒上限:1,写入者:['aaaaaaaa'],注入启用:false,刻度:1,日志:['情绪池-日志.md','情绪池-日志.jsonl']}
try{rmSync(join(目录,'情绪池.json.lock'))}catch{}
writeFileSync(join(目录,'情绪池.json'),JSON.stringify({rev:0,axes:{E:0,S:0,P:0},spine:{S:0},prev_cell:'E0S0P0',events:[],stats:{selfreport_total:0,missed_total:0}},null,2))
writeFileSync(join(目录,'情绪池配置.json'),JSON.stringify(配置,null,2))
writeFileSync(join(目录,'情绪池-分身额度.json'),'')
const ctx={llm:{async *stream(){yield{type:'text-delta',text:JSON.stringify({分析:'x',E:1,S:0,P:0,q1:0.8,q2:0.6})}}},agents:{list:()=>[]}}
const 解=模.解析自报('<!-- EMO: E+9 S0 P0 | q1=0.5 q2=0.5 -->')
await 模.跑本轮(ctx,{id:会话,options:{provider:'p',model:'m'}},会话,1,'回复',解,'他说累')
const p=JSON.parse(readFileSync(join(目录,'情绪池.json'),'utf8'))
console.log(JSON.stringify(p.双轨,null,1))
console.log('log:',readFileSync(join(目录,'情绪池-日志.md'),'utf8'))