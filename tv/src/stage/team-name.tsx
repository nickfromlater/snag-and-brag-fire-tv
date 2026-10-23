import React, { useMemo } from 'react';
import { TOKENS } from '@snag/shared';
import { Svg, G, Path } from './platform';
import { teamGlyphCache } from './glyphs';
import { fitTeamName } from './team-name-math';

export function TeamName({ name, width, height = 38, size = 16, minSize = 16, color = TOKENS.ink, align = 'left', spacing = .6, reserveWidth = 0, lines = 2 }: {
  name: string; width: number; height?: number; size?: number; minSize?: number; color?: string; align?: 'left' | 'center'; spacing?: number; reserveWidth?: number; lines?: 1 | 2;
}): React.ReactElement {
  const plan = useMemo(() => fitTeamName(name, width, size, spacing, reserveWidth, minSize, lines), [name, width, size, spacing, reserveWidth, minSize, lines]);
  const naturalWidth = plan.scaleX < 1 ? width / plan.scaleX : width, lineHeight = plan.size * 1.08;
  return <Svg accessibilityLabel={name} width={width} height={height} viewBox={'0 0 ' + naturalWidth + ' ' + height} preserveAspectRatio="none">
    {plan.lines.map((line, i) => {
      const shape = teamGlyphCache.get(line, plan.size, plan.spacing);
      return <G key={i} x={align === 'center' ? (naturalWidth - shape.width) / 2 : 0} y={(height - plan.lines.length * lineHeight) / 2 + i * lineHeight - (shape.height - lineHeight) / 2}><Path d={shape.d} fill={color}/></G>;
    })}
  </Svg>;
}
