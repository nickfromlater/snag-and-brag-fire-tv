import React, { useEffect, useRef } from 'react';
import { Reanimated, useSharedValue, useAnimatedStyle } from './platform';
import { Sticker } from './primitives';
import { frameClock } from './frame-clock';
import { useReducedMotion } from './motion-settings';
import { easingAt } from './motion';
import { paradePose } from './parade-pose';
import { diag } from './diag';
import { idleLoopsOff } from './motion-settings';
const curve=Array.from({length:121},(_,i)=>easingAt('cubic-bezier(.3,0,.5,1)',i/120));
function Walker({obj,index,time,born}:{obj:string;index:number;born:number;time:import('@amazon-devices/react-native-reanimated').SharedValue<number>}):React.ReactElement{
  const walk=useAnimatedStyle(()=>({transform:[{translateX:1340-((time.value+index*2.1)%16.8)/16.8*1470}]}));
  const hop=useAnimatedStyle(()=>{
    const leg=((time.value+index*.17)%.84)/.42,t=(leg<=1?leg:2-leg)*120,i=Math.min(119,Math.floor(t)),p=curve[i]!+(curve[i+1]!-curve[i]!)*(t-i);
    const rotation=-7+13*p,sx=1.04-.04*p,sy=.96+.04*p,a=rotation*Math.PI/180;
    return {transform:[{translateX:39*sy*Math.sin(a)},{translateY:39-39*sy*Math.cos(a)-24*p},{rotate:rotation+'deg'},{scaleX:sx},{scaleY:sy}]};
  });
  return <Reanimated.View collapsable={false} style={[{position:'absolute',left:0,top:502,width:78,height:78},walk]}><Reanimated.View collapsable={false} style={[{width:78,height:78},hop]}><Sticker obj={obj} size={78} target={'parade:'+obj} parentMotion={now=>{const p=paradePose(now-born,index);return {x:p.x+p.dx+39,y:502+p.y+39};}}/></Reanimated.View></Reanimated.View>;
}
export function Parade({objects}:{objects:string[]}):React.ReactElement{
  const time=useSharedValue(0),born=useRef(frameClock.now()).current,reduced=useReducedMotion(),stopped=useRef(reduced||idleLoopsOff());stopped.current=reduced||idleLoopsOff();
  useEffect(()=>frameClock.subscribe((dt,now)=>{if(dt&&!stopped.current)time.value=now-born;},30),[born]);
  if(diag.noParade)return <></>;
  return <>{objects.map((obj,index)=><Walker key={obj} obj={obj} index={index} time={time} born={born}/>)}</>;
}
