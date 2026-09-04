# Scifiifying a UI

A guide for an agent asked to make an interface look and feel like this one.

Read `AGENTS.md` in this repo first, and `AGENTS.md` in
[experimental-ui](https://github.com/amyleesterling/experimental-ui) if you
will be building anything new. This guide does not repeat their rules. It is
about the job those rules exist to serve: taking an ordinary interface and
making it belong here.

---

## The failure mode, stated first

Asked to scifiify something, the reflex is glow, scanlines, a monospace face,
a cyan border, and an `infinite` on every animation. That reflex produces
generic. It is the thing this repo was built against.

The character here is made of specific values that came from somewhere. A HUD
is `translate(4px,4px)` pushing outward to `translate(-7px,-7px)`, not "corner
brackets". A toast is six keyframes because twenty nine of the original thirty
five belonged to a different component in the same file. A loading cell grows
from the soma because every path is authored from its soma end outward.
Average those out by eye and you get glow with no character, which is exactly
what the first sign in dialog here was before it was rebuilt from the source.

So the job is not to apply a look. It is three jobs, in this order:

1. **Use what is already here.** Most of what a UI needs is built.
2. **Evolve it where the target asks for something adjacent.**
3. **Invent only what is genuinely absent,** and put it in the right repo.

Doing them out of order is how you end up with a fourth private copy of a
panel surface that already exists as `.holopanel`.

---

## 1. Use the system that exists

### Survey the target before you touch it

Write down what the interface actually does before deciding what it should
look like. For each region: is this a container, a status, a transition, a
celebration, a wait, or a piece of navigation? The component set is organised
by job, not by appearance, and the mapping falls out of the answer.

Then survey what you have. The fastest map of this library's animation
surface is its keyframe names:

```
grep -ho "@keyframes [a-zA-Z-]*" hologram.css components/*.css | sort -u
```

Ninety six keyframes across the set, and the names say what each one is for.
Read only the ones the names point at.

### Reach for these first

- **A surface for anything panel shaped**: `components/panel-surface.css`.
  `.holopanel` carries the dark gradient, the lit top hairline and the shared
  materialise entrance. Build on it rather than writing a fourth surface.
- **A container that should feel instrumented**: the holoframe, its corner
  brackets and `components/scan-pass.css`.
- **A wait**: `components/loader-neuron.js`. One clock, one cell, and it says
  "working" once rather than looping decoratively.
- **An arrival or a completion**: the achievement toast, `page-finale`,
  `trophy-orbit`, `streak-flame`. Note the split the source makes and this
  repo keeps: a streak or a milestone is a corner toast, a badge is a full
  screen `holoaward` takeover. Picking the wrong one reads as the wrong size
  of event.
- **Navigation through stages**: the step rail, and the real MICrONS viewers
  it drives.
- **Ambient life for a whole page**: `components/ambient.css` and `.js`, the
  five background layers on negative z.
- **The tap layer**: `hologram-tap.js`, which is not optional. See below.

### Three contracts you inherit the moment you use any of it

**Every hover state ships its tap path, in the same commit.** Every `:hover`
rule names `.holo-on` as a second selector. Every host in the tap list needs a
visible answer to that class, because being in the list is half the contract
and a host with no rule is a dead tap. Extend `:focus-within` at the same
time. This file is shared verbatim with experimental-ui, so do not change the
contract on one side alone.

**Only ambient things loop.** Everything else runs once. If you find yourself
typing `infinite`, the question is whether the thing is genuinely ambient or
whether you have just made a notification into a status light.

**Reduced motion has to land somewhere true.** Not frozen mid flight and not
switched off: the state the inputs would have reached. And the corollary that
is easy to miss, anything that is information rather than decoration keeps
working under the preference. A decaying unread mark still decays.

### Colour

Read `--holo-line`, `--holo-beam`, `--holo-cyan` and `--holo-warm` at start
rather than carrying a source's literals across. The numbers that make a
component behave the way it does, the pull, damping, radii and timings, are
carried exactly. Colour is the exception, because a hardcoded triplet is
correct for the one site it came from and wrong for every page this library
lands on.

Keep the field cool with one warm accent. `--holo-cyan` is a second scoped
cool accent, not a synonym for `--holo-line`. `--holo-viol` is the dialog rim
only.

If you borrow a whole page's worth of CSS, scope its variables to the
component root rather than adopting them into `:root`. That is why the MICrONS
viewer tokens live on `.mviz`.

---

## 2. Imagine its evolution

The system is not finished, and the ways it grows are already visible in its
history. If the target UI needs something adjacent to what exists, these are
the moves, in rough order of preference.

**Look for the companion before writing one.** If a component looks like it
needs a partner, search the set. The card wanted corner brackets, and the
brackets already existed on the frame with a character that was the whole
point of them. Writing a second, static, two corner version is how a rule gets
broken by someone in the middle of reading the rule.

**A downstream product that grew choreography on top of a port is a source.**
ng-extend's tag panel originally ported this library's materialise and swarm,
evolved its own light choreography in production, and that choreography came
back as `scout-trace.js`. Consumers are sources. whatisabrain and human brain
both vendor this library and both grew elements worth porting back. If the UI
you are scifiifying already uses this set and has grown something on top of
it, that growth is shipping code and porting it back is exactly what the rule
asks for.

**Extract a primitive when the third copy appears, not the second.** The panel
surface became `.holopanel` when it had been written privately several times.
The dialog and the toast still carry their own surfaces, deliberately, because
neither is broken. Fold them on the next time either is opened up. Refactoring
a working component to prove a point is a cost with no reader.

**Carry a component across whole, including its coordinate system.** Code,
assets, and the paths it fetches with. Re-pathing is how a carried across
component breaks. The MICrONS meshes sit at the site root exactly as they do
in the source for that reason.

**Let laziness drive.** If a component already declines to load until an
observer says it is on screen, switch it with `display`, not opacity. A
`display: none` card never trips its observer, so only the visible one costs
anything.

**The known debt is a roadmap.** The shared accent appears upstream at eleven
different alphas. One accent token plus a defined alpha ladder would collapse
a lot of it. That is a real job waiting, not a note.

**When you delete a demo, keep what it taught.** The attract loop is gone as a
section, but its one real idea, walk on a dwell and hold the moment someone
touches it, moved onto the step rail. Removing a demo is not the same as
removing its mechanism.

---

## 3. Create new variations

### First, which repo

The split is the reason both repos are readable, and it is absolute.

- Ported from software that actually ships, with the real numbers: **scifi-ui**.
- Original, invented, computed from a model: **experimental-ui**.

Never approximate something that exists elsewhere and call it extracted. If
you cannot find the source, say so rather than inventing a plausible version.
And before you conclude the source is out of reach: a built front end ships
`.map` files whose `sourcesContent` carries the real templates and the real
compiled CSS. That is how the researcher profile went from a recreation to the
actual component. Look for the map before you reproduce anything by eye.

**Demo data may be invented. Demo chrome may not.** The panel a ported
animation plays inside is part of the port. Carry the real chip, the real HUD,
the real report structure. Names, counts and dates can be made up. The layout
around them cannot. Three components broke this in one sweep and all three
read wrong on sight to the person whose designs they are.

### For an original component, motion has to earn its place

The test: does it do a job an easing curve could not? Carry state, encode a
real quantity, or produce structure you would otherwise hand author. A model
used because it sounds impressive is worse than a transition, because it costs
more and says less.

A spring carries position and velocity, so a control grabbed halfway through
already has an answer. Coupled oscillators produce coherence, which is a real
state worth showing. A travelling packet gives waiting a direction.

**Prefer a control that can take the evidence away.** A demo that can only
show the good state is a claim. One that can show the degraded state beside it
is a demonstration, and it usually costs one toggle. Registration off, gradient
off, collapse to a matrix.

### The mechanics that make it feel good

These are cheap, they are all already in the set, and they do not stack. One
felt moment per event.

- **Chase, do not jump.** `disp += (truth - disp) * (1 - exp(-dt * k))`, and
  the loop stops on settle. Keep truth and display as separate variables:
  aria values and readouts report the truth, paint draws the chase. The settle
  is most of the satisfaction, so never clamp it away.
- **Completions arrive, they do not stop.** Done is a state with its own look,
  not the absence of the busy look.
- **Celebrate once.** Always a one shot, never a loop. Suppressed entirely
  under reduced motion, while the state it celebrates still lands.
- **Draw marks, do not fade them in.** `stroke-dashoffset` with
  `pathLength="1"`, so the stylesheet needs no measured lengths.
- **Settle as a cascade.** Siblings moving to one target each get their own
  time constant, differing by depth, so the cascade means something.
- **Spend time at the moment of meaning.** Shape the timing so the instant
  that matters gets the most of it.

### Naming, and the promotion path

Grep the set before naming anything. Two base classes colliding is invisible
until a page loads both stylesheets, and that day is when a page tries to be
complete. `.holorail` met `.holorail` exactly this way.

A new idea can start as a sketch on a shared page rather than a component. The
moment it is wanted in a second place, extract it into its own file pair with
the full contract. A canvas a script sizes from its container must always carry
the CSS pinning it back, and a section lifted onto another page must bring that
CSS with it. Two canvases once grew to 38,000 pixels because it did not.

---

## 4. Verify, because most of this is invisible

Assert on behaviour, not on the stylesheet, whenever a real browser is
available. Say which you did, and say plainly what you did not see.

**Measure, do not eyeball.** Two dark screenshots read as identical while the
canvas pixel means differed by exactly the damp factor between them. If you
are claiming a thing got denser, brighter, faster or more converged, produce
the number. State what the statistic would look like if the component were
broken: particles that respawn at the edges hold a constant mean distance to
their target, so watching that mean fail to fall proves nothing. Compare
against a uniform scatter over the same canvas instead.

**Always check overflow.** `scrollWidth` must equal `clientWidth` at 375 and
1280, measured with any page level `overflow-x: hidden` turned off so the
result is not masked, and measured in the active state with every tappable
lit. Un-hiding a hover treatment on a small screen is precisely how overflow
gets reintroduced.

**Verify the assumption a guard is built on before you keep paying for it.**
The trace canvas was hidden below 700px on the theory its overhang would
scroll the page. It would not: the frame sits inside the wrap's gutter with
eight pixels to spare. A width guard that turns a feature off entirely
deserves a second look.

**Budget height, not width.** When fitting demos to a window, cap the height
and let the stage take its column. Capping a fixed aspect by height narrows
everything and leaves gutters, which is the opposite of what was wanted.

---

## 5. Traps that have already cost hours

Each of these was paid for once.

**Your checkout may be stale, and a stale source produces a confident wrong
port.** Two ports in one session were built against checkouts 59 and 751
commits behind, and both had to be rebuilt. Read the file from
`origin/main` with `git show origin/main:path` before porting, every time.

**Headless Chromium reports `prefers-reduced-motion: reduce` by default.**
Every sweep and entrance silently never runs, and the test passes while
measuring nothing. Pass `reducedMotion: "no-preference"` explicitly.

**Reduced motion means no animation, not no interaction.** A pointer
interaction bound only in the animated branch leaves those users with a
feature that does not exist. Bind it in both, and show the settled result
instead of the journey.

**A response too slow to notice reads as broken.** A dish that followed the
cursor correctly moved three percent of its width in the first two seconds and
took ten to arrive, which is indistinguishable from a dish that ignores you.
If an interaction is meant to feel like a response, measure its time to
legible, not just its correctness.

**Decorative overlays intercept pointer events.** Anything painted over a
control needs `pointer-events: none`, or the control quietly stops working.

**iOS drops transform animations on an element that is itself a plane in a
`preserve-3d` scene.** Animate a flat `::before` inside the plane instead.

**Feeding a wrapped angle to a transitioned `rotate()` unwinds a full turn at
the wrap point.** Feed the unwrapped angle and wrap only for readouts. This is
why a compass jumped between 355 and 002 degrees.

**A CSS animation only restarts when its computed name changes.** A state
class that never comes off is a replay that can never happen. A pseudo element
cannot be reliably restarted by re-adding a class at all: alternate two
identically drawn but differently named classes. A real element can be
restarted the classic way, animation to none, one reflow, hand it back.

**`hidden` loses to a base `display: flex` or `block`.** Spell out
`.thing[hidden] { display: none !important }` whenever the base rule sets a
display.

**Auditing the tap contract with the CSSOM silently passes if the walker is
wrong.** In current Chrome a plain `CSSStyleRule` exposes an empty `cssRules`
list, so a walker that recurses on truthiness returns early on every style
rule and reports zero problems. Test `selectorText` first and only recurse
when `cssRules.length` is non zero. Serve the directory, since `cssRules`
throws on `file://`.

**Normalised fractions are not a coordinate system.** Multiplying a 0 to 1
coordinate by width and height separately stretches the shape by the box
aspect. Anything that must keep its proportions needs a square space fitted in
the canvas. Anything that must move at one speed in both axes needs both axes
measured in the same unit.

**Offsetting a centreline needs the normal, not the tangent.** For a point at
angle `a` the outward normal is `(cos a, sin a)`. Written with a stray
`+ Math.PI / 2` it looks like a thickness bug and is a direction bug.

---

## Non-negotiables, in one place

- **No authentication, ever.** No `<form>`, no field with a `name`, nothing
  submitted. Say "visual component only" in the copy.
- **No third party logos or wordmarks.**
- **Nothing may imply it is showing a measurement** unless it is. Where a
  component borrows from published work, name the work and say the drawing is
  schematic.
- **Respect `prefers-reduced-motion`** in every component, verified by
  stubbing the preference rather than assuming the media query works.
- **Accessibility is not optional**: real anchors with real `href`s, labelled
  controls, `aria-pressed` and `aria-expanded` where they apply, live values
  on meters and progress bars, visible focus, focus restored on close.
- **No em or en dashes in any prose.** Commas and periods.

---

Version 1, 2026-09-04. Drafted from AGENTS.md v10 in this repo and v5 in
experimental-ui, plus the traps from the sessions since. Version this file the
way the AGENTS files are versioned: when you learn something a future agent
would otherwise pay for again, add it and bump the version.
