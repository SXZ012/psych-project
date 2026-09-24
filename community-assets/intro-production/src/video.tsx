import React from 'react'; import {AbsoluteFill,Sequence,staticFile} from 'remotion'; import {Audio} from '@remotion/media';
import {Morning} from './scenes/Morning'; import {Pause} from './scenes/Pause'; import {Weather} from './scenes/Weather'; import {Care} from './scenes/Care'; import {Support} from './scenes/Support'; import {Assessment} from './scenes/Assessment'; import {Ready} from './scenes/Ready';
export const CommunityMentalHealth:React.FC=()=> <AbsoluteFill>
 <Sequence durationInFrames={210}><Morning/></Sequence>
 <Sequence from={210} durationInFrames={240}><Pause/></Sequence>
 <Sequence from={450} durationInFrames={330}><Weather/></Sequence>
 <Sequence from={780} durationInFrames={330}><Care/></Sequence>
 <Sequence from={1110} durationInFrames={270}><Support/></Sequence>
 <Sequence from={1380} durationInFrames={240}><Assessment/></Sequence>
 <Sequence from={1620} durationInFrames={180}><Ready/></Sequence>
 <Sequence from={15}><Audio src={staticFile('audio/01-morning.mp3')} volume={1}/></Sequence>
 <Sequence from={225}><Audio src={staticFile('audio/02-pause.mp3')} volume={1}/></Sequence>
 <Sequence from={465}><Audio src={staticFile('audio/03-weather.mp3')} volume={1}/></Sequence>
 <Sequence from={795}><Audio src={staticFile('audio/04-care.mp3')} volume={1}/></Sequence>
 <Sequence from={1125}><Audio src={staticFile('audio/05-support.mp3')} volume={1}/></Sequence>
 <Sequence from={1395}><Audio src={staticFile('audio/06-assessment.mp3')} volume={1}/></Sequence>
 <Sequence from={1635}><Audio src={staticFile('audio/07-ready.mp3')} volume={1}/></Sequence>
 <Audio src={staticFile('audio/ambience.mp3')} loop volume={0.075}/>
 </AbsoluteFill>;
