import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {SceneFrame} from '../SceneFrame'; import {Caption} from '../Caption';
export const Morning=()=>{const f=useCurrentFrame();return <SceneFrame src="scenes/01-morning.png" pan="right" shade={.16}>
 <AbsoluteFill style={{background:`radial-gradient(circle at 83% 18%,rgba(255,222,151,${interpolate(f,[0,240],[.08,.28])}),transparent 34%)`}}/>
 <Caption>每天，我们忙着工作、照顾家人、安排生活。</Caption>
 </SceneFrame>};
