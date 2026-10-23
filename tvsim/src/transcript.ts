import type { CueEvent, TvCue } from '@snag/shared';
import { JUDGE_MASK_CELLS, isJudgeMask } from '@snag/shared';

function maskSummary(mask: string | undefined): string {
  if (!isJudgeMask(mask)) return '';
  const bytes = Buffer.from(mask, 'base64');
  let onCells = 0;
  for (let bits of bytes) for (; bits; bits >>>= 1) onCells += bits & 1;
  return ` mask=${JUDGE_MASK_CELLS}x${JUDGE_MASK_CELLS} bytes=${bytes.length} onCells=${onCells} valid=true`;
}

/** Explicit summaries keep ALL image bytes, photo URLs, room keys and reconnect keys
 * and encoded masks out of logs. Never replace this with JSON.stringify(TvView)
 * or raw relay frames. A mask summary contains only dimensions and an on-cell count. */
function detail(c: TvCue): string {
  switch (c.k) {
    case 'scene': return `${c.from} -> ${c.scene} wipe=${c.durationMs}ms swap=${c.swapAtMs}ms`;
    case 'phase': return c.phase + (c.total === undefined ? '' : ` timer=${c.total}ms`);
    case 'music': case 'background': return c.mood;
    case 'sfx': return `${c.name}(${c.args.join(',')}) delay=${c.delayMs}ms`;
    case 'host': return `${c.line.trigger} brow=${c.line.brow} type=${c.typingMs}ms hold=${c.line.hold}ms: ${c.line.text}`;
    case 'host-finish': return c.text;
    case 'host-hide': return `${c.durationMs}ms`;
    case 'host-brow': return c.brow;
    case 'host-react': return `${c.mood} ${c.durationMs}ms`;
    case 'slam': return `${c.target} rot=${c.rotation} from=${c.from} shake=${c.shakePx}px ring=${c.ring} ${c.durationMs}ms delay=${c.delayMs}ms`;
    case 'pop': return `${c.target} rot=${c.rotation} fromRot=${c.fromRotation} spring=${c.spring} delay=${c.delayMs}ms`;
    case 'animate': return `${c.target} ${c.spring ? 'spring=' + c.spring : c.durationMs + 'ms'} delay=${c.delayMs}ms ${c.frames.map(f => f.transform ?? f.xPercent ?? f.width ?? f.top ?? f.left ?? f.opacity).join(' -> ')}`;
    case 'shake': return `${c.px}px ${c.durationMs}ms`;
    case 'flash': return `opacity=${c.opacity} ${c.durationMs}ms`;
    case 'punch': return `scale=${c.scale} ${c.durationMs}ms`;
    case 'eyes': return `${c.target ?? 'all'} power=${c.power}`;
    case 'confetti': return `n=${c.count} power=${c.power} angle=${c.angle.toFixed(2)} delay=${c.delayMs}ms`;
    case 'stars': return `n=${c.count} color=${c.color}`;
    case 'ring': return `radius=${c.radius} color=${c.color}`;
    case 'firework': return `rocket -> (${Math.round(c.x)},${Math.round(c.y)}) ${c.color} burst=${c.burst.count}`;
    case 'reel': return `${c.cards.length} cards ${c.durationMs}ms -> ${c.cards.at(-1)!.b}`;
    case 'count': return `${c.target} ${c.text} ${c.animation.durationMs}ms`;
    case 'feed': return `${c.team} ${c.state}: ${c.label} thumbnail=${c.thumbnail}`;
    case 'find': return `${c.find.team} #${c.order} ${c.find.missed ? "Didn't snag" : c.find.obj ? 'object=' + c.find.obj : 'memory photo'}: ${c.find.name}${maskSummary(c.find.mask)}`;
    case 'card-flip': return `${c.team} ${c.animation.durationMs}ms`;
    case 'scan': return `${c.team} beam=${c.beam.durationMs}ms pixels=${c.pixels.size}x${c.pixels.size}`;
    case 'meter': return `${c.team} ${c.match}% +${c.speedBonus} speed ${c.durationMs}ms`;
    case 'fly-points': return `${c.team} +${c.pts} -> chip ${c.durationMs}ms delay=${c.delayMs}ms`;
    case 'sticker-flight': return `${c.team} phone -> slot eyes=${c.eyes} ${c.durationMs}ms arc=${c.middle.arc}`;
    case 'parade': return c.objects.map(o => o.obj).join(',');
    case 'score': return `${c.team} ${c.from} -> ${c.total} leaders=${c.leaders.join(',')}`;
    case 'roll': return `${c.target} ${c.from} -> ${c.to} ${c.durationMs}ms`;
    case 'match': return `${c.kicker}: ${c.left} vs ${c.right} +${c.points}${c.bye ? ' bye=' + c.bye : ''}`;
    case 'mash': return `p=${c.p.toFixed(3)} elapsed=${Math.round(c.elapsedMs)}ms taps=${Object.entries(c.taps).map(([t, n]) => `${t}:${n}`).join(',')}`;
    case 'mash-tap': return `${c.team} side=${c.side} +${c.n} combo=${c.combo}`;
    case 'mash-spark': return c.colors.join(',');
    case 'vote': return `${c.voter} -> ${c.team} chip flight=${c.durationMs}ms arc=${c.arc}`;
    case 'hologram': return `${c.team} ${c.on ? 'on' : 'off'}`;
    case 'reaction': return `${c.team ?? 'crowd'} ${c.kind} hype=${c.hype}`;
    case 'hype': return String(c.value);
    case 'menu': return c.menu ? `${c.menu.kind} [${c.menu.options.join(' | ')}] focus=${c.menu.focus}` : 'closed';
    case 'pause': return c.paused ? 'paused' : 'resumed';
    case 'settings': return `sound=${c.sound} music=${c.music}`;
    case 'game-ended': return 'return to lobby; finds cleared';
    case 'complete': return 'three rounds finished';
  }
}
export function formatCue(event: CueEvent, origin: number): string {
  return `[${((event.at - origin) / 1000).toFixed(3).padStart(7, '0')}] #${String(event.seq).padStart(4, '0')} r${event.round < 0 ? '-' : event.round === 3 ? 'F' : event.round + 1} ${event.cue.k}: ${detail(event.cue)}`;
}
