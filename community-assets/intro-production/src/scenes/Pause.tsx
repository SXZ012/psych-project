import React from 'react'; import {interpolate,useCurrentFrame} from 'remotion'; import {SceneFrame} from '../SceneFrame'; import {Caption} from '../Caption';
export const Pause=()=>{const f=useCurrentFrame();return <SceneFrame src="scenes/01-morning.png" pan="left" shade={.2}>
 <div style={{position:'absolute',inset:0,background:`rgba(31,73,68,${interpolate(f,[0,55,240],[0,.18,.04])})`}}/><Caption>你有多久，没有问问自己：最近过得怎么样？</Caption>
 </SceneFrame>};
