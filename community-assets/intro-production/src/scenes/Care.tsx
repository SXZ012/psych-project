import React from 'react'; import {AbsoluteFill,interpolate,useCurrentFrame} from 'remotion'; import {SceneFrame} from '../SceneFrame'; import {Caption} from '../Caption';
export const Care=()=>{const f=useCurrentFrame();return <SceneFrame src="scenes/03-connection.png" pan="left" shade={.14}>
 <AbsoluteFill style={{background:`radial-gradient(circle at 18% 10%,rgba(255,224,145,${interpolate(f,[0,360],[.06,.28])}),transparent 38%)`}}/>
 {[0,1,2,3,4,5,6,7].map(i=><span key={i} style={{position:'absolute',left:150+i*225,top:120+(i%3)*95,fontSize:24,color:'#f8df8d',opacity:.35,translate:`${Math.sin((f+i*29)/32)*18}px ${f*.18%210}px`,rotate:`${f+i*30}deg`}}>◆</span>)}
 <Caption>就像关心睡眠和身体一样，我们也可以关心情绪、精力，以及和他人相处时的感受。</Caption>
 </SceneFrame>};
