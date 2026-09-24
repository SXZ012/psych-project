import React from 'react';
import {Composition} from 'remotion';
import {CommunityMentalHealth} from './video';
import {ContinuousSample} from './story-v2/ContinuousSample';
import {ContinuousCharacterSample} from './story-v2/ContinuousCharacterSample';

export const VideoRoot: React.FC = () => (
  <>
    <Composition id="CommunityMentalHealth" component={CommunityMentalHealth} durationInFrames={1800} fps={30} width={1920} height={1080} />
    <Composition id="ContinuousSample" component={ContinuousSample} durationInFrames={450} fps={30} width={1920} height={1080} />
    <Composition id="ContinuousCharacterSample" component={ContinuousCharacterSample} durationInFrames={450} fps={30} width={1920} height={1080} />
  </>
);
