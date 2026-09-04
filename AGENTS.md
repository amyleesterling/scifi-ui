# AGENTS.md, version 10

Durable working knowledge for any agent contributing to **scifi-ui**. Read this
before writing a line. It exists because the same lessons were being relearned
from scratch every session, and because the knowledge that makes this repo good
was previously held only in one machine's private memory, unversioned.

Version this file. When you learn something a future agent would otherwise pay
for again, add it and bump the version at the bottom.

---

## 1. What this repo is

A dependency free hologram and HUD component set for a dark page. No build step,
no framework, no CDN. Live at https://amyleesterling.github.io/scifi-ui, deployed
by pushing `main`.

- `hologram.css` + `hologram.js` + `index.html`: the main set and its demo.
- `components/`: one file per part, plus its own demo page. Split per file so a
  reader can take one component without the set, and so parallel agents do not
  collide on a single file.
- `media/`: real 3D neuron renders, used as the content inside the frames.

## 2. The rule that makes it worth anything

**Extract components from code that actually ships. Never approximate them.**

Open the real file, read the whole stylesheet, carry the real numbers across. The
first sign in dialog here was built from memory of how it looked and was wrong on
sight. A HUD is made of specific values, and eyeballing them averages the
character out into generic glow.

If you cannot find the source, say so rather than inventing a plausible version.
When a port must deviate, write down the deviation and its cause. There are only
three in the repo, all documented in the README.

Upstream sources: **ng-extend / EyeWire II** (login modal, tutorial callout,
achievement toast, confetti, icon rail, the Nurro balloon rise), **Inner Cosmos**
(step rail), **FlyWire neuron gallery** (loader, panel boot, underline, scan
sweep, section rail, image card), **whatisabrain.com** (tinted lift card).

## 3. Porting discipline

