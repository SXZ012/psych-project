import React from 'react'; import {AbsoluteFill,interpolate,useCurrentFrame} from 'remotion'; import {SceneFrame} from '../SceneFrame'; import {Caption} from '../Caption';
export const Weather=()=>{const f=useCurrentFrame();const rain=interpolate(f,[0,130,330],[.3,.48,.08]);return <SceneFrame src="scenes/02-weather.png" pan="right" shade={.14}>
 <AbsoluteFill style={{opacity:rain,backgroundImage:'repeating-linear-gradient(105deg,transparent 0 34px,rgba(210,230,235,.38) 35px 37px,transparent 38px 68px)',translate:`0px ${f%68}px`}}/>
 <Caption>开心、紧张、疲惫，都是生活里常有的感受。心理健康，是能留意自己的变化，照顾自己的需要。</Caption>
 </SceneFrame>};
