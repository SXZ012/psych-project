import React from 'react';
import {AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

export const SceneFrame: React.FC<{src:string; children?:React.ReactNode; pan?:'left'|'right'|'in'; shade?:number}> = ({src,children,pan='in',shade=0.12}) => {
  const frame=useCurrentFrame(); const {durationInFrames}=useVideoConfig();
  const p=interpolate(frame,[0,durationInFrames],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:Easing.inOut(Easing.quad)});
  const x=pan==='left' ? 28-56*p : pan==='right' ? -28+56*p : 0;
  const scale=pan==='in' ? 1.02+0.055*p : 1.075;
  return <AbsoluteFill style={{overflow:'hidden',background:'#173f3a'}}>
    <Img src={staticFile(src)} style={{width:'100%',height:'100%',objectFit:'cover',scale,translate:`${x}px 0px`}} />
    <AbsoluteFill style={{background:`linear-gradient(180deg,rgba(10,35,32,${shade*.35}) 0%,rgba(10,35,32,0) 48%,rgba(10,35,32,${shade}) 100%)`}} />
    {children}
  </AbsoluteFill>;
};