**Only ambient things loop.** Everything else runs once. A closed `<dialog>` is
`display: none`, so a one-shot entrance costs nothing; an infinite animation runs
forever on a page nobody is looking at. Applying this rule cut the achievement
toast from 35 keyframes to 6, and it killed the badge image's `infinite
alternate` drop shadow, which made a notification read as a status light.

**Cut the spectacle that happens to share the file.** About 21 of that toast's 35
keyframes belonged to full screen hero and batch overlays living in the same
component: a 72 particle halo, 24 orbital dots, 8 prismatic rays, 50 dust motes,
three rotating rings, two shockwaves, a hex grid drift, a conic border spin. None
of it is the toast.

**Strip what makes a component a bad library citizen.** Global `Enter` capture
that would swallow submits on a host form. Unrequested Web Audio. Full screen
overlay blockers. `!important` on every declaration, which is correct for a
browser extension fighting a host DOM and wrong for a library.

**Fix the bugs you find, and say you did.** The original toast clipped its own
subtitle with `white-space: nowrap`. The confetti sized to `100vw`, which includes
the scrollbar, and ignored `prefers-reduced-motion`. The tutorial beak drifted off
its target after clamping.

## 4. Techniques worth keeping

**The balloon rise is two nested elements, deliberately.** Outer rises linearly to
`-120vh` over 8s; inner sways sideways and rotates on its own 3s loop. Separating
them means the sway never fights the rise, and you get organic drift from two
trivial keyframe sets. One element trying to do both is the usual mistake. Note
the opacity hold at 85 percent: it stays opaque almost the whole way and fades
only at the end, so it does not look like it is dissolving as it travels.

**Cursor repulsion needs no animation loop.** Set `transform` on `pointermove` and
let a CSS transition ease it. Costs nothing when the mouse is still.

**Compute an observer's active section from geometry, not from the entry list.** A
heading is thin enough to sit between two crossings with nothing intersecting at
all.

**A drag's trailing click needs a deadline, not a flag.** A drag ending on the
rail rather than on a tick produces no click to consume a boolean, so the flag
stays set. Use a 300ms deadline. Also move focus to the element you drop on, or
focus is left on something with `tabindex="-1"` that is no longer `aria-current`.

**The single tip trace and the twin tip trace are different components.** The
FlyWire card carries one head covering a quarter turn, full circle every 3.4s,
revealed on hover. The twin head version, two heads 180 degrees apart running
45deg to 225deg, is that project's lightbox panel and is already here as the
`.holoboot` border sweep. Do not merge them or re-add a duplicate.

**Give every canvas effect a teardown backstop.** A `requestAnimationFrame` loop
that tears down inside itself never tears down if the first frame never arrives,
and a full screen canvas then sits over the page for its lifetime. Use a timeout.

**Two components must never share a base class, or loading both on one page
breaks both.** The icon rail shipped as `.holorail`, the exact class the section
rail already owns in `hologram.css`. Alone on the components demo it looked
fine; the moment the main page loaded both stylesheets the two base rules
collided, one a fixed vertical rail and the other a flex toolbar, each element
getting the other's `position`, `display` and `background`. The fix was to
rename the newer one to `.holoiconrail`. Before naming a component's class, grep
the set for it: the collision is invisible until the day someone uses both, and
that day is when a page tries to be complete.

**A CSS animation only restarts when its computed name changes, so a state class
that never comes off is a replay that can never happen.** `.holoboot.is-online`,
`:hover` and `.holo-on` all apply the same boot animation, and with `is-online`
left on forever the computed value never changed, so the page promised a boot on
every hover and tap and delivered one boot ever. The fix is to take the class
back off at `animationend`, and to wait for the longest of the animations it
drives, the 1500ms ring sweep, not the 900ms entrance, or the sweep is cut off
mid run. Same for the underline's `is-drawn`. If a one-shot class also has hover
and tap selectors, ask where the class comes off.

**Two transforms on one element can share it if they use different properties.**
The mote repulsion writes an inline `transform` and the ambient drift animates
the `translate` property, and the two compose instead of fighting. The masthead
uses the same trick the other way round, centred with `translate` so the boot
animation is free to own `transform`.

## 5. Every hover state ships its tap path, in the same commit

**A hover treatment behind `@media (hover: none)` is not a decision, it is a
group of users getting a static page.** The library used to hide the HUD, the
scan sweep and the motes on touch and call it tidy. It was not tidy: it was the
whole point of the component, withheld.

The mechanism is one file, `hologram-tap.js`, and one class, `holo-on`.

- A tap puts `holo-on` on the nearest activatable ancestor and takes it off the
  previous one. One element is lit at a time, and tapping nothing in particular
  puts it out.
- Every `:hover` rule in the library names `.holo-on` as a second selector.
  `.holocard:hover` is `.holocard:hover, .holocard.holo-on`. This is mechanical:
  if you write a hover rule and do not add the class, that state is unreachable
  on a phone, and the omission is invisible on your desk.
- The activatable list is the containers, not the controls. A button already has
  `:active` and `:focus-visible`, and one left sitting in its hover state after a
  tap reads as a stuck toggle. Add a container of your own with `data-holo-tap`.
- **Never swallow the tap.** `preventDefault` is not called anywhere in that
  file, and a tap that landed on a real link or button is not turned into an
  activation at all, it is left to the control. A tap on the link inside a lit
  card does not put the card out either.
- `pointerdown` plus `pointerup`, never `touchstart`, with a 10px movement
  guard, a 700ms press guard, and a `pointercancel` and `scroll` bail. A tap
  that is the start of a scroll must light nothing.
- A mouse is untouched. The gate is the pointer type that produced the event
  plus a live `(hover: none)` check, so touch on a hybrid laptop works and a
  mouse on a touchscreen does not leave a card stuck looking hovered.
- Whatever answers to hover and tap also answers to focus. Extend
  `:focus-within` at the same time.
- `prefers-reduced-motion` still wins. Add the class selector to the reduced
  motion kill rules too, or a tap resurrects the animation the preference
  suppressed.
- If a hover state is more than a stylesheet, listen for `holotap:on` and
  `holotap:off`. They bubble and carry `clientX`, `clientY` and `pointerType`.
  The particle trace strikes its light at the tap point that way, and the
  achievement toast holds its real timer, since a rail paused while the
  countdown it reports keeps running is a lie.

One thing is deliberately hover only, the `.holoswarm` repulsion. A tap cannot
say "the pointer is here and travelling", which is the entire input the effect
reads, and no listener is bound where there is no hover. What every device gets
instead is the ambient drift, a few pixels of slow wander on the `translate`
property, allowed to loop because it is ambient.

**When a component stops being absolutely positioned at a breakpoint, its
parent's fixed height has to go with it.** A static child cannot grow a fixed
height parent, so it overflows and paints over whatever follows. That is exactly
how the phone masthead came to sit on top of the first section: `.top` kept
`height: min(44vh, 320px)` while `.masthead` went `position: static` inside it.
The height belongs on the image and on the layers pinned over the image, and the
container goes `height: auto`.

## 6. Tokens

`--holo-line` is the primary cool stroke. `--holo-cyan: 126 224 255` is a
**second, scoped** cool accent from the FlyWire gallery, not a synonym. `--holo-viol`
is the dialog rim only. Keep the field cool with one warm accent.

Known debt: the shared accent `rgba(74,158,255, x)` appears upstream at eleven
different alphas (0.01, 0.015, 0.04, 0.08, 0.1, 0.12, 0.15, 0.18, 0.2, 0.28,
0.4). One accent token plus a defined alpha ladder would collapse a lot of it.

The dark gradient panel surface, once unextracted, now is: `.holopanel` in
`components/panel-surface.css` carries the surface, the lit top hairline and the
shared materialise entrance (opacity 0, a small rise and shrink, a blurred
overbright bloom that settles), and the profile panel in
`components/profile-panel.css` is the first thing built on it rather than a
fourth private copy. It wins on its own weight with no `!important`; a library
has no host DOM to fight, which is the only reason the upstream profile panel
forced its rules. The dialog and the toast still carry their own surfaces for
now, because both predate the primitive and neither is broken; fold them onto
`.holopanel` the next time either is opened up, not before.

## 7. Verification, and its hard limit

**You almost certainly cannot see any animation play.** The browser pane reports
`document.hidden`, so it composites no frames: `requestAnimationFrame` never
fires, `IntersectionObserver` never delivers, `scrollIntoView({behavior:'smooth'})`
never progresses, screenshots time out, and CSS animations report
`playState: "running"` with `startTime: null`.

So do not claim an animation visually plays. Verify what you actually can:
computed styles, durations, fill modes, timers, cleanup, focus order, the CSSOM.
Then say plainly what you did not see. Amy has to eyeball motion in a real window.

Two real bugs were found only because of this limitation, so treat it as a test
surface rather than an obstacle: smooth scrolling silently no-oped, and the
confetti canvas leaked.

One consequence to expect: an entrance using `animation-fill-mode: both` with
`opacity: 0` at 0 percent renders **invisible** in a frozen pane. That is the pane,
not a bug.

**Always check overflow.** `scrollWidth` must equal `clientWidth` at 375 and 1280,
and check it with any demo-level `overflow-x: hidden` turned off so the result is
not masked. One 46px tick mote at `left: 90%` pushed the page 10px wide at 375px.
Hiding it on touch was the cheap fix and it cost the effect; the real fix is to
lay a mark out from whichever edge it is nearer, so it grows inward, and to clip
the container so no mark can contribute scroll width at all. **Measure in the
active state, not at rest.** Un-hiding a hover treatment on a small screen is
precisely how overflow gets reintroduced.

## 8. Non-negotiables

- **No authentication, ever.** The dialog is a visual component: no `<form>`, no
  password field, one inert text input with no `name`, a button that does nothing.
  Say "visual component only" in the copy.
- **No third party logos or wordmarks.**
- **Respect `prefers-reduced-motion`** in every component, verified by stubbing
  the preference, not by assuming the media query works.
- **Accessibility is not optional**: real anchors with real `href`s,
  `aria-current`, labelled controls, a live region created before its content,
  visible focus, focus restored to the opener on close.
- **No em or en dashes in any prose.** Commas and periods. This is Amy's rule
  across every project.

## Contributed back, 2026-08-01

**`components/scan-pass.css`** is new rather than ported. Section 4 of
`hologram.css` describes the holoframe as one where "corner brackets draw in, a
scan line passes once", but only the brackets and the particle beam were ever
written. This is the scan line that sentence promised. It passes once, on hover
or `.holo-on`, and never loops, which is the standing rule applied to the one
component people set to `infinite` by reflex.

**A caution for anyone verifying a hover state in the Claude browser pane.** It
never composites, so CSS transitions stick at their start value forever. A
correct `.holo-on` rule will measure `opacity: 0` a full second after the class
goes on, with the selector matching, the rule present, higher specificity,
unlayered, no inline style and no competing rule. Injecting the identical rule
at runtime changes nothing either, which makes it look like a cascade fault and
is not one. Disable the transition and read again: the true end state appears
immediately. This cost most of an hour.

**The rule in section 2 is easy to break while reading section 2.** Porting the
holo card into whatisabrain.com I wrote corner brackets from scratch, two
pseudo elements, static, two corners, because I had the card open and not the
frame. The real `.hud` is four corners that push outward from
`translate(4px,4px)` to `translate(-7px,-7px)`, and the push is the whole
character of it. If a component looks like it needs a companion, search the set
for the companion before writing one.

---

**Version 2**, 29 July 2026. Adds section 5: every hover state ships its tap
path in the same commit, one mechanism and one class for the whole library, and
the fixed height parent a formerly absolute child overflows at a breakpoint.

**Version 3**, 30 July 2026. Adds the animation restart trap, a one-shot state
class must come off at animationend or hover and tap replays are dead on
arrival, and the two-transform-property trick that lets the mote drift ride
under the repulsion.

**Version 4**, 30 July 2026. The shared panel surface is extracted as
`.holopanel` and the profile panel is built on it. Adds the class collision
lesson: two components sharing a base class break both the day a page loads
both, which is how the icon rail's `.holorail` met the section rail's, now
renamed `.holoiconrail`. The whole components set is wired into the main page.

**Version 5**, 30 July 2026. The researcher profile, badge coin and award screen
are reproduced from the EyeWire II profile, and the loader is redrawn. Lessons
worth keeping:

- **A travelling dot along a path is `<animateMotion>` with a `path` attribute,
  no length maths.** The loader signals ride dendrite to soma to axon that way.
  SMIL does not read `prefers-reduced-motion`, so the reduced motion rule sets
  the dots to `display: none` rather than trying to stop the animation; a dot
  frozen mid arbor is worse than no dot.

- **Draw direction is authored, not set in CSS.** The loader arbor grows out of
  the soma because every path's `M` is at the soma and the stroke dashoffset
  reveals from there. To reverse a draw, reverse the path, not the keyframe.

- **A hero title should not carry a component that blurs itself out.** The
  masthead used to be a `.holoboot`, so it re-materialised on every hover and
  tap and the title vanished for a beat. It is now a plain `data-holo-tap` host:
  it lights its edge, nothing disappears. Boot entrances belong on cards you
  scroll past, not on the one thing that is on screen from the first frame.

- **Reproducing a screen you cannot get the assets for: build the layout, mark
  the placeholders.** A first pass built the profile as an emoji-coin lookalike
  because the real assets seemed out of reach. They were not.

- **A built bundle with source maps IS the source. Go get it before you
  approximate.** `amyleesterling/eyewire-ii` ships `main.bundle.js/.css` with
  `.map` files, and the maps carry `sourcesContent`: the real Vue templates, the
  real SCSS-compiled CSS, the badge catalogue, and the demo data, all readable.
  `json.load(map)['sources']` lists the files; `['sourcesContent'][i]` is each
  one whole. That is how the researcher profile went from a recreation to the
  actual `UserProfilePanel`: real CSS de-scoped from its `data-v` hash, DOM
  rebuilt from the real class names, badge art resized from the game's
  `center-art` PNGs, numbers from the shipped demo profile. When a repo is a
  built front end, look for `.map` before you reproduce anything by eye. This is
  the §2 rule with teeth: the real thing was one clone away.

- **`hidden` loses to `display: flex`/`block`.** The profile's tab panels are
  `display: flex` and the special-awards overlay is `display: flex`, so the
  `[hidden]` attribute did nothing: every tab stacked at once and the overlay ate
  every click. A component that toggles visibility with `hidden` needs
  `.thing[hidden] { display: none !important }` spelled out whenever its base
  rule sets a display.

**Version 6**, 30 July 2026. The profile is no longer a recreation: it is the
real EyeWire II `UserProfilePanel`, lifted from the `amyleesterling/eyewire-ii`
bundle's source maps, real CSS and real `center-art` badge art and the shipped
demo data. Adds the two lessons above: a built bundle's `.map` files are the
source, so fetch them before approximating; and `hidden` loses to a base
`display` rule. The invented `.holobadge` coin and `.holoaward` screen are gone.

**Version 7**, 30 July 2026. The masthead now answers a hover or a tap with a
chromatic-aberration shatter: the panel shears red-and-cyan, tears on a few
scanlines, disperses to nothing for a beat while a canvas throws tinted
particles from its own rectangle, then recomposes. Lessons worth keeping:

- **An entrance boot and a deliberate trigger are not the same disappearance.**
  §4's "a hero title should not carry a component that blurs itself out" still
  holds: the old `.holoboot` masthead vanished its title as a *side effect* of
  every hover, unbidden and every time the pointer crossed it. The glitch is the
  opposite contract, an explicit effect the reader asked for by hovering or
  tapping, self-contained, that always returns to a rest identical to the one it
  left. The rule was never "the title may never move." It was "an entrance
  animation has no business on the one panel that is on screen from the first
  frame." A triggered showpiece that reforms breaks neither.
- **A one-run effect needs a running guard, not just an animationend cleanup.**
  Hover fires `mouseenter` once per entry and the tap path re-fires on every
  re-tap, so without a `running` flag a second trigger mid-flight stacks a
  second canvas and a second class add/remove race. The guard swallows anything
  that lands before the first run's teardown, and the run's own timers own both
  the class removal and the canvas teardown.
- **Split an RGB ghost with `text-shadow`, not a filter, when the glyph is
  gradient-filled.** The wordmark is `-webkit-text-fill-color: transparent` over
  a clipped gradient, and `text-shadow` still paints under that fill, so two
  offset shadows in red and cyan read as split glyph ghosts. A `filter`
  drop-shadow does the same for the panel's opaque border and the particle
  streaks read as scanline debris because half of them are thin horizontal
  rects, not squares. The chromatic read is carried by weighting the palette
  toward the two aberration colours.
- **`hover: hover` gates the mouse path so a touch does not fire it twice.** A
  tap on a touchscreen emits a synthetic `mouseenter`, so the hover trigger is
  gated to a device that actually hovers and the tap comes through the library's
  own `holotap:on`; the two never both fire for one touch.

**Version 7**, 30 July 2026. Sharpens the animation-restart lesson, because the
v3 fix only worked once. Restarting a CSS animation from inside a pointer
handler differs by what it is on:

- **A pseudo element (`::after`) cannot be reliably restarted by re-adding a
  class, not with a synchronous reflow and not with a pair of rAFs.** The
  browser coalesces the remove and the re-add into no change and the play never
  starts over. What always works is a change of the computed animation *name*,
  so the underline alternates two identically-drawn but differently-named
  classes, `is-drawn` and `is-redraw`, on every tap. This is why the underline
  only drew once before.
- **A real element can be restarted the classic way:** drop its animation to
  `none` inline, force a reflow, hand it back to the stylesheet. The boot does
  that on its panel and its two spans.

Also: `hologram-tap.js` now re-fires `holotap:on` when you re-tap the thing
already lit. Without it a repeat tap on the same element was a dead no-op, so
any effect whose point is a replay could only ever play on the first tap.

**Version 8**, 30 July 2026. The masthead glitch becomes a closed loop, the
particle trace runs on phones, the step-rail section becomes a four-stage
descent through the brain, the readout panel answers a tap, and a live unit bug
in the media HUD is fixed. Lessons worth keeping:

- **A satisfying loop is one set of particles going out and coming back to the
  same coordinates, not two effects that happen near each other.** The first
  glitch threw particles that flew off and faded while the panel independently
  faded back: the eye read them as unrelated. Now each particle stores its spawn
  point as home, flies to an outward target for the first 42% of its life, then
  eases back to that exact home for the rest, and the panel is pinned at
  opacity 0 for the whole flight and only reforms over the last fifth, as the
  particles land on it and cross-fade out. What disperses is what rebuilds.
- **When two clocks have to meet, couple them in the comments and the
  constants, not by eyeball.** The CSS panel keyframes (hold to 72%, reform by
  100% of 1600ms) and the JS particle life (`THROW` 200ms, `PLIFE` 1320ms) are
  set to land the particles into the reform. Retiming one without the other
  breaks the illusion, so both say so at their definition.
- **A width guard that turns a feature off entirely deserves a second look.**
  The trace canvas was `display: none` below 700px on the theory its 22px
  overhang would scroll the page. It would not: the frame sits inside the wrap's
  30px gutter, so the overhang lands there with 8px to spare. It was hiding one
  of the nicer things on the page from every phone for nothing. Measured at 360,
  390, 700 and 860px: zero horizontal overflow. Verify the assumption a guard is
  built on before you keep paying for it.
- **A tap host with no rule for `.holo-on` is a dead tap.** `.holo` was in the
  tap list, so a tap already put `.holo-on` on the readout, but nothing answered
  that class, so the panel did nothing and read as broken. Every host in the tap
  list needs a visible answer to the class, the same way it needs one for
  `:hover`. Being in the list is half the contract.
- **The µm-to-MM unit trap was not hypothetical: it was live in the HUD.** The
  media annotation's value line, `.hud b.c`, was `text-transform: uppercase`,
  so the real measurement `337 × 266 × 92 µm` rendered as `... 92 MM`, off by a
  thousand an axis. The readout component's header warns about exactly this; the
  same trap sat two files over, uncaught, because MM reads as a plausible unit.
  The value line now opts out of uppercase. When a repo documents a trap, grep
  the rest of it for the same shape.
- **One rail can carry a whole demo.** The step-rail section had two bare rails
  reporting their own step; it now has one driving a four-stage inner-cosmos,
  brain to neurons to synapse to a plotted action potential, the stages stacked
  and cross-faded so the panel never jumps height, the scale labels held in the
  script so the label and the art cannot drift apart.

**Version 9**, 30 July 2026. The loader becomes the sign-in dialog's own cell,
the attract loop is retired into the step rail, and the badge button opens the
real hero award. Lessons worth keeping:

- **Reuse the cell you already drew rather than draw a second one.** The loader
  had its own simpler neuron; it now uses the sign-in dialog's detailed arbor,
  the same paths, so the two places that draw a cell draw the *same* cell. The
  draw still grows from the soma because every path in that arbor is authored
  from its soma-ward end outward, and splitting it into apical (up) and basal
  (down plus axon) groups gets the half-cycle offset for free. One box now, not
  two: a loading state's job is to say "working", and it says it once.
- **A removed section can leave its behaviour behind.** The attract loop is
  gone as a section, but its one real idea, walk the steps on a dwell and hold
  the moment someone touches it, moved onto the inner-cosmos rail. Removing a
  demo is not the same as removing what it taught; fold the mechanism into
  something that stays. Its component files remain in `components/`; only the
  page stopped loading them.
- **A badge unlock is a hero takeover, not a corner toast.** The source
  (`AchievementToast.vue`) routes streaks and edit milestones to the toast list
  but gives a badge the `heroBadge` branch: a full-screen "ACHIEVEMENT
  UNLOCKED" spectacle, hex grid, shockwave, rings, orbits, a materialising
  badge, that stays until clicked and then opens the profile. The "Badge only"
  button now fires that, `holoaward`, reproduced from the real markup and the
  de-scoped styles, with the real Astrolabe badge and gold confetti. The
  corner-toast reproduction was only half the component.
- **When you slice a rule range out of a bundle, the last rule's brace may be
  on the next line.** The extracted styles put each rule's `{ ...` on one line
  and its `}` on the next; cutting the range at the property line dropped the
  final `}`, and that one unclosed block silently swallowed the two `@media`
  blocks appended after it, so reduced motion and the mobile scale both quietly
  did nothing. A brace-count (open vs close) is the one-line check that catches
  it; a screenshot at the affected width or preference is the other.

**Version 10**, 30 July 2026. The step rail stops pretending. Its four
hand-drawn SVG "inner cosmos" stages are gone, replaced by the three real
MICrONS viewers the rail was always meant to hold, carried across whole from
`amyleesterling/microns`: the brain at true scale, the nine cell types, and one
spike crossing one synapse. Lessons worth keeping:

- **Do not reinvent what the author already built.** The placeholder brain,
  neuron, synapse and action-potential SVGs were a smaller, worse copy of work
  that already existed as measured, interactive WebGL. When a demo stands in for
  something real the author has shipped, the move is to carry the real thing
  across, not to approximate it. The whole of this version is deleting an
  approximation and wiring in the source.
- **Carry a component across whole: code, assets, and its coordinate system.**
  The viewers came over verbatim, `three.js` and its addons, `holo3d.js` and the
  three panel modules, and their real meshes (~33 MB of brain surfaces, nine
  cell `.glb`s, and the synapse skeletons). Their mesh fetches are page-relative
  (`meshes/…`), so the meshes sit at the site root exactly as they do in the
  source, and an import map at the top of the head resolves `three`. Nothing was
  re-pathed or re-authored; re-pathing is how a carried-across component breaks.
- **Scope the borrowed page's variables, do not adopt them.** The `.mviz` CSS
  reads `var(--accent)`, `var(--panel)` and the rest, which are the microns
  page's `:root` tokens. Dropping those into this page's `:root` would recolour
  half of scifi-ui. They live on `.mviz` instead, so they reach every card
  descendant and nothing else.
- **Let the component's own laziness drive the rail.** Each viewer already
  fetches no mesh and runs no render loop until an IntersectionObserver says it
  is on screen. So the rail switches cards by `display`, not opacity: a
  `display:none` card never trips its observer, so only the card the rail
  reveals loads and renders, and stepping away halts the one you left. This is
  also why the attract-loop auto-advance was dropped here: cycling heavy WebGL
  viewers on a timer is the opposite of what they are for.

**Version 11**, 30 July 2026. The particle-trace section moves to the end,
where the lede already lists it ("…and a particle trace for media"), so the page
reads in the order the first sentence promises. And it gets the vertical room it
always needed: the trace beam runs a good 22px outside its frame, plus glow, so
`.holoframe` carries 34px of vertical margin (30px on phones) rather than
letting the light wash over the paragraph above and the caption below. A halo
that overhangs its own box has to be paid for in the margins of the box, not
just the box; the day the trace started running on touch, the old 10px phone
margin stopped being enough.

**Version 12**, 30 July 2026. The dialog neuron comes alive, the loader grows
properly, and the readout moves back and earns its number. Lessons worth
keeping:

- **The reproduced component was missing its motion; the source still had it.**
  The sign-in dialog's neuron was carried across as line art, but the original
  `LoginModal.vue` runs eight synaptic sparks along it, seven riding the
  dendrites tip → soma (afferent, dendritic integration) and one firing down the
  axon (efferent), plus two rings radiating from the soma. Those are back, on
  the same coordinates, so signals move through the neuron the way they always
  did. When a reproduction feels static next to the original, the missing part
  is usually animation the first pass dropped, and it is sitting in the source.
- **A trim path needs `pathLength`, or the short branches wipe on in one
  frame.** The loader draws its arbor with `stroke-dashoffset`, but a fixed
  `stroke-dasharray: 200` is longer than most of the neuron's little branches,
  so they appeared all at once instead of growing. Setting `pathLength="1"` on
  every path normalises them, and a dash of 1 trimmed 1 → 0 then grows every
  branch from its soma end to its tip at the same rate, however long it really
  is. That is the difference between "the branches should grow out of the soma"
  and what was there.
- **A forward-only loop is a thing to watch; give it a tap to make it a thing to
  touch.** The loading cell now replays on a tap or a click: the CSS draw is
  restarted the reliable way for a real element (animation to none, one reflow,
  hand it back) and the SMIL dots are rewound with `setCurrentTime(0)` in the
  same beat, so the whole cell grows again from nothing.
- **A dull panel is often a still number.** The readout said 165 and sat there.
  It now counts up to its real figure the first time it is seen and again on a
  point or a tap, eased out so it lands. The target is parsed from the text
  already in the markup, so the animation cannot drift from what the panel says.
  And the section moved from second on the page to near the end, where a small
  true fact belongs once the louder components have had their turn.

**Version 13**, 31 July 2026. Two size corrections on the deployed page.

- **The spike is a beam, not a blob, and its size lived in the trail, not the
  sprite.** The action-potential spike read as a fat orange ball next to a hair-
  thin cell. The obvious lever, the head sprite's scale, was the wrong one: the
  bulk was the trail's head point, `makeTrail(..., 130)`, a 130px `gl_PointSize`.
  Dropping it to 42 (and the head sprite to 0.045) turns each spike into a tight
  head with a tapering tail: a light beam travelling the axon, in scale with the
  cell. When a glow is too big, check the point size before the sprite scale.
- **A particle field at the source's alphas is an empty field.** The dialog's
  drifting particles were reproduced faithfully, six tiled dot grids at the
  login box's exact alphas, and against this darker panel they were invisible.
  Faithful is not the same as visible: the dots go up to ~.5 alpha and 1.5px,
  the field to .9 opacity, three more tiles for depth. The reproduction was
  right; it just needed to be turned up to survive the surface it was put on.

**Version 14**, 1 August 2026. The whole page gains the flywire gallery's
ambient life, carried across rather than reinvented.

- **The ambient layer is the flywire page's own, mapped onto this page's
  tokens.** `components/ambient.css` + `components/ambient.js` bring across the
  five background layers verbatim from
  `amyleesterling/flywire-neuron-gallery` — a slow drifting corner gradient, a
  tech-grid dot lattice, the seventeen hand-drawn circuit traces, seventy
  drifting neurotransmitter particles, and faint CRT scan lines. The React
  component became a plain-JS builder; the colours became this repo's tokens
  where they line up (flywire cyan is `--holo-cyan` exactly), keeping the
  magenta/warm accents as the source's literals. The whole layer sits on
  negative z so the page's own content paints straight over it.
- **The click burst is a reticle confirm, not decoration.** Every click sprays
  eleven star sparkles outward from the point plus one expanding sonar ring,
  each removed after 800ms, skipped on canvas clicks (so 3D drags don't spark)
  and while a `dialog[open]`/`.nge-hero-overlay` modal is up (so a backdrop
  dismiss stays a plain click). The angles, distances and three-in-five plain /
  one magenta / one warm palette are the source's.
- **Reduced motion means never built, not merely stopped.** Under
  `prefers-reduced-motion: reduce` the particles and the click handler are never
  created at all, and holo-bg's drift is stopped in CSS; the static
  gradient/grid/circuit/scanline layers still mount so the page keeps its faint
  texture without a single thing moving.
- **The scroll rail was already this.** The flywire scroll-progress rail — the
  glowing head gliding a gradient fill, the section sub-dots, the count — is
  what `.holorail` already is on this page (same section-snap, same .7s glide).
  Nothing to carry across; the ask was already satisfied.

**Version 15**, 1 August 2026. The tap gets its own animation on touch.

- **A burst designed for a mouse is the wrong burst under a finger.** The click
  sparkle spray fires outward from the point, and on a phone the finger sits on
  top of the point, so the sparks come out from under it and all that survives
  is the ring — "it just looks like a ring." Touch now gets a thing built for
  it: a HUD reticle lock-on. Four corner brackets snap inward onto the tap
  point, a crosshair draws through, one fast radar ping expands, and a
  `SYNC · NNN` lock code flickers in beside it — the page's own targeting
  vocabulary (the corner ticks, the cyan glow, the SEC 04 / SYNC / 1.00
  readouts) rather than a generic ripple. The mouse keeps the sparkle burst;
  the split is by pointer, read live (`pointerType`, falling back to
  `(hover: none) and (pointer: coarse)`), so a device that gains or loses a
  fine pointer mid-session lands on the right one. When an effect reads wrong on
  a surface, ask whether the surface wants a different effect, not a louder
  version of the same one.

**Version 16**, 1 August 2026. The loading cell becomes one choreographed loop
on a single clock.

- **Two loops on two clocks drift, and the drift was the bug.** The draw was a
  CSS animation and the signal dots were SMIL, each on its own 2.6s cycle, so
  the dots rode branches that were mid-fade — a dot travelling a dendrite that
  was disappearing under it. `components/loader-neuron.js` puts the whole figure
  on one `requestAnimationFrame` timeline: the branch draw and the dots share
  the same frame, so a dot is only ever on a branch that is currently drawn. The
  CSS draw/pulse stays as the no-JS fallback (gated off once JS adds
  `.holoload-live`), and reduced motion never starts the loop at all — the CSS
  draws a full static cell and there are no dots.
- **The sequence is now a story, not a pulse.** Soma eases in; the apical
  dendrites grow up out of it; the axon grows down as the first dots ride the
  apical branches in to the soma and on out the axon; then the basal-left arbor
  grows and fires its dots, then basal-right; and after the last dot leaves the
  axon the whole cell zips back into the soma and it begins again. Every dot
  runs tip → soma → axon-exit, so nothing is ever stranded on a branch when the
  zip retracts it. The basal arbor is split left/right at runtime by which side
  of the soma (x = 60) each branch's bounding box sits on; dot routes are the
  trunk reversed (tip → soma) then the axon, sampled with `getPointAtLength` so
  the dots follow the real morphology.
- **Determinism beats cleverness for choreography.** Sequencing this with
  staggered CSS delays would have re-introduced exactly the drift it replaced;
  one JS clock driving `strokeDashoffset` and dot positions per frame is what
  makes "the dots are never on a vanishing branch" a guarantee rather than a
  hope. Verified by sampling 180 frames across the cycle: zero frames with a
  visible dot on an undrawn trunk.

## Contributed back, 2026-08-11

**The original components moved out.** `wave-progress`, `sync-cluster`,
`spring-motion`, `atlas-field`, `channel-wipe`, `scale-bridge`,
`projection-matrix`, `section-stack`, `action-state`, `arrival` and `veil` were
original rather than ports, which made them a standing exception to section 2
inside a repo whose whole value is that the rule is absolute. They now live in
[experimental-ui](https://github.com/amyleesterling/experimental-ui) along with
their pages, and the lessons that were specific to them went with them. Nothing
here referenced them, so the removal was clean. `hologram-tap.js` is used there
unchanged, so the `.holo-on` contract in section 5 is now shared across both
repos and should not be changed on one side alone.

Two lessons stay here because they are about this repo's own rules rather than
about those components.

**Auditing section 5 with the CSSOM needs one guard, or it silently passes.**
Checking that every `:hover` rule also names `.holo-on` is the obvious job for
`document.styleSheets`, and the obvious walker is wrong. In current Chrome a
plain `CSSStyleRule` exposes an empty `cssRules` list, because of nested CSS, so
a walker that does `if (rule.cssRules) { recurse; return; }` returns early on
every style rule and reports zero hover rules and zero problems. Test
`rule.selectorText` first, and only recurse when `rule.cssRules.length` is non
zero. A first run reporting "0 found, none missing" is exactly what a passing
audit looks like, which is why this is worth writing down. `cssRules` also
throws on a `file://` page, so serve the directory before auditing.

