import React, { useEffect, useState } from 'react';
import { useSession } from './context';
import { StrokedText } from './primitives';
import { TOKENS } from '@snag/shared';
export function Timer({ deadline, total, paused, size = 104, width = 236, color, stroke = 8, shadow = 6 }: { deadline?: number; total?: number; paused: boolean; size?: number; width?: number; color?: string; stroke?: number; shadow?: number }): React.ReactElement {
  const session = useSession(), [seconds, setSeconds] = useState(0);
  useEffect(() => { const tick = () => { if (!paused) setSeconds(Math.max(0, Math.ceil(((deadline ?? session.clock.now()) - session.clock.now()) / 1000))); }; tick(); const id = setInterval(tick, 250); return () => clearInterval(id); }, [deadline, paused]);
  return <StrokedText contain text={String(seconds)} size={size} color={color ?? (seconds <= 10 ? TOKENS.red : TOKENS.paper)} stroke={stroke} shadow={shadow} width={width} align="center" />;
}
