import { easingAt } from './motion';
/** Exact CSS walk/hop curves and negative delays from reference/src/style.css. */
export function paradePose(time: number, index: number) {
  const walk=((time+index*2.1)%16.8+16.8)%16.8;
  const leg=((time+index*.17)%.84+.84)%.84/.42;
  const p=easingAt('cubic-bezier(.3,0,.5,1)',leg<=1?leg:2-leg);
  const rotation=-7+13*p, sx=1.04-.04*p, sy=.96+.04*p;
  const angle=rotation*Math.PI/180;
  // RN transforms rotate about the center; CSS uses the bottom center.
  const dx=39*sy*Math.sin(angle), dy=39-39*sy*Math.cos(angle)-24*p;
  return {x:1340-walk/16.8*1470,dx,y:dy,rotation,sx,sy};
}
