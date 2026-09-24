import React from 'react';
import {AbsoluteFill, Easing, Img, interpolate, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {Audio} from '@remotion/media';

const clamp = {extrapolateLeft:'clamp', extrapolateRight:'clamp'} as const;

const Sprite: React.FC<{
  src:string;
  frames:number;
  index:number;
  width:number;
  height:number;
  style?:React.CSSProperties;
}> = ({src,frames,index,width,height,style}) => (
  <div style={{position:'absolute',overflow:'hidden',width,height,...style}}>
    <Img
      src={staticFile(src)}
      style={{position:'absolute',left:-index*width,top:0,width:width*frames,height,display:'block'}}
    />
  </div>
);

const Subtitle: React.FC<{children:React.ReactNode; opacity:number}> = ({children,opacity}) => (
  <div style={{position:'absolute',left:120,right:120,bottom:58,display:'flex',justifyContent:'center',opacity}}>
    <div style={{fontFamily:'Microsoft YaHei, Noto Sans SC, sans-serif',fontSize:42,fontWeight:600,lineHeight:1.55,letterSpacing:1.2,textAlign:'center',color:'#fff',background:'rgba(29,47,39,.68)',padding:'15px 32px 17px',borderRadius:18,boxShadow:'0 8px 32px rgba(20,30,24,.18)'}}>{children}</div>
  </div>
);

export const ContinuousCharacterSample:React.FC = () => {
  const frame=useCurrentFrame();
  const walkFrame=frame<198?Math.floor(frame/4)%8:frame<220?8:9;
  const breathFrame=frame<270?0:frame<304?1:frame<338?2:frame<374?3:frame<410?4:5;
  const walkOpacity=interpolate(frame,[236,254],[1,0],clamp);
  const breathOpacity=interpolate(frame,[242,262],[0,1],clamp);
  const characterX=frame<198
    ? interpolate(frame,[0,198],[190,1060],clamp)
    : interpolate(frame,[198,220,242],[1060,1105,1125],{...clamp,easing:Easing.out(Easing.cubic)});
  const characterY=interpolate(frame,[0,198,242],[307,307,305],clamp);
  const stopLean=interpolate(frame,[198,220,242],[0,-3,0],clamp);
  const sceneScale=interpolate(frame,[0,220,260,449],[1.04,1.06,1.22,1.28],{...clamp,easing:Easing.inOut(Easing.cubic)});
  const sceneX=interpolate(frame,[0,220,260,449],[0,-12,-155,-205],{...clamp,easing:Easing.inOut(Easing.cubic)});
  const light=interpolate(frame,[250,340,449],[0,.12,.2],clamp);
  return <AbsoluteFill style={{background:'#d8c6a8',overflow:'hidden'}}>
    <AbsoluteFill style={{scale:sceneScale,translate:`${sceneX}px 0px`}}>
      <Img src={staticFile('story-v2/apartment-background.png')} style={{width:'100%',height:'100%',objectFit:'cover'}} />
      <AbsoluteFill style={{background:'linear-gradient(90deg,rgba(53,43,30,.08),transparent 35%,rgba(255,229,166,.05))'}} />
    </AbsoluteFill>

    <Sprite
      src="story-v2/walk-stop-v2-clean.png"
      frames={10}
      index={walkFrame}
      width={216.7}
      height={725}
      style={{left:characterX,top:characterY,opacity:walkOpacity,rotate:`${stopLean}deg`,filter:'drop-shadow(0 14px 12px rgba(45,38,27,.22))'}}
    />

    <Sprite
      src="story-v2/breath-cycle-alpha.png"
      frames={6}
      index={breathFrame}
      width={362}
      height={724}
      style={{left:1087,top:267,opacity:breathOpacity,scale:1.18,filter:'drop-shadow(0 14px 13px rgba(45,38,27,.18))'}}
    />

    <AbsoluteFill style={{background:`radial-gradient(circle at 70% 35%,rgba(255,236,180,${light}),transparent 35%)`}} />
    <AbsoluteFill style={{boxShadow:'inset 0 0 150px rgba(35,37,28,.18)'}} />

    <Sequence from={15} name="晨间旁白"><Audio src={staticFile('audio/01-morning.mp3')} volume={1}/></Sequence>
    <Sequence from={240} name="觉察旁白"><Audio src={staticFile('audio/02-pause.mp3')} volume={1}/></Sequence>
    <Audio src={staticFile('audio/ambience.mp3')} loop volume={.055}/>

    {frame<225 && <Subtitle opacity={interpolate(frame,[15,28,205,224],[0,1,1,0],clamp)}>每天，我们忙着工作、照顾家人、安排生活。</Subtitle>}
    {frame>=225 && <Subtitle opacity={interpolate(frame,[235,248,430,449],[0,1,1,0],clamp)}>你有多久，没有问问自己：最近过得怎么样？</Subtitle>}
  </AbsoluteFill>;
};
