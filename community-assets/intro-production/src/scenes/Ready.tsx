import React from 'react'; import {AbsoluteFill,Easing,interpolate,useCurrentFrame} from 'remotion'; import {theme} from '../theme';
export const Ready=()=>{const f=useCurrentFrame();return <AbsoluteFill style={{fontFamily:theme.font,background:'linear-gradient(135deg,#f7f3e9,#dce9df)',alignItems:'center',justifyContent:'center',color:theme.ink}}>
 <div style={{position:'absolute',width:720,height:720,borderRadius:'50%',border:'2px solid rgba(40,109,99,.16)',scale:interpolate(f,[0,210],[.72,1.25]),opacity:interpolate(f,[0,130,210],[.1,.45,0])}}/>
 <div style={{fontSize:82,fontWeight:700,letterSpacing:4,opacity:interpolate(f,[0,24],[0,1],{extrapolateRight:'clamp',easing:Easing.out(Easing.cubic)}),translate:`0px ${interpolate(f,[0,30],[25,0],{extrapolateRight:'clamp'})}px`}}>了解此刻的自己</div>
 <div style={{fontSize:42,marginTop:35,color:theme.teal,opacity:interpolate(f,[28,55],[0,1],{extrapolateRight:'clamp'})}}>这不是考试 · 没有标准答案</div>
 <div style={{fontSize:34,marginTop:72,color:'#53716c',opacity:interpolate(f,[65,95],[0,1],{extrapolateRight:'clamp'})}}>测评用于了解当前状态，不代替专业诊断</div>
 <div style={{marginTop:62,fontSize:46,fontWeight:700,color:'#fff',background:theme.teal,padding:'20px 54px',borderRadius:999,boxShadow:'0 16px 38px rgba(40,109,99,.24)',scale:interpolate(f,[100,130],[.88,1],{extrapolateRight:'clamp'}),opacity:interpolate(f,[100,125],[0,1],{extrapolateRight:'clamp'})}}>准备好，我们就开始</div>
 </AbsoluteFill>};