**Playwright may composite frames, unlike the browser pane section 7
describes.** Where a real browser is available, assert on behaviour rather than
on the stylesheet, and say which you did.

## Contributed back, 2026-08-18

From porting the converging swarm out of the ca3 renderings.

**A converging effect must sit below the thing it converges on.** The canvas
lands at `z-index: 5` and the chip it points at at `6`, so particles pass behind
the text and never cross it. The failure mode is not subtle: an effect that
paints over its own target obscures the one thing the reader raised it to read,
which is worse than having no effect at all. If you add a component that points
at something, say in its stylesheet what the target's z-index has to be.

**Read a component's palette from the tokens, do not carry the source's
literals across.** The rule in section 2 is to carry the real numbers across,
and it means the numbers that make the thing behave the way it does: the flock's
pull, curl, damping, neighbour radii and absorb distance are all exact here.
Colour is the exception, because a hardcoded triplet is correct for the one site
it came from and wrong for every page this library lands on. Read
`--holo-line`, `--holo-beam` and `--holo-cyan` at start instead.

**A press and hold demo needs its guards, and one of them will look like a
bug in testing.** The scroll bail that stops a press becoming an accidental
activation also fires during a programmatic `scrollIntoView`, so a test that
scrolls to the component and immediately presses gets nothing and looks like a
dead handler. Let the scroll settle before pressing. The guard is right and the
test was wrong, which is worth knowing before anyone deletes the guard.

