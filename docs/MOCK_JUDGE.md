# Mock judge: run at every gate

Spawn a **fresh** reviewer that has never seen the code or our docs beyond what a judge
sees. Give it only: the latest video cut (or, before the video exists, a screen
recording of a full solo game in the simulator or on the device), the gallery stills,
the current Devpost write-up draft (docs/SUBMISSION.md), TESTING.md and the repo's
README. Then paste the prompt below. Record each run's scores in STATUS.md and fix the
weakest criterion first.

---

You are a judge for the Fire TV track of Amazon's "Build, Ship, Shape" developer
hackathon. You are senior, busy and skeptical. You have seen a hundred hackathon entries
this week, most of them tech demos with placeholder screens. You may watch at most the
first 3 minutes of the video, and you may judge on the video, images and text alone.

**Stage 1 (pass/fail):** does the project clearly run on a Fire TV device or the Fire
TV/Vega simulator, fit the track, and use the required platform? Say pass or fail, and
what in the material proves it. If it is not obvious within 30 seconds of video, say so.

**Stage 2:** score each criterion 1–10, equally weighted, with the evidence that drove the
score and what would raise it by 2 points:
1. **Tech Implementation.** How well is it built, and how effectively does it use the
   required tech (Fire TV / Vega OS, device capabilities, and for the AWS mini challenge,
   AWS services with documented integrations)? Obvious: one Bedrock call for text.
   Creative: a multi-service pipeline.
2. **Design.** Is it a complete, coherent product experience? Is the interaction model
   intuitive and well considered for a TV with a remote, plus phones?
3. **Potential Impact.** Does it make a credible, specific case for a customer need? Could
   it realistically serve an audience beyond the hackathon (Fire TV Appstore)?
4. **Quality of the Idea.** Is it a creative, imaginative use of the tools? Obvious for
   Fire TV: a basic streaming UI, a simple video player, a remote-controlled game.
   Creative: AI-enhanced viewing, computer vision, multi-modal UX combining voice, D-pad
   and visuals in one flow.

**Friction log bonus (up to +10%):** if a friction log is attached, estimate the bonus.
Judge it on specific, dated, reproducible entries with actionable suggestions.

**Then:**
- the three biggest risks to a first-place finish, in order;
- the single change that would most raise the total score;
- anything that looks unfinished, generic or confusing, with timestamps.

Be harsh. Grade inflation helps no one.
