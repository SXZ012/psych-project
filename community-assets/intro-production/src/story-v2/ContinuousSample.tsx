import React from 'react';
import {AbsoluteFill, Easing, interpolate, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {Audio} from '@remotion/media';

// A continuous, joint-animated scene. All motion is frame driven for offline rendering.
const key = (f:number, times:number[], values:number[]) => interpolate(f,times,values,{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:Easing.inOut(Easing.cubic)});
const skin='#e8b896', ink='#39423c', hair='#303b36';
const Phone=()=> <g><rect x="-16" y="-34" width="32" height="58" rx="6" fill="#344740"/><rect x="-12" y="-28" width="24" height="43" rx="3" fill="#d5e6d5"/><path d="M-7 -17h13M-7 -10h9M-7 -3h14" stroke="#7a998e" strokeWidth="2"/><circle cy="19" r="2" fill="#a5b4a4"/></g>;

function Plant({x,y,s=1,f=0}:{x:number;y:number;s?:number;f?:number}) {
 return <g transform={`translate(${x} ${y}) scale(${s})`}><path d="M-32 0h64l-8 56h-47z" fill="#ba8164"/><path d="M-32 0h64v9h-64z" fill="#d5a07d"/><g transform={`rotate(${Math.sin(f/65)*1.4} 0 0)`}><path d="M0 0Q-8 -75 7 -151M0 -38L-38 -88M1 -70L39 -116" fill="none" stroke="#60795a" strokeWidth="5"/>{[[-24,-65,-40],[25,-90,42],[-12,-110,-32],[12,-143,24]].map(([a,b,c],i)=><ellipse key={i} cx={a} cy={b} rx="16" ry="35" fill={i%2?'#81977b':'#597761'} transform={`rotate(${c} ${a} ${b})`}/>)}</g></g>;
}

function Room({f}:{f:number}) {
 return <g>
  <rect width="1920" height="1080" fill="url(#wall)"/>
  <rect y="792" width="1920" height="288" fill="#c7b297"/>
  <path d="M0 792h1920M0 822h1920" stroke="#b5a58d" strokeWidth="6"/>
  {[900,1010].map(y=><path key={y} d={`M0 ${y}h1920`} stroke="#b4a58d" strokeWidth="2"/>)}
  {[40,360,680,1000,1320,1640,1960].map(x=><path key={x} d={`M${x} 792l-200 288`} stroke="#b4a58d" strokeWidth="2"/>)}
  <path d="M170 370L460 380 1200 1080H545z" fill="#fff1c7" opacity=".32"/>
  <rect x="110" y="130" width="395" height="450" rx="170" fill="#c8c3a6"/>
  <rect x="128" y="146" width="359" height="414" rx="154" fill="#eff0d6"/>
  <path d="M128 395Q250 315 350 390T487 365V560H128" fill="#bfd0aa"/>
  <path d="M128 470Q250 395 370 452T487 420V560H128" fill="#95b29a"/>
  <circle cx="365" cy="265" r="47" fill="#f2d293"/>
  <path d="M305 149v410M127 364h360" stroke="#e4d3b6" strokeWidth="15"/>
  <path d="M81 114q44 225 4 486l72 -5q-39 -243 10 -481zM446 114q55 241 11 481l72 5q-39 -241 4 -486z" fill="#d5c9ad"/>
  <rect x="1365" y="104" width="387" height="704" rx="9" fill="#9caa92"/>
  <rect x="1385" y="124" width="347" height="676" rx="5" fill="#526f61"/>
  <path d="M1412 151h290v272h-290zM1412 454h290v315h-290z" fill="none" stroke="#6e8977" strokeWidth="5"/>
  <circle cx="1570" cy="256" r="4" fill="#d1bd85"/>
  <rect x="1673" y="450" width="9" height="59" rx="4" fill="#d7c098"/>
  <path d="M1652 469h34" stroke="#dac49e" strokeWidth="8" strokeLinecap="round"/>
  <ellipse cx="1485" cy="863" rx="235" ry="44" fill="#a19677" opacity=".42"/>
  <ellipse cx="1485" cy="861" rx="208" ry="31" fill="none" stroke="#d0c2a2" strokeWidth="3"/>
  <rect x="690" y="173" width="160" height="200" fill="#b28c6b"/><rect x="703" y="186" width="134" height="174" fill="#f0e6cb"/>
  <path d="M740 336q-4 -64 24 -104m-17 65q-35 -9 -29 -40 27 -2 29 40m11 -27q31 1 34 -24 -29 -13 -34 24" fill="#91a087" stroke="#7b937b" strokeWidth="2"/>
  <circle cx="1100" cy="225" r="53" fill="#e9dcc0" stroke="#a99070" strokeWidth="6"/>
  <path d="M1100 194v31l22 11" fill="none" stroke="#667465" strokeWidth="4" strokeLinecap="round"/>
  <path d="M410 630h410v23H410z" fill="#a17657"/>
  <rect x="423" y="653" width="384" height="110" rx="3" fill="#bd9672"/>
  <path d="M440 761v101M789 761v101M614 663v86" stroke="#8c7056" strokeWidth="12"/>
  <circle cx="552" cy="699" r="4" fill="#6b6150"/><circle cx="684" cy="699" r="4" fill="#6b6150"/>
  <ellipse cx="553" cy="625" rx="50" ry="9" fill="#cebb94"/>
  <path d="M517 619q37 30 74 0" fill="#dbc7a4"/>
  <Plant x={445} y={601} s={.68} f={f}/><Plant x={1830} y={804} s={1.5} f={f}/>
  <g opacity=".25">{Array.from({length:12},(_,i)=><circle key={i} cx={160+i*84+Math.sin(f/70+i)*9} cy={240+(i*67+f*.24)%430} r={2+i%3} fill="#fffcdf"/>)}</g>
 </g>;
}

function Person({f}:{f:number}) {
 const walk=key(f,[143,155,222,239],[0,1,1,0]);
 const cycle=(f-150)/11;
 const stride=Math.sin(cycle)*24*walk;
 const bob=-Math.abs(Math.sin(cycle))*5*walk;
 const x=key(f,[0,145,240,449],[865,865,1215,1215]);
 const breath=key(f,[300,345,413,449],[0,1,0,0]);
 const lean=key(f,[0,42,86,145,235,300,390],[0,-5,2,2,0,0,-1]);
 const reach=key(f,[0,24,57,101,155,245,280],[15,15,0,-12,-10,-10,8]);
 const elbow=key(f,[57,101,245,280],[0,-145,-145,0]);
 const closed=(f>315&&f<387)||(f%117>109);
 return <g transform={`translate(${x} ${846+bob})`}>
  <ellipse cx="0" cy="14" rx="99" ry="16" fill="#516454" opacity=".17"/>
  <g transform={`rotate(${-stride} -25 -201)`}><path d="M-60 -226L-20 -224 -15 -119 -22 -12 -61 -12 -60 -121z" fill="#af795f"/><path d="M-61 -19l39 0 18 24q2 11 -20 11h-48q-11 -10 11 -35" fill="#4e574c"/></g>
  <g transform={`rotate(${stride} 28 -201)`}><path d="M5 -226L57 -226 54 -119 54 -12 15 -12 9 -124z" fill="#c18a6b"/><path d="M15 -19h40l22 23q4 12 -16 12H15q-10 -13 0 -35" fill="#39483f"/></g>
  <g transform={`rotate(${lean} 0 -205) translate(0 ${-breath*5})`}>
   <g transform={`rotate(${stride*.55+8} 48 -380)`}><path d="M39 -392Q72 -393 74 -354L80 -285 66 -270 43 -290 28 -355" fill="#768e72"/><path d="M65 -284l15 1 0 59q-5 18 -15 7l-3 -23z" fill={skin}/></g>
   <path d="M-53 -397Q0 -420 52 -397L66 -222Q0 -201 -68 -225z" fill="#91a383"/>
   <path d="M-26 -401Q0 -387 27 -401L33 -218H-32z" fill="#f0e5c9"/>
   <path d="M-26 -403l-14 35 11 31 -12 119M28 -403l17 38 -13 26 12 122" fill="none" stroke="#738d73" strokeWidth="3"/>
   <path d="M-22 -449h45v49q-19 24 -44 0z" fill={skin}/>
   <path d="M-22 -439q22 17 45 -2v13q-27 18 -45 -1z" fill="#cd987d"/>
   <g transform={`rotate(${key(f,[0,80,140,245,300,390],[0,-8,-8,0,-3,0])} 0 -453)`}>
    <path d="M-70 -489Q-85 -577 -34 -592Q25 -620 64 -565L79 -474Q53 -454 31 -465L-61 -460z" fill={hair}/>
    <ellipse cx="0" cy="-520" rx="56" ry="73" fill={skin}/>
    <ellipse cx="-52" cy="-518" rx="11" ry="17" fill={skin}/>
    <path d="M-58 -529Q-62 -588 -10 -590Q38 -594 60 -550Q10 -578 -11 -566Q-25 -537 -58 -529" fill={hair}/>
    <path d="M-54 -551Q-39 -524 -52 -476L-68 -484 -70 -545M42 -567Q60 -550 51 -501L64 -477Q77 -510 60 -557" fill={hair}/>
    <path d={`M-29 ${closed?-526:-533}q10 ${closed?5:-4} 19 0M12 ${closed?-526:-533}q10 ${closed?5:-4} 19 0`} stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round"/>
    {!closed&&<g fill={ink}><ellipse cx="-17" cy="-522" rx="3.4" ry="4.5"/><ellipse cx="24" cy="-522" rx="3.4" ry="4.5"/></g>}
    <path d="M5 -520l-4 16 7 2" stroke="#c18b70" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
    <path d={`M-9 -486q13 ${key(f,[250,410],[0,5])} 25 -1`} stroke="#a96b60" strokeWidth="2.7" fill="none" strokeLinecap="round"/>
    <ellipse cx="-32" cy="-502" rx="11" ry="5" fill="#d99780" opacity=".35"/><ellipse cx="35" cy="-502" rx="10" ry="5" fill="#d99780" opacity=".35"/>
    <path d="M-52 -565q25 -35 61 -20" stroke="#4d5346" strokeWidth="3" fill="none"/>
   </g>
   <path d="M35 -400Q-21 -364 -80 -252" stroke="#e7d9b7" strokeWidth="12" fill="none"/>
   <g transform={`rotate(${Math.sin(cycle-1)*walk*5} -73 -280)`}><path d="M-112 -290l77 5 9 110q-49 18 -94 -3z" fill="#e6d9b9"/><path d="M-106 -279l61 4 -2 81 -64 -3z" fill="none" stroke="#cdbf9d" strokeWidth="2"/></g>
   <g transform={`rotate(${reach} -48 -379)`}>
    <path d="M-59 -402Q-84 -398 -84 -366L-83 -297Q-68 -279 -47 -297L-33 -363Q-30 -393 -59 -402" fill="#9aab8d"/>
    <g transform={`rotate(${elbow} -65 -297)`}>
     <path d="M-78 -304l27 3 -4 57q-8 18 -19 4z" fill={skin}/>
     {f>=57&&<g transform={`translate(-65 -246) rotate(${-10-reach-elbow})`}><Phone/><path d="M-17 1q20 -7 21 2q-3 7 -21 8" fill={skin}/></g>}
    </g>
   </g>
  </g>
 </g>;
}

export const ContinuousSample:React.FC=()=> {
 const f=useCurrentFrame();
 const zoom=key(f,[0,120,250,315,449],[1,1.04,1.08,1.67,1.72]);
 const focusX=key(f,[0,145,240,315,449],[940,940,1120,1215,1215]);
 const focusY=key(f,[0,250,315,449],[520,520,425,425]);
 return <AbsoluteFill style={{background:'#eee5d3'}}>
  <svg viewBox="0 0 1920 1080" width="1920" height="1080">
   <defs><linearGradient id="wall" x2="1" y2=".7"><stop stopColor="#f3e9ce"/><stop offset="1" stopColor="#dfdac5"/></linearGradient><radialGradient id="edge"><stop offset=".4" stopColor="#493f2f" stopOpacity="0"/><stop offset="1" stopColor="#493f2f" stopOpacity=".15"/></radialGradient></defs>
   <g transform={`translate(960 540) scale(${zoom}) translate(${-focusX} ${-focusY})`}>
    <Room f={f}/>
    {f<57&&<g transform="translate(800 600) rotate(-10)"><Phone/></g>}
    <Person f={f}/>
   </g>
   <rect width="1920" height="1080" fill="url(#edge)"/>
  </svg>
  <Sequence from={15} name="原有晨间旁白"><Audio src={staticFile('audio/01-morning.mp3')}/></Sequence>
  <Sequence from={225} name="原有觉察旁白"><Audio src={staticFile('audio/02-pause.mp3')}/></Sequence>
  <Audio src={staticFile('audio/ambience.mp3')} loop volume={.06}/>
  {f>14&&f<210&&<div style={{position:'absolute',bottom:66,left:130,right:130,textAlign:'center',color:'#fff',fontFamily:'Microsoft YaHei',fontSize:40,lineHeight:1.6,textShadow:'0 2px 10px #273d31',opacity:key(f,[15,28,195,210],[0,1,1,0])}}>每天，我们忙着工作、照顾家人、安排生活。</div>}
  {f>224&&<div style={{position:'absolute',bottom:66,left:130,right:130,textAlign:'center',color:'#fff',fontFamily:'Microsoft YaHei',fontSize:40,lineHeight:1.6,textShadow:'0 2px 10px #273d31',opacity:key(f,[225,240,435,449],[0,1,1,0])}}>你有多久，没有问问自己：最近过得怎么样？</div>}
 </AbsoluteFill>;
};