**State what a statistic would look like if the component were broken.**
Particles that respawn at the edges hold a constant mean distance to their
target, so watching that mean fail to fall proves nothing at all. Compare
against a uniform scatter over the same canvas instead. Measured here: 160 pixels
mean against 322 for uniform, and 59 percent inside the inner disc against 9.
That is a test that can fail.

**Version 8**, 21 August 2026. The Scout tag mode port closed a loop worth
naming: ng-extend's tag panel originally ported this library's materialize
and swarm, evolved its own light choreography in production, and that
choreography has now been extracted back as `scout-trace.js` and
`scout-tag.*`. When a downstream product grows animation on top of a port
from here, that growth is extractable shipping code, and porting it back is
exactly what section 2 asks for. Carry the upstream file's own annotations
across too: the tuning notes in `holo_trace.ts` record why each timing is
what it is, and they are the difference between a port and a copy.

**Version 9**, 26 August 2026. Ten ports landed in one sweep, from four
shipping sources: EyeWire II (shimmer reveal, letter reveal, notification
scan-in, recap roll-in, trophy orbit, streak flame, toast countdown),
whatisabrain's connectome app (registration arrow, block ping), human-brain
(the holo-timeline sequence layer) and BE THE FLY (neural HUD frame, neuron
ignite, EPG compass). Lessons that survived the sweep: a survey by keyframe
name is the fastest map of a site's animation surface (grep @keyframes,
then read only what the names point at); consumers of this library are also
sources, whatisabrain and human-brain both vendor scifi-ui and both grew
elements worth porting back; and a demo row that uses CSS grid with
min-content panes will overflow a phone where the same row as wrapping flex
does not, which is what took the page seven pixels over 375 until the
registration arrow row was reflowed.

