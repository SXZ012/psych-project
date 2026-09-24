import React from 'react'; import {interpolate,spring,useCurrentFrame,useVideoConfig} from 'remotion'; import {SceneFrame} from '../SceneFrame'; import {Caption} from '../Caption';
export const Assessment=()=>{const f=useCurrentFrame();const {fps}=useVideoConfig();const pulse=spring({frame:f-80,fps,config:{damping:12,mass:.8}});return <SceneFrame src="scenes/04-assessment.png" pan="in" shade={.1}>
 <div style={{position:'absolute',left:762,top:465,width:105,height:105,border:'5px solid rgba(255,255,255,.88)',borderRadius:28,opacity:interpolate(f,[70,90,180,210],[0,.9,.9,0]),scale:.75+.35*pulse,boxShadow:'0 0 0 18px rgba(255,255,255,.13)'}}/>
 <Caption dark>现在，请花几分钟了解此刻的状态。先看操作示范，再跟随语音和画面，按照真实感受选择。</Caption>
 </SceneFrame>};
