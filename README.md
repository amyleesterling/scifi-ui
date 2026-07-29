# scifi-ui

**A hologram and scifi inspired UI library for agents.**

### [Live demo](https://amyleesterling.github.io/scifi-ui/)

Every component running, framed around real 3D renders of reconstructed
neurons. Hover anything.

A small, dependency free set of hologram and HUD parts for a dark page: a
draggable step rail, a vertical section rail for the page itself, a readout
panel, an underline that draws itself, a panel that boots up, a scan sweep, an
image card with an edge trace, a modal dialog surface, a loading state that
draws a cell, and a particle trace for media with brackets, readouts and a play
affordance.

No build step, no framework, no CDN. Two files.

```html
<link rel="stylesheet" href="hologram.css">

<div class="holobar" data-steps="10" data-step="8"></div>

<figure>
  <div class="holoframe">
    <canvas class="trace"></canvas>
    <img src="render.jpg" alt="">
  </div>
  <figcaption>Anything you like.</figcaption>
</figure>

<script src="hologram.js"></script>
```

Every component is independent. Take one, delete the rest. Every colour is a
custom property with a concrete fallback, so any single piece works pasted into
a page that has no token system.

Open `index.html` for a working demo.

---

## The one idea worth taking

**Ornament that encodes something true reads as designed. Ornament that encodes
nothing reads as a screensaver.**

Every readout in this system is real. Dimensions, duration and frame count are
read off the media element at runtime, so they cannot drift out of date, and a
figure can carry one measured value via `data-hud`. The step rail reports the
step it is actually on. The loading bar goes indeterminate rather than inventing
a percentage. When the numbers mean something, a viewer feels it even without
reading them.

This is the difference between a sci-fi interface and a costume. If you take one
thing from this repo, take that, not the CSS.

---

## What each piece does

### 1. Step rail (`.holobar`)

```html
<div class="holobar" data-steps="10" data-step="8" aria-label="Tour stage"></div>
```

A counter in tabular caps, a hairline rail, the run so far filled and glowing, a
brighter dot where you are, dimmer ticks after it. The script builds the counter,
the rail, the fill and one button per step, so the markup is one empty div.

Any number of steps. **Drag the rail** and the step follows the pointer. Click a
tick to jump. Focus a tick and use the arrow keys, or Home and End. Steps are
counted from 1, because that is what the counter shows. It reports back three
ways:

```js
bar.addEventListener("holobar:change", e => e.detail.step);  // 1 based
bar.getAttribute("data-step");
bar.holobar.step;            // also settable, plus next() and prev()
```

Only the current tick is in the tab order, and the arrows move the selection
rather than just the focus, because selecting is the whole point of the control.
The hit area is 16px so a finger can find a 3px dot. The fill stops at the dot
you are on rather than one step past it, so it still reads correctly at three
steps as well as at thirty.

**On dragging.** `pointerdown` on the rail or on any tick starts a drag,
`pointermove` updates the step continuously, `pointerup` ends it. The rail calls
`setPointerCapture`, so a drag survives leaving a 2px line, which is most of why
it feels like a control rather than a row of buttons. `touch-action: none` keeps
a drag that starts on the rail from being taken over by the page scroll.

Three details that are not obvious:

The 700ms ease on the fill is dropped for the duration of the drag. It is what
makes a click feel considered, and it is what makes a drag feel like the light is
chasing your hand rather than following it.

Focus moves to the tick you drop on. The roving tabindex has already moved there,
so leaving focus on the tick you grabbed would leave a focused element that is
not the current one, with `tabindex="-1"` on it.

The click a browser fires at the end of a drag has to be ignored, or it snaps the
step back to whichever tick was under the pointer when the button came up. That
guard is a 300ms deadline rather than a boolean, because a drag that ends on the
rail itself produces no tick click at all, and a boolean would still be set when
the next real click arrived.

### 2. Readout panel (`.holo`)

One label, one number, one line of context. The smallest component here and the
one that carries the idea: say something true and the ornament stops being
ornament.

### 3. Underline that draws itself (`.holounder`)

A hairline runs out from under a heading, once, the first time that heading is
actually on screen. Its resting state is the finished line, so a page with the
script stripped out still shows the underline instead of nothing.

### 4. Panel that boots up (`.holoboot`)

Add the class to any panel. Two bright heads run the border in opposite
directions and meet, an inner backlight swells and tapers, and the panel resolves
out of a blur. Once, the first time it is seen, because a panel that boots before
you scroll to it has booted for nobody.