**Version 10**, 26 August 2026. The rule in section 2 extends to demo
chrome, and it took three violations in one sweep to make that explicit.
The neural HUD frame was carried faithfully and then filled with an
invented "NEURAL INTERFACE / channel 4" panel; the letter reveal ran on an
authored card; the recap roll-in staggered sections of made-up layout. All
three read wrong on sight to the person whose designs these are, which is
the point of the rule. The panel a ported animation plays inside is part
of the port: carry the real chip, the real mission HUD, the real report
structure, and when the source panel cannot come whole, say which part is
demo scaffolding in the file header. Demo DATA may be invented (names,
counts, dates); demo CHROME may not.

**Version 11**, 4 September 2026. The first 3D component: a hologram
`ShaderMaterial` in `js/holo-material.js`, with `hologram-3d.html` as its
demo. Built to a written brief (additive, translucent centre, cyan fresnel
rim, a dot lattice for the surface instead of scanlines, noise gated jitter
and colour split, nothing that scrolls). Lessons worth keeping:

- **Fresnel is a silhouette effect, and a sub pixel tube has no silhouette.**
  On the mouse brain shell the material reads as a hologram at the defaults.
  On a MICrONS cell it read as a scatter of dust, because a dendrite one pixel
  wide is sampled at its axis, where the normal faces the camera and the rim
  term is zero. There is no shader fix for that; the demo carries a per mesh
  preset (rim power down, body up, lattice finer) and says why in a comment.
  Test a surface shader on the thinnest thing it will ever be asked to draw.
