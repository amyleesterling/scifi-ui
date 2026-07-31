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

1. [BANC forward / steering prerenders](#1-banc-forward--steering-prerenders) — *queued*

---

## 1. BANC forward / steering prerenders

*Status: queued.* Added at the end of the queue.

**Decision:** use **four matched transparent prerenders** as the primary
visual, with Neuroglancer as an opt-in second tier. Neuroglancer's cold load is
measured at **4–6 seconds** — too slow to be the thing a reader sees first.
Layered over the app's own black background the prerenders crossfade on
key/button input, so steering feels instantaneous and **Neuroglancer is never
loaded until the user explicitly asks for 3D**. The four images share one
camera, one crop, one alpha grid; the app supplies the black background and
every colour.

### Required files

| File | Contents | Unique IDs |
|---|---|---:|
| `banc-context-base.webp` | All neurons, neutral gray | 81 |
| `banc-forward-mask.webp` | Forward-walking exemplars | 6 |
| `banc-turn-left-mask.webp` | Left DNa01 + DNa02 | 2 |
| `banc-turn-right-mask.webp` | Right DNa01 + DNa02 | 2 |
| `manifest.json` | Camera, IDs, labels, laterality, checksums | — |

The base is the union of the existing 73-cell scene plus the six forward cells
and the two DNa01 cells. DNa02 (both sides) is already inside the 73-cell scene,
so the union is **81 unique cells**, not 73 + 8.

### Render specification

```json
{
  "source": "precomputed://gs://lee-lab_brain-and-nerve-cord-fly-connectome/neuron_meshes",
  "dataset_scene": "BANC 2026a",
  "resolution": [1600, 1200],
  "aspect_ratio": "4:3",
  "background": "transparent",
  "color_space": "sRGB",
  "format": "lossless WebP with alpha",
  "camera": {
    "projection": "orthographic",
    "position": [125097.5, 122589.5, 2827.5],
    "projection_orientation_xyzw": [
      -0.05649980902671814,
      -0.05089982971549034,
      0.003899986855685711,
      0.9970966577529907
    ],
    "projection_scale": 302229.5051,
    "dimension_units_m": {
      "x": 4e-9,
      "y": 4e-9,
      "z": 4.5e-8
    }
  }
}
```

**Framing and quality:**

- Identical camera, framing, crop, and alpha alignment for every file.
- Full brain, neck connective, and VNC visible.
- Keep the anatomy within the central square so it also fits mobile.
- Approximately 8% vertical and 12% horizontal safe margins.
- No UI, axes, labels, slices, bounding box, scale bar, or region outlines.
- Render masks as white anatomy with antialiased straight (non-premultiplied) alpha.
- Preserve processes at a minimum visible width of about one output pixel.
- Supersample at least 2× before downsampling.
- A slight 4–6 px soft alpha halo is welcome, but keep the morphology itself sharp.
- Target total web payload under 1.5 MB; 3 MB is the hard ceiling.

The app supplies the black `#000000` background and all tinting, so the base and
the three masks are all rendered as **white anatomy on transparent** — no colour
is baked into the WebPs.

### Loading strategy

Two tiers. The prerenders carry the whole default experience; Neuroglancer is a
click away and never in the critical path.

1. **Instant, on first paint.** Show `banc-context-base.webp` immediately — no
   fetch of anything heavy, no WebGL, no 3D library. This is the idle state.
2. **Instant steering.** Forward, left, and right are the three masks already
   loaded alongside the base; an action crossfades between them and never
   reloads an image, so driving is instantaneous and low-CPU.
3. **3D on request only.** Mount Neuroglancer solely when the reader clicks
   **Explore in 3D**. Nothing about the 3D viewer — not the library, not the
   mesh fetch, not a WebGL context — happens before that click.
4. **Keep it mounted afterward.** Once mounted, leave Neuroglancer alive
   (hidden, not torn down) so reopening 3D is immediate rather than paying the
   4–6 s cold load a second time.

Because the masks are rendered on transparent alpha, the page's own colour
gradients read through the neuron morphology rather than being flattened behind
an opaque plate — the tinting and the anatomy occupy the same pixels.

### App colours and behaviour

The four images are layered; the app composites and tints them. It never reloads
an image — actions crossfade the already-loaded masks.

Base anatomy:

```text
#52675E at 22–28% opacity
```

Activation gradient, top to bottom (positional colouring of a mask):

```text
Brain / descending       #FFC857
Neck / ascending         #8AC7FF
VNC / body-state         #68D6C4
Motor-facing terminals   #FF7F6E
```

Steering-type-specific colouring, used instead of the positional gradient:

```text
DNa02, high-gain steering  #FFC857
DNa01, low-gain steering   #D8EC71
```

Interaction timing:

```text
Key/button down: active mask to 100% in 120 ms
Key/button release: fade to 0% in 260 ms
Action change: crossfade masks; never reload an image
Idle: base layer only
```

### Exact action IDs

Forward walking — representative cells, not an exhaustive walking circuit:

```json
{
  "DNg100": {
    "left":  "720575941626500746",
    "right": "720575941500851362"
  },
  "AN09B029_b": {
    "left":  "720575941594293032",
    "right": "720575941484372221"
  },
  "AN02A002": [
    "720575941474101344",
    "720575941483106243"
  ]
}
```

Steer left:

```json
{
  "DNa01_left": "720575941535862506",
  "DNa02_left": "720575941510475536"
}
```

Steer right:

```json
{
  "DNa01_right": "720575941432123640",
  "DNa02_right": "720575941456897005"
}
```

### Existing 73-cell context scene

The current Neuroglancer state divides these by anatomical class — not by turn
direction: 48 descending neurons are magenta and 25 ascending neurons are green.
These IDs feed `banc-context-base.webp` (rendered neutral gray, alongside the six
forward cells and the two DNa01 cells).

Descending, current source colour `#FF1493`:

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

Ascending, current source colour `#089C39`:

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

### Provenance

Labels and left/right tags come from the [public BANC mesh segment metadata](https://storage.googleapis.com/lee-lab_brain-and-nerve-cord-fly-connectome/neuron_meshes/segment_properties/info).
Keep these IDs attached to **this exact mesh source** — root IDs are
segmentation/snapshot-specific and must not be silently remapped to another BANC
release, as the [Codex FAQ](https://codex.flywire.ai/faq) explains.

Public-facing caveat to ship alongside the visual:

> Representative connectome-supported cells are highlighted for explanation;
> this is not recorded neural activity or a complete causal circuit.