The two decorative spans are added at runtime and sit at `z-index: -1` inside an
isolated stacking context, which puts them above the panel background and below
its content. That means the host keeps its own border, its own shadow and both of
its pseudo elements, so the class composes onto a panel you already styled.

The border sweep is a pair of conic gradients masked to a 1px ring, with the
angle animated through a registered `@property`. On a browser without
`@property` the angle holds still and the ring simply fades, which is a fine
degradation.

### 5. Scan sweep (`.holosweep`)

A thin line passes across a panel once on hover or focus. The band is a
background at a fixed height on a full size overlay, so one pass covers the panel
whatever its height. Off entirely on touch, where hover means nothing.

### 6. Hologram dialog (`.holodialog`)

A modal surface: rim gradient, still particle field, lit inside edge, a field
with a lit left border, and a button with hover, active, focus and disabled
states.

It is a real `<dialog>` opened with `showModal`, so focus trapping and Escape
come from the user agent rather than from a script. The script adds initial
focus, focus restored to the opener on close, a backdrop click to dismiss, and a
Tab wrap for the one case where `showModal` is missing.

**There is no authentication in it.** It is a visual component. The demo carries
an ordinary text input, a button that does nothing, and no form element at all.
If you wire it to real credentials, that is on you, and none of the styling here
helps you do it safely.

### 7. Loading state (`.holoload`)

A cell draws itself in while you wait. The basal arbor runs half a cycle behind
the apical one so the two trees do not pulse in lockstep, which is what makes it
read as alive rather than as a spinner.

```html
<div class="holoload" data-loaded="4" data-total="9" role="status"> ... </div>
```

```js
el.holoload.set(loaded, total);   // omit the total and it goes indeterminate
```

With no total it goes indeterminate rather than inventing a number. This is the
only piece in the library that repeats, because a loading state is the one place
a loop is honest.

### 8. Particle trace (canvas)

Three phases on hover, 1.5 s total:

1. **0 to 60%** a short arc of light runs the frame perimeter. Not a full ring:
   a full ring stays lit, which reads as a border rather than an event.
2. **60 to 100%** the beam breaks into particles that decay outward along a
   small three-level branching tree, so the dispersal has structure instead of
   being a puff.

Trails come from fading the previous frame with a `destination-out` fill rather
than clearing, which keeps the canvas transparent over the image underneath.

Starts wherever the pointer crossed the boundary: the code walks 240 points
around the perimeter and takes the nearest. That one detail is most of why it
feels responsive rather than canned.

### 9. HUD annotation (DOM)

Four hairline corner brackets that push outward on hover, plus three readouts.
Two are populated from the media at runtime, the third from `data-hud` on the
figure:

```html
<figure data-hud="165 synapses · 6 fibers"> ... </figure>
```

Hidden below 700px and on any device without hover.

### 10. Play badge

A 74px ring over video, because the native control is small and often lands on
top of whatever is burned into the frame. Hides itself on play, returns on pause,
and native controls stay for scrubbing.

### 11. Source swap

Serves a vertical cut to phones and a widescreen cut to everything else:

```html
<video controls playsinline muted loop preload="metadata"
       poster="vertical.jpg"
       data-wide="wide.mp4" data-wide-poster="wide.jpg">
  <source src="vertical.mp4" type="video/mp4">
</video>
```

Vertical stays the markup default so a phone never begins downloading the wide
file.

---

## Tokens

Set these on `:root` in `hologram.css`. Space separated RGB so they compose with
`rgb(var(--holo-line) / 0.5)`.

| token | job |
|---|---|
| `--holo-line` | hairlines, brackets, readouts |
| `--holo-beam` | the beam core, and every lit edge |
| `--holo-glow` | its soft outer glow, and panel rims |
| `--holo-warm` | the single warm accent, used once |
| `--holo-panel` | panel fills |
| `--holo-ink` | type, and the unlit half of a rail |
| `--holo-dim` | secondary type |

**Every reference carries a concrete fallback**, as in
`rgb(var(--holo-beam, 178 216 248) / .55)`. Paste any one component into a page
with no tokens defined at all and it still looks right. A bare
`var(--accent)` with nothing behind it computes to an invalid value and the whole
declaration is dropped, which is how focus rings silently disappear.

**One warm accent, used sparingly, against a cool field.** Every good HUD in film
does this. Two accents and it stops reading as an instrument.

Sizing hooks: `--holoload-size`, `--holoload-bar`. Tunables at the top of the
trace block in `hologram.js`: `PAD`, `N`, `DUR`, `R`.

