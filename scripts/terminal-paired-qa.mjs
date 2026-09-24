import fs from 'node:fs'
const pages=await (await fetch('http://127.0.0.1:9223/json')).json()
const page=pages.find(p=>p.type==='page')
if(!page) throw Error('No terminal page')
const socket=new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject})
let sequence=0;const pending=new Map()
socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}}
const send=(method,params={})=>new Promise(resolve=>{const id=++sequence;pending.set(id,resolve);socket.send(JSON.stringify({id,method,params}))})
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.result?.exceptionDetails)throw Error(JSON.stringify(r.result.exceptionDetails));return r.result?.result?.value}
const mode=process.argv[2]||'inspect'
try {
 if(mode==='sim'||mode==='reset') await send('Page.navigate',{url:'http://10.0.0.29:8000/login/'+(mode==='sim'?'?sim=1':'')})
 if(mode==='fill') console.log(await evaluate(`(async()=>{
   window.__qaAudio=[];const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){window.__qaAudio.push({src:this.src,rate:this.playbackRate,duration:this.duration});return play.apply(this,arguments)};
   const input=document.querySelector('input[autocomplete="name"]');input.value='测试用户';input.dispatchEvent(new Event('input',{bubbles:true}));
   const tick=()=>new Promise(r=>setTimeout(r,100));
   document.querySelectorAll('button.field-display')[0].click();await tick();
   for(const digit of ['1','2','3','4']) [...document.querySelectorAll('.employee-keypad__grid button')].find(b=>b.textContent===digit).click();
   document.querySelector('.employee-keypad__done').click();document.querySelector('.gender-toggle button').click();
   document.querySelectorAll('button.field-display')[1].click();await tick();
   for(const digit of ['3','0']) [...document.querySelectorAll('.employee-keypad__grid button')].find(b=>b.textContent===digit).click();
   document.querySelector('.employee-keypad__done').click();document.querySelector('.identity-card .primary').click();
   await tick();
   return document.body.innerText;
 })()`))
 if(mode==='eval') console.log(JSON.stringify(await evaluate(process.argv[3])))
 if(mode==='inspect') console.log(JSON.stringify(await evaluate(`({text:document.body.innerText,audio:window.__qaAudio,assets:[...document.scripts].map(s=>s.src)})`)))
 if(mode==='shot'){const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('artifacts/paired-webview.png',Buffer.from(shot.result.data,'base64'))}
} finally {socket.close()}
