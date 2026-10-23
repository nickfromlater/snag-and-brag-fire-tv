import React from 'react';
import { Box, Card, Label, PhotoSticker } from './primitives';
import { FeedImage } from './feed';
export function FixtureView(): React.ReactElement {
  return <Card x={40} y={115} width={1200} height={450}><Box x={25} y={20} width={1150}><Label size={30} weight={900}>Synthetic memory and mask probe</Label></Box><Box x={35} y={130} width={220} height={220}><PhotoSticker photoId="fixture" size={220} eyes={[[50,51],[70,51],8]}/></Box>{[0,1,2,3].map(i=><Box key={i} x={320+i%2*400} y={95+Math.floor(i/2)*155} width={380} height={145}><FeedImage index={i} width={380} height={145} label="Synthetic fixture"/></Box>)}</Card>;
}
