import React from 'react';
import {Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {theme} from './theme';

export const Caption:React.FC<{children:React.ReactNode; dark?:boolean}> = ({children,dark=false}) => {
 const f=useCurrentFrame(); const {durationInFrames}=useVideoConfig();
 const opacity=interpolate(f,[0,10,durationInFrames-10,durationInFrames],[0,1,1,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:Easing.out(Easing.quad)});
 return <div style={{position:'absolute',left:120,right:120,bottom:62,display:'flex',justifyContent:'center',opacity}}>
   <div style={{fontFamily:theme.font,fontSize:44,fontWeight:600,lineHeight:1.55,letterSpacing:1.5,textAlign:'center',color:dark?theme.ink:'#fff',background:dark?'rgba(250,248,241,.90)':'rgba(15,39,36,.72)',padding:'17px 36px 19px',borderRadius:20,boxShadow:'0 10px 38px rgba(0,0,0,.16)',maxWidth:1500}}>{children}</div>
 </div>;
};