- **Additive with both faces drawn doubles the edge.** Front plus back at
  full alpha clipped the rim to a white outline. Back faces at 0.35 keep the
  volume read and lose the outline.
- **The pane does deliver a screenshot of WebGL, once you render by hand.**
  §7 says screenshots time out. They do not when the frame is drawn
  synchronously first: `loop.step(dt)` then `computer.screenshot`. What the
  pane never does is fire `requestAnimationFrame` or `ResizeObserver`, so a
  canvas sized by an observer sits at its first size until you call the fit
  yourself. Measure the drawing buffer before trusting a picture: the first
  frame here was 132 by 98.
- **A zero gain control proves the pixels are the shader's.** `uOpacity` 0
  gave zero lit pixels, `uOpacity` 1 gave the object. Without the control a
  faint render is indistinguishable from a broken one.

**Version 12**, 4 September 2026. The hologram gains two future eras on the
same material, kept as versions beside the original. Lessons worth keeping:

- **Never take facing from winding.** The mouse brain GLB is a mirrored export
  and every triangle is wound backwards, so `gl_FrontFacing` and `BackSide`
  both lie on it. A "nearest back face" thickness pass wrote the near wall and
  the volume was invisible, measured: the far depth at the centre read 2.07
  with the camera at 2.9, the front. The pass now keeps the farthest surface
  (`GreaterDepth`, buffer cleared to 0) and the material flips its normal by
  `dot(N, V)`. Read the depth target back before believing a volume effect.
