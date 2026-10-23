# Lead taste notes, round 1 (Oct 20)

Good direction: bigger type and explicit instructions, and the hunt and lobby read better from the couch.
But several scenes are now busier and have **collisions**, and that isn't AAA. **Get clarity through
hierarchy and space, not more text.** When something doesn't fit, cut the secondary text; don't shrink it
or let it overlap.

## Global
1. **Zero overlaps or clipping, enforced by a check.** Extend `review-clarity.mjs` to fail on any text
   element that overflows its box (scrollWidth/scrollHeight greater than client) or any labelled text
   whose bounding box intersects another text box or a crown/avatar. Run it on all 20 states plus the
   long-name/4-team/2-team variants. Report the count in index.md (target: 0).
2. Keep the mockup's charm. Captions like "Eyeing the spatula?" and the host's lines are the
   personality; keep them, just make them legible.

## Per scene
- **Hunt:** the bigger team-name plates now cover the "CAM 1/2/3/4" labels. Drop the CAM labels or move
  them clear. Restore the flavor captions ("Eyeing the teddy bear?") at the new readable size, capped at
  about 22 characters (shorten the copy pool if needed, no ellipses), and show HUNTING/SNAGGED as a small
  status chip instead of replacing the caption.
- **Lobby:** the QR is the main way to join. Make it as large as the card allows (at least about 340 px
  at 1080p) with a white quiet zone. Shrink the raw cloudfront URL to one small secondary line (a
  real short domain is pending Nick). Keep SCAN TO JOIN and the code big.
- **Color Rush winner:** the MOST PINK: SOCK GOBLINS banner collides with the card tops and the crown,
  and "SOCK GOBL..." is clipped. The cards are now crammed (the points/INCL. SPEED stack, and the % bar
  spilling past the card's bottom edge). Go back to the mockup's clean card: object art, stage name,
  one line for the object, a bar with a **big match %** as the hero, and one small "+129" points chip
  (fold speed into a tiny "+30 speed" suffix or drop it here; standings already shows the bonus).
  Make the winner obvious by **treatment**, not text: lift and scale its card about 8%, add a
  team-color glow outline and the crown. Put the banner above the cards with clear space.
- **Finale:** the name plates collide with the podium numbers ("3" is hidden behind COUCH POTATOES)
  and crowd the avatars. The Object of the Night text clips at the card bottom. The 4th-place pill
  wraps awkwardly. Fix the spacing: plates go under each podium block or replace the PTS line inside
  it. Shorten the Object of the Night card to name, object and one line. The "82 POINT LEAD" pill is
  good; keep it clear of the trophy.
- **Mood per moment (static only, no new animation):** the mockup tints the Color Rush judge purple
  and the finale warm gold/orange; ours stay default blue. If the backdrop takes a static tint or
  palette prop cheaply (a one-time color, no per-frame work), match the mockup's finale gold and judge
  purple. Coordinate through a small additive stage prop. If it costs a frame, skip it and say so.

After fixing, regenerate the composites and the 10 ft views, update index.md, and write
`READY FOR LEAD REVIEW 2: docs/review/clarity` in STATUS.md.