---

## Things that cost me a day each

**Additive compositing accumulates.** Drawing with `globalCompositeOperation =
"lighter"` onto a canvas that keeps trails means the same pixels stack frame after
frame, and the beam clips to pure white no matter what alpha you set. Each
individual frame looks correctly dim; it only blows out because you are compositing
forty of them. The core here draws `source-over` and only the glow is additive.
Measured before and after: peak alpha 255 with 5,900 lit pixels, down to peak 193
with 1,717 and zero clipped.

**`::after` paints above an element's children.** A gradient scrim on a figure
will sit on top of a title inside that figure, not behind it. Give the scrim
`z-index: 1` and the content `2`.

**`100vw` includes the scrollbar.** A full-bleed breakout using `100vw` lands
7px wide and shifts left. If you can, put the element outside the constrained
column instead; no viewport units, exact result.

**Nothing should loop except a loading state.** A trace that animates infinitely
while hovered reads as a status indicator, which is not what you meant. One pass
per hover. The loader is the single exception in this repo, and it earns the loop
by genuinely reporting that something is still happening.

**Media does not constrain itself.** A `<figure>` wrapper does not stop a 1400px
render laying itself out at 1400px and scrolling the page sideways. The frame has
to say `max-width: 100%` or every host page has to remember to.

**Overhanging canvases cause horizontal scroll.** This one insets its canvas
negatively to give the decay branches room, which pushes past the viewport on a
narrow screen. Reserve matching margin on the frame, or hide it, which is what
the touch media query does.

**An entrance that waits for an observer flashes.** If the resting state is
visible and the animation starts at opacity 0, an element already on screen
paints once in full and then restarts. Light everything inside the viewport
synchronously, before the first paint, and observe only what is below the fold.

**A resting state of zero is a trap.** An underline that starts at `scaleX(0)`
and is only revealed by script is invisible forever if the script never runs, or
if the tab was never looked at. Make the finished state the resting state and let
the class trigger the draw.

**Hover treatments have no job on touch.** Hide them rather than leaving dead
markup animating nothing.

---

## CSS or canvas?

**If you can express it as "this element's property goes from A to B," use CSS.**
It runs on the compositor and transforms and opacity are essentially free.

**The moment behaviour depends on per-item state, or on other items, go to
canvas.** 150 particles each with a position, velocity, target and phase is not
something a stylesheet can hold.

Modern CSS is further along than people assume: `@property` lets you transition
custom properties, including angles, and `mask-composite` gives you a masked ring
border with no extra element. An earlier version of the trace was a pure-CSS conic
gradient and it worked. It only moved to canvas when the requirement became
"particles become the beam, then decay along branching paths," which is a
simulation.

---

## Accessibility

Everything driven by `:hover` is also driven by `:focus-within`, so keyboard users
get the same treatment. Every control is a real `<button>` or `<input>` with a
label and a visible focus ring, never a styled div.

The step rail is a roving tabindex group: `aria-current="step"` marks the current
tick, only that tick is tabbable, the arrows move the selection, and the counter
is an `aria-live="polite"` region so the change is announced. The dialog is a real
`<dialog>`, so the focus trap and Escape are the user agent's job rather than a
script's. The loader carries `role="status"`.

`prefers-reduced-motion: reduce` disables the canvas, every transition and every
animation. The one loop that survives is neutered: the cell is simply drawn, and
the indeterminate bar stops pretending to know something it does not.

Nothing here is load bearing. Strip every line and the page still works.

---

## Provenance

Built for a connectomics rendering site
([amyleesterling.github.io/ca3](https://amyleesterling.github.io/ca3)), where the
media is 3D renders of neurons and the readouts are real measurements from the
reconstruction.

The pieces were pulled out of four working sites and generalised so none of them
depends on the markup it came from. The step rail is from the Inner Cosmos
explorer, reimplemented from React to plain CSS with a small init. The loader, the
panel boot, the underline and the scan sweep are from the FlyWire neuron gallery,
where they were Tailwind utilities bound to that project's class names. The dialog
surface is the EyeWire II sign in modal with the authentication removed and every
looping animation replaced by the still it was cycling around.

The visual vocabulary is borrowed from film and game HUD work:
hairline strokes, tick rails, brackets, small uppercase labels, cool field with
one warm accent. Worth studying if you are going further:
[scifiinterfaces.com](https://scifiinterfaces.com),
[interfaceingame.com](https://interfaceingame.com),
[hudsandguis.com](https://www.hudsandguis.com).
