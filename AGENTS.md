# AGENTS.md, version 2

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

Also unextracted: the dark 135 degree gradient panel surface recurs in at least
four upstream places with three inconsistent hues, and the same entrance
keyframe (opacity 0, `scale(.97)`, `blur(10px) brightness(2.5)` with an 80px
bloom) appears in `UserProfilePanel`, `SettingsPanel`, the toast hero card, and
here as `holo-dialog-in`. That surface should be extracted once. Whoever does it
must win without `!important`, since the upstream profile panel uses it.

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

---

**Version 2**, 29 July 2026. Adds section 5: every hover state ships its tap
path in the same commit, one mechanism and one class for the whole library, and
the fixed height parent a formerly absolute child overflows at a breakpoint.

**Version 3**, 30 July 2026. Adds the animation restart trap, a one-shot state
class must come off at animationend or hover and tap replays are dead on
arrival, and the two-transform-property trick that lets the mote drift ride
under the repulsion.