- **Eras are versions, not replacements.** Amy: "remember we want versions".
  A new look goes in as a preset beside the old one, never over it.

**Version 13**, 4 September 2026. Seven named styles on the hologram, built
to a brief for warm white and gold, "bright, friendly, a supernova", and
rendered on the human brain by headless Chrome. Lessons worth keeping:

- **Additive light stacks per surface, and a folded surface is many.** The
  human cortex crosses eight or more surfaces on one ray where the mouse
  shell crosses two; every style blew out to white on it. A per mesh gain
  fixed the layered styles, and a depth prepass (`solid`) made the rest into
  one lit surface. Judge a material on the most folded thing it will draw.
- **A halo pushed along the normals of a coarse folded mesh tears into
  spikes, and pushed radially it carries the folds as ghosts.** Six shells
  pushed radially, with the fade read from the smooth push direction rather
  than the folded normal, is the one that reads as bloom.
- **The prepass must move exactly as the surface does.** A depth only
  `MeshBasicMaterial` rejected the jittered surface against its own depth and
  a whole style went dark. The prepass and the thickness pass now run the
  hologram's own vertex shader on the same uniforms.
- **The human brain is wound backwards too.** Facing now comes from the
  thickness pass (the near wall has object behind it) and only falls back to
  `gl_FrontFacing` when the pass is off.
- **Render styles headless and read a contact sheet.** `chrome
  --headless=new --use-angle=swiftshader --screenshot` on `?shot=1` gives a
  real frame in ten seconds; one sheet of all styles is a single image read.
  Six iterations of that loop is what separated recolourings from styles.

**Version 14**, 4 September 2026. Four opaque styles with a real surface
model, after Amy said none of the translucent ones were good enough and asked
for rainbow scattering and no see through. Lessons worth keeping:

- **A mirror needs something dark to reflect.** The first procedural studio
  was a bright warm gradient everywhere, and a metal surface in it rendered
  as flat cream. Dropping the ground to near black and putting the light in
  four discrete soft boxes plus a tight sun is what turned it into chrome.
- **An interference colour that averages to white is a haze, not a rainbow.**
  The thin film had to be pushed hard away from grey (a 2.6x saturation about
  the mean, then squared) before the bands read as spectral.
- **A blank white frame from headless Chrome is a page that never painted.**
  One style in eleven came back 100 percent lit and 99.99 percent saturated,
  which no shader frame ever is. The render script now retries a frame above
  95 percent lit rather than believing it. Always have a check that can tell
  a failure from a result.
