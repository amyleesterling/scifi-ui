# scifi-ui
<<<<<<< HEAD
hologram and scifi inspired UI endpoint for agents
=======

**A hologram and scifi inspired UI endpoint for agents.**

A small, dependency-free set of hover treatments for media on a dark page: a
particle trace that runs the frame, hairline brackets with readouts pulled from
the media itself, a visible play affordance, and orientation-aware video sources.

No build step, no framework, no CDN. Two files and a wrapper div.

```html
<link rel="stylesheet" href="hologram.css">

<figure>
  <div class="holoframe">
    <canvas class="trace"></canvas>
    <img src="render.jpg" alt="">
  </div>
  <figcaption>Anything you like.</figcaption>
</figure>

<script src="hologram.js"></script>
```

Open `index.html` for a working demo with no assets required.

---

## The one idea worth taking

**Ornament that encodes something true reads as designed. Ornament that encodes
nothing reads as a screensaver.**

Every readout in this system is real. Dimensions, duration and frame count are
read off the media element at runtime, so they cannot drift out of date, and a
figure can carry one measured value via `data-hud`. The eight-node version of the
border trace marked the sweep's actual progress. When the numbers mean something,
a viewer feels it even without reading them.

This is the difference between a sci-fi interface and a costume. If you take one
thing from this repo, take that, not the CSS.

---

## What each piece does

### 1. Particle trace (canvas)

Three phases on hover, 1.5 s total:

1. **0 to 60%** — a short arc of light runs the frame perimeter. Not a full ring:
   a full ring stays lit, which reads as a border rather than an event.
2. **60 to 100%** — the beam breaks into particles that decay outward along a
   small three-level branching tree, so the dispersal has structure instead of
   being a puff.

Trails come from fading the previous frame with a `destination-out` fill rather
than clearing, which keeps the canvas transparent over the image underneath.

Starts wherever the pointer crossed the boundary: the code walks 240 points
around the perimeter and takes the nearest. That one detail is most of why it
feels responsive rather than canned.

### 2. HUD annotation (DOM)

Four hairline corner brackets that push outward on hover, plus three readouts.
Two are populated from the media at runtime, the third from `data-hud` on the
figure:

```html
<figure data-hud="165 synapses · 6 fibers"> ... </figure>
```

Hidden below 700px and on any device without hover.

### 3. Play badge

A 74px ring over video, because the native control is small and often lands on
top of whatever is burned into the frame. Hides itself on play, returns on pause,
and native controls stay for scrubbing.

### 4. Source swap

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

Set these on `:root` in `hologram.css`. Space-separated RGB so they compose with
`rgb(var(--holo-line) / 0.5)`.

| token | job |
|---|---|
| `--holo-line` | hairlines, brackets, readouts |
| `--holo-beam` | the beam core |
| `--holo-glow` | its soft outer glow |
| `--holo-warm` | the single warm accent, used once |
| `--holo-panel` | panel fills |

**One warm accent, used sparingly, against a cool field.** Every good HUD in film
does this. Two accents and it stops reading as an instrument.

Tunables at the top of each block in `hologram.js`: `PAD`, `N`, `DUR`, `R`.

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

**Nothing should loop.** A trace that animates infinitely while hovered reads as
a status indicator, which is not what you meant. One pass per hover.

**Overhanging canvases cause horizontal scroll.** This one insets its canvas
negatively to give the decay branches room, which pushes past the viewport on a
narrow screen. Reserve matching margin on the frame, or hide it, which is what
the touch media query does.

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

Everything is driven by `:hover` and `:focus-within`, so keyboard users get the
same treatment. The play badge is a real `<button>` with an `aria-label` and a
visible focus ring. `prefers-reduced-motion: reduce` disables the canvas, the
transitions and the badge animation. Nothing here is load-bearing: strip every
line and the page still works.

---

## Provenance

Built for a connectomics rendering site
([amyleesterling.github.io/ca3](https://amyleesterling.github.io/ca3)), where the
media is 3D renders of neurons and the readouts are real measurements from the
reconstruction. The visual vocabulary is borrowed from film and game HUD work:
hairline strokes, tick rails, brackets, small uppercase labels, cool field with
one warm accent. Worth studying if you are going further:
[scifiinterfaces.com](https://scifiinterfaces.com),
[interfaceingame.com](https://interfaceingame.com),
[hudsandguis.com](https://www.hudsandguis.com).
>>>>>>> c2aa0d9 (Keep the repo tagline as the README subtitle)
