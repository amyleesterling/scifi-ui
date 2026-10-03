# Render queue

Offline render jobs whose **output is a static asset** committed to this repo —
a WebP, a GLB, a manifest — not something the page renders live. Every panel in
this library is fed by a real reconstruction that was rendered or decimated once,
ahead of time, and shipped as bytes; `meshes/cells/manifest.json` is the record
of one such job already done. This file is where the *next* ones wait their turn.

A job here is a brief for a person or pipeline that has the actual rendering
capability (a Neuroglancer state, a headless mesh renderer, a decimation pass).
Nothing in the page runs these. Keep each entry lossless: exact source, exact
camera, exact segment IDs, exact output contract. Root IDs are
segmentation-snapshot-specific — copy them, never "modernise" them to another
release.

**Order is oldest-first; new jobs go at the end.** Mark a job `done` in place
rather than deleting it, so the brief that produced a committed asset stays next
to the asset.

---

## Queue

1. [BANC walking / steering poster](#1-banc-walking--steering-poster) — *queued*

---

## 1. BANC walking / steering poster

*Status: queued.* Added at the end of the queue.

**Decision:** one **transparent connectome portrait** — a single 1600 × 1200
image of the 81 coloured neurons on straight alpha, no black matte, so the page's
own background and gradients read through it. The fly animation stays interactive
as it is today; the neurons sit behind it as a static poster, and **clicking the
poster mounts Neuroglancer** for anyone who wants to rotate and inspect the real
meshes. Neuroglancer's cold load is measured at **4–6 seconds**, which is exactly
why it stays opt-in and out of first paint. Colours are baked into the image
(magenta descending, green ascending) — the app does not tint this image, but its
transparent alpha lets the page show through.

Note on method: straight-alpha transparency means a plain opaque Neuroglancer
screenshot on a black panel will **not** do — a black matte cannot be undone
cleanly. This needs an alpha-capable capture: a Neuroglancer screenshot mode that
exports a transparent background, or a headless mesh render with the same camera
and baked colours. Either way the camera, framing, and colours below are the
contract.

### Required file

```
banc-walking-steering-poster.webp
```

| File | Contents | Unique IDs |
|---|---|---:|
| `banc-walking-steering-poster.webp` | The 81-neuron scene, coloured, transparent | 81 |

### Render specification

```
1600 × 1200 WebP
Transparent background
Straight alpha, no black matte
sRGB
Same 81 coloured neurons
Lossless or near-lossless alpha
Target ≤ 1 MB
```

No UI, labels, bounding box, slices, or side panels. Full brain, neck connective,
and VNC visible; keep the anatomy roughly centred so it reads on mobile. Capture
with a `layout: "3d"` view, slices off, via whichever path yields a genuine
transparent alpha channel (see the method note above).

### Camera

```json
{
  "position": [125097.5, 122589.5, 2827.5],
  "projectionOrientation": [
    -0.05649980902671814,
    -0.05089982971549034,
    0.003899986855685711,
    0.9970966577529907
  ],
  "projectionScale": 302229.5051,
  "showSlices": false,
  "layout": "3d"
}
```

### Neuron set

The existing **73** IDs from the walking-steering Neuroglancer state
(`walking-steering-neuroglancer.json`; the canonical copy is listed below), plus
these **eight**:

```
# Descending — magenta #FF1493
720575941626500746  DNg100 left
720575941500851362  DNg100 right
720575941535862506  DNa01 left
720575941432123640  DNa01 right

# Ascending — green #089C39
720575941594293032  AN09B029_b left
720575941484372221  AN09B029_b right
720575941474101344  AN02A002
720575941483106243  AN02A002
```

That produces:

```
81 neurons total
52 descending — #FF1493
29 ascending  — #089C39
```

DNa02 left/right are already among the original 73, so the eight above are all
new and the union is **81 unique cells** (73 + 8).

#### The 73-cell base scene

The walking-steering Neuroglancer state divides these by anatomical class: 48
descending (magenta `#FF1493`) and 25 ascending (green `#089C39`). The eight
additions above take the totals to 52 descending and 29 ascending.

Descending, `#FF1493`:

```text
720575941521274551, 720575941510475536, 720575941553670791,
720575941526946562, 720575941663497084, 720575941480974048,
720575941595590951, 720575941598907072, 720575941528320952,
720575941578803025, 720575941595376677, 720575941470533131,
720575941628237625, 720575941607693421, 720575941519241176,
720575941551774526, 720575941511281618, 720575941491012809,
720575941499708745, 720575941491065653, 720575941642906529,
720575941504090162, 720575941561655341, 720575941561392173,
720575941499166281, 720575941511270610, 720575941691311512,
720575941550148724, 720575941538336381, 720575941515969123,
720575941453830637, 720575941555196929, 720575941542733573,
720575941689416716, 720575941484535482, 720575941614012892,
720575941540462285, 720575941535167320, 720575941665097203,
720575941490558261, 720575941538701795, 720575941456897005,
720575941462261188, 720575941614906387, 720575941555393537,
720575941565477174, 720575941652085745, 720575941653831185
```

Ascending, `#089C39`:

```text
720575941529735883, 720575941440355157, 720575941551640711,
720575941573083656, 720575941448093972, 720575941465729878,
720575941690957787, 720575941533541720, 720575941569583474,
720575941480714626, 720575941478980291, 720575941671012263,
720575941443480234, 720575941535975617, 720575941447921940,
720575941440415455, 720575941613469916, 720575941536070170,
720575941408634671, 720575941632353506, 720575941612278630,
720575941661428280, 720575941413523604, 720575941663484540,
720575941505687234
```

(DNa02 left `720575941510475536` and right `720575941456897005` are the two IDs
in the descending list above that also carry a steering role.)

### Loading strategy

One tier of static, one tier of opt-in — the poster is never blocked on 3D.

1. **Instant, on first paint.** Show `banc-walking-steering-poster.webp`
   immediately — no WebGL, no 3D library, no mesh fetch. The fly animation plays
   over it, and the transparent alpha lets the page's background and gradients
   read through the morphology.
2. **3D on click only.** Mount Neuroglancer solely when the reader clicks the
   poster (an **Explore in 3D** affordance). Nothing about the 3D viewer happens
   before that click.
3. **Keep it mounted afterward.** Once mounted, leave Neuroglancer alive (hidden,
   not torn down) so reopening is immediate rather than paying the 4–6 s cold
   load again.

### Provenance

Labels and left/right tags come from the [public BANC mesh segment metadata](https://storage.googleapis.com/lee-lab_brain-and-nerve-cord-fly-connectome/neuron_meshes/segment_properties/info).
The meshes are the `precomputed://gs://lee-lab_brain-and-nerve-cord-fly-connectome/neuron_meshes`
source. Keep these IDs attached to **this exact mesh source** — root IDs are
segmentation/snapshot-specific and must not be silently remapped to another BANC
release, as the [Codex FAQ](https://codex.flywire.ai/faq) explains.

Public-facing caveat to ship alongside the visual:

> Representative connectome-supported cells are highlighted for explanation;
> this is not recorded neural activity or a complete causal circuit.
