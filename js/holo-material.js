/* A hologram material for three.js (GLSL ES, WebGL2 via three r16x).
 *
 * THE LOOK. A projected volume of light rather than a lit surface. Where the
 * surface faces you it is nearly clear; where you see it edge on it glows an
 * electric cyan; its topology is drawn by a lattice of tiny sharp dots that
 * sit on the surface; and every so often the signal degrades, the vertices
 * shiver and the colour channels pull apart, then it settles. No horizontal
 * scanlines and nothing scrolls. The reference is the FlyWire Codex brain and
 * nerve cord, a translucent blue-white shell with fibres inside it.
 *
 * THREE ERAS ON ONE MATERIAL. Everything above is the 2026 hologram: light on
 * the outside of a shape. The later uniforms turn it into a light field, light
 * computed inside the object rather than projected onto it:
 *
 *   thickness     A second pass writes the depth of the nearest back face
 *                 (makeThicknessPass). The fragment subtracts its own depth,
 *                 which is how much object the ray passes through, and the
 *                 interior glows by Beer's law: 1 - exp(-thickness * uDensity),
 *                 scaled by uInner. A soma is denser light than a dendrite.
 *   lattice       uLattice 1 replaces the dot grid with four plane waves
 *                 summed in 3D. Their nodes form a lattice on any surface, and
 *                 each wave carries a phase from the view direction
 *                 (uParallax), so the nodes drift as you move, the way the
 *                 fringes of a real hologram do.
 *   diffraction   uIridescence runs the rim through a spectrum at grazing
 *                 angles, like a holographic plate, on top of the base colour.
 *   touch         uPointer is a world point on the surface (the demo raycasts
 *                 it). Rings of interference travel out from it through the
 *                 volume and decay, so the object answers a hand.
 *   voxel glitch  uVoxel > 0 makes a burst re-quantise the geometry to a grid
 *                 instead of shivering it: a digital recompute, not analog
 *                 noise.
 *
 * FIVE INGREDIENTS OF THE 2026 LOOK, EVERY ONE A UNIFORM.
 *
 *   Transparency  Additive blending, depthWrite off, so overlapping dendrites
 *                 sum the way light does. The body contribution (uBodyAlpha)
 *                 is tiny, which is what makes the centre translucent.
 *   Fresnel rim   1 - dot(N, V) raised to uFresnelPower, times uGlowIntensity.
 *                 The rim core is pushed toward white so the brightest edge
 *                 reads as hot rather than as a thicker line.
 *   Dot grid      A triplanar lattice of dots in WORLD space. Triplanar, so
 *                 a surface at any angle receives an even dot spacing rather
 *                 than a smeared one; world space, so the lattice belongs to
 *                 the projector and holds still while the object turns.
 *   Glitch        A 1D value noise of time, sampled at uGlitchFreq, gated
 *                 through a smoothstep so interference arrives in short
 *                 bursts. During a burst the vertex shader jitters positions
 *                 by a 3D noise (uGlitchAmount) and the fragment shader
 *                 widens the chromatic split (uChroma).
 *   Form          One fixed key direction gives the body a little shading so
 *                 a soma still reads as a volume. It is not a scene light.
 *
 * COLOUR. The fragment ends with three.js's tonemapping and colorspace chunks.
 * A raw ShaderMaterial does not get them for free; without them the output
 * ships with a gamma still on it and comes out about half as bright as the
 * colour you asked for.
 */
import * as THREE from "three";

export const HOLO_DEFAULTS = {
  color: "#7EE0FF",        /* --holo-cyan, the rim and the dots */
  coreColor: "#EAF8FF",    /* what the rim burns toward at its brightest */
  glowIntensity: 1.1,      /* rim gain. Above ~1.5 the edge clips to white */
  fresnelPower: 2.6,       /* higher is a thinner rim */
  bodyAlpha: 0.035,        /* haze the facing surface still carries */
  dotScale: 30,            /* dots (or lattice nodes) per world unit */
  dotRadius: 0.08,         /* dot radius as a fraction of one cell */
  dotIntensity: 1.0,       /* dot gain */
  glitchFreq: 1.8,         /* noise samples per second; bursts arrive faster */
  glitchAmount: 0.012,     /* vertex jitter as a fraction of the object height */
  chroma: 0.5,             /* channel split at the rim, 0 none */
  opacity: 1.0,            /* overall gain, may exceed 1 */
  /* the light field, all off for the 2026 look */
  density: 0,              /* optical density per world unit, 0 no volume */
  inner: 0.3,              /* gain on the volume glow */
  lattice: 0,              /* 0 dot grid, 1 interference lattice */
  parallax: 3,             /* how far the lattice nodes drift with the view */
  iridescence: 0,          /* spectrum at the rim, 0 none */
  voxel: 0,                /* burst voxel size as a fraction of height, 0 off */
  touch: 0,                /* gain on the pointer rings. Off by default: the
                              rings are a 3D distance from the hit, so on a
                              folded surface they light the folds behind the
                              point too and read as rings from nowhere */
  /* two things that are not uniforms of the surface shader */
  solid: 0,                /* 1: a depth prepass keeps only the nearest surface,
                              so a folded mesh reads as one lit body instead of
                              a stack of translucent layers */
  halo: 0,                 /* glow: a tight light just outside the silhouette */
  haloSize: 0.05,          /* how far the glow reaches, world units */
  haloColor: "#FFE6B0",    /* colour of the glow and the bloom */
  bloom: 0,                /* bloom: a wide soft haze around the whole object */
  bloomSize: 0.25,         /* how far the bloom reaches, world units */
  opaque: 0,               /* 1: normal blending and depth write. A surface you
                              cannot see through, on any background */
  shade: 0,                /* 0 hologram body, 1 a lit surface (lambert) */
  /* the opaque surface model, used when opaque is 1 */
  rough: 0.35,             /* microfacet roughness */
  metal: 0.6,              /* 0 dielectric, 1 metal: what the specular is tinted by */
  env: 0.8,                /* strength of the procedural studio reflected in it */
  film: 420,               /* thin film thickness, nanometres: sets the rainbow bands */
  iri: 0.8,                /* strength of the thin film interference colour */
  sparkle: 1.0,            /* diffraction glints, spectral, view dependent */
  sparkleScale: 140,       /* glint cells per world unit */
  cavity: 0.6,             /* how much the sulci darken */
  /* the weather: recorded activity running across the surface */
  weather: 0,              /* 1 on. Needs setWeather() to have been given data */
  weatherFilm: 380,        /* nanometres of film thickness per unit of activity */
  weatherGlow: 0.35,       /* warm light added per unit of activity */
  weatherSpread: 0.13,     /* how far a cell's activity reaches, mesh units */
  weatherSpeed: 0.9,       /* how fast it travels outward, mesh units per second of recording */
  weatherLift: 0.012,      /* how far the surface rises where there is activity, mesh units */
  emission: 0,             /* light the surface gives off on its own, opaque styles */
  color2: "#7B3FE4",       /* the second colour of an ombre */
  ombre: 0,                /* 0 one colour; 1 color at the top running to color2 at the base */
  surfaceAlpha: 1,         /* opaque path only: the surface's own alpha, so a lit
                              surface can still be part transparent (normal
                              blending, depth write off below 0.5, as the
                              human-brain page does it) */
  spectral: 0,             /* dichroic shift: how far the hue walks around the wheel from
                              face on to grazing, 1 is two thirds of a turn */
  spectralDrift: 0,        /* hue drift over time, turns per minute */
};

/* three presets on the same material */
export const HOLO_ERAS = {
  2026: {},
  2076: { density: 0.9, inner: 0.35, iridescence: 0.25, voxel: 0.02, glitchAmount: 0.006 },
  2226: { density: 1.6, inner: 0.5, lattice: 1, parallax: 4, iridescence: 0.7, dotScale: 40,
          voxel: 0.035, glitchAmount: 0.003, chroma: 0.8, fresnelPower: 3.2,
          bodyAlpha: 0.015, dotIntensity: 1.3 },
};

/* Named styles: whole looks, each a different idea of what a hologram is,
   all on a warm white and gold core. A style sets colours as well as
   numbers and wins over the era it is laid on. Amy's brief: warm white,
   golden glow, bright, friendly, a supernova. */
export const HOLO_STYLES = {
  /* a star seen through glass: the interior is the light source, the rim a
     white hot line, no pattern at all */
  supernova: {
    color: "#FFC964", coreColor: "#FFF6E0", glowIntensity: 1.6, fresnelPower: 2.4,
    bodyAlpha: 1.0, shade: 1, dotIntensity: 0, density: 0, inner: 0, iridescence: 0,
    chroma: 0.1, glitchAmount: 0.003, voxel: 0, lattice: 0, opaque: 1, solid: 1,
    halo: 1.2, haloSize: 0.06, haloColor: "#FFC24A", opacity: 1, emission: 0.6,
    rough: 0.5, metal: 0.2, env: 0.5, film: 380, iri: 0.2, sparkle: 0.8,
    sparkleScale: 120, cavity: 0.45, bloom: 1.6, bloomSize: 0.28,
  },
  /* a paper lantern: soft, warm, hardly any rim, the body itself lit from
     within, a fine gentle dot grid like the weave of the paper */
  lantern: {
    color: "#FFD9A0", coreColor: "#FFFDF7", glowIntensity: 0.4, fresnelPower: 1.2,
    bodyAlpha: 0.9, dotScale: 90, dotRadius: 0.12, dotIntensity: 0.4,
    density: 0.8, inner: 0.3, iridescence: 0, chroma: 0, glitchAmount: 0,
    voxel: 0, lattice: 0, solid: 1, halo: 0.5, haloSize: 0.06, haloColor: "#FFE0A8",
    opacity: 1, bloom: 1.0, bloomSize: 0.3,
  },
  /* champagne aurora: the gold rim runs through a spectrum at grazing
     angles, a voxel glitch keeps re-computing it, the lattice hums */
  aurora: {
    color: "#FFCF7A", coreColor: "#FFFFFF", glowIntensity: 1.1, fresnelPower: 2.8,
    bodyAlpha: 0.3, lattice: 1, dotScale: 34, dotRadius: 0.06, dotIntensity: 1.0,
    parallax: 9, density: 0.7, inner: 0.3, iridescence: 0.9, chroma: 0.5,
    voxel: 0.012, glitchAmount: 0.002, solid: 1, opacity: 1, halo: 0.5, haloSize: 0.06,
    haloColor: "#FFD27A",
  },
  /* gold on blue: a cool blue body with a molten gold rim and gold dots, the
     one warm accent on a cool field, the library's own rule */
  goldOnBlue: {
    color: "#3E96F0", coreColor: "#FFD27A", glowIntensity: 3.2, fresnelPower: 3.0,
    bodyAlpha: 0.7, dotScale: 30, dotRadius: 0.08, dotIntensity: 0.8,
    density: 1.0, inner: 0.3, iridescence: 0, chroma: 0.4, voxel: 0,
    glitchAmount: 0.008, lattice: 0, solid: 1, halo: 0.9, haloSize: 0.08,
    haloColor: "#FFC24A", opacity: 1,
  },
  /* nova core: the supernova as a solid object. Warm white gold, opaque, a
     wide golden bloom around it, and just enough interference that the
     white is never flat. */
  novaCore: {
    color: "#FFE7BE", coreColor: "#FFFFFF", glowIntensity: 1.4, fresnelPower: 2.2,
    bodyAlpha: 1.0, shade: 1, dotIntensity: 0, density: 0, inner: 0, iridescence: 0,
    chroma: 0.1, glitchAmount: 0.002, voxel: 0, lattice: 0, opaque: 1, solid: 1,
    halo: 1.2, haloSize: 0.07, haloColor: "#FFC24A", opacity: 1,
    rough: 0.42, metal: 0.35, env: 1.0, film: 520, iri: 0.45, sparkle: 1.1,
    sparkleScale: 130, cavity: 0.55, bloom: 1.8, bloomSize: 0.32,
  },
  /* holographic foil: a gold surface you cannot see through, with the
     rainbow of a thin film sliding across it as it turns and spectral
     glints scattered off a diffraction layer */
  holoFoil: {
    color: "#FFD27A", coreColor: "#FFFFFF", glowIntensity: 0.9, fresnelPower: 3.0,
    bodyAlpha: 1.0, shade: 1, dotIntensity: 0, density: 0, inner: 0, iridescence: 0,
    chroma: 0.1, glitchAmount: 0.002, voxel: 0, lattice: 0, opaque: 1, solid: 1,
    halo: 1.0, haloSize: 0.1, haloColor: "#FFC24A", opacity: 1,
    rough: 0.22, metal: 0.85, env: 1.1, film: 480, iri: 1.3, sparkle: 1.6,
    sparkleScale: 150, cavity: 0.7,
  },
  /* opal: warm white, soft, the rainbow scattered inside a milky surface
     rather than reflected off it, a pearl */
  opal: {
    color: "#3E96F0", coreColor: "#FFFFFF", glowIntensity: 0.7, fresnelPower: 2.2,
    bodyAlpha: 1.0, shade: 1, dotIntensity: 0, density: 0, inner: 0, iridescence: 0,
    chroma: 0.05, glitchAmount: 0, voxel: 0, lattice: 0, opaque: 1, solid: 1,
    halo: 0.7, haloSize: 0.06, haloColor: "#FFE9C4", opacity: 1,
    rough: 0.5, metal: 0.08, env: 0.55, film: 380, iri: 1.0, sparkle: 0.7,
    sparkleScale: 110, cavity: 0.85, bloom: 0.6, bloomSize: 0.22,
  },
  /* chrome sun: a warm mirror. The studio and its sun are in the surface,
     the rainbow is a thin oil film on chrome */
  chromeSun: {
    color: "#FFE2B0", coreColor: "#FFFFFF", glowIntensity: 0.5, fresnelPower: 3.5,
    bodyAlpha: 1.0, shade: 1, dotIntensity: 0, density: 0, inner: 0, iridescence: 0,
    chroma: 0, glitchAmount: 0.001, voxel: 0, lattice: 0, opaque: 1, solid: 1,
    halo: 0.6, haloSize: 0.08, haloColor: "#FFD27A", opacity: 1,
    rough: 0.1, metal: 1.0, env: 1.5, film: 300, iri: 0.7, sparkle: 0.4,
    sparkleScale: 90, cavity: 0.5,
  },
  /* solid gold: not a projection at all, a warm white gold object with a lit
     surface you cannot see through, a gold rim and a soft bloom. The one
     for a page that is not black. */
  solidGold: {
    color: "#FFD27A", coreColor: "#FFFFFF", glowIntensity: 1.3, fresnelPower: 2.8,
    bodyAlpha: 1.0, shade: 1, dotScale: 30, dotRadius: 0.08, dotIntensity: 0.25,
    density: 0, inner: 0, iridescence: 0, chroma: 0.15, glitchAmount: 0.002,
    voxel: 0, lattice: 0, opaque: 1, solid: 1, halo: 1.2, haloSize: 0.1,
    haloColor: "#FFC24A", opacity: 1,
    rough: 0.4, metal: 0.5, env: 0.7, film: 450, iri: 0.35, sparkle: 0.5,
    sparkleScale: 120, cavity: 0.6,
  },
  /* glass: the BANC and FlyWire shell. A cool translucent skin with a
     bright cyan edge, a deep blue haze inside, almost no pattern. Made to
     hold coloured things; alone it is the vessel. */
  glass: {
    color: "#2E6FBF", coreColor: "#9FF0FF", glowIntensity: 2.4, fresnelPower: 3.6,
    bodyAlpha: 0.12, dotScale: 30, dotRadius: 0.06, dotIntensity: 0.15, lattice: 0,
    density: 1.2, inner: 0.22, iridescence: 0.1, chroma: 0.25, glitchAmount: 0.002,
    voxel: 0, solid: 1, opaque: 0, opacity: 1, halo: 0.9, haloSize: 0.04,
    haloColor: "#7EE0FF", bloom: 0.3, bloomSize: 0.2, iri: 0, sparkle: 0,
  },
  /* neon glass: the BANC palette. Magenta at the crown running to violet
     at the base, saturated, inside the same cyan edged glass */
  neonGlass: {
    color: "#FF3FD8", color2: "#5B2BFF", ombre: 1, coreColor: "#9FF0FF",
    glowIntensity: 2.2, fresnelPower: 3.2, bodyAlpha: 0.55, dotIntensity: 0.1,
    dotScale: 30, lattice: 0, density: 1.6, inner: 0.4, iridescence: 0.15, chroma: 0.3,
    glitchAmount: 0.002, voxel: 0, solid: 1, opaque: 0, opacity: 1, halo: 1.0,
    haloSize: 0.045, haloColor: "#7EE0FF", bloom: 0.5, bloomSize: 0.22, iri: 0.2,
    sparkle: 0.3, film: 420,
  },
  /* matte and gloss: plain coloured materials, no hologram in them at all.
     Neither sets a colour, so the swatch or the colour picker is the
     colour, and roughness, metal and the studio are the whole story.
     Rasterised, one key and a fill: no ray tracing, no diffuse bounce. */
  matte: {
    coreColor: "#FFFFFF", glowIntensity: 0.15, fresnelPower: 3, bodyAlpha: 1.0, shade: 1,
    dotIntensity: 0, density: 0, inner: 0, iridescence: 0, chroma: 0, glitchAmount: 0,
    voxel: 0, lattice: 0, opaque: 1, solid: 1, surfaceAlpha: 1, halo: 0, bloom: 0,
    opacity: 1, emission: 0.05, rough: 0.85, metal: 0, env: 0.25, iri: 0, sparkle: 0,
    cavity: 0.5, spectral: 0,
  },
  gloss: {
    coreColor: "#FFFFFF", glowIntensity: 0.3, fresnelPower: 3, bodyAlpha: 1.0, shade: 1,
    dotIntensity: 0, density: 0, inner: 0, iridescence: 0, chroma: 0, glitchAmount: 0,
    voxel: 0, lattice: 0, opaque: 1, solid: 1, surfaceAlpha: 1, halo: 0, bloom: 0,
    opacity: 1, emission: 0.03, rough: 0.18, metal: 0.05, env: 0.7, iri: 0, sparkle: 0,
    cavity: 0.5, spectral: 0,
  },
  /* matte and gloss: plain coloured materials, no hologram in them at all.
     Neither sets a colour, so the swatch or the colour picker is the
     colour, and roughness, metal and the studio are the whole story.
     Rasterised, one key and a fill: no ray tracing, no diffuse bounce. */
  matte: {
    coreColor: "#FFFFFF", glowIntensity: 0.15, fresnelPower: 3, bodyAlpha: 1.0, shade: 1,
    dotIntensity: 0, density: 0, inner: 0, iridescence: 0, chroma: 0, glitchAmount: 0,
    voxel: 0, lattice: 0, opaque: 1, solid: 1, surfaceAlpha: 1, halo: 0, bloom: 0,
    opacity: 1, emission: 0.05, rough: 0.85, metal: 0, env: 0.25, iri: 0, sparkle: 0,
    cavity: 0.5, spectral: 0,
  },
  gloss: {
    coreColor: "#FFFFFF", glowIntensity: 0.3, fresnelPower: 3, bodyAlpha: 1.0, shade: 1,
    dotIntensity: 0, density: 0, inner: 0, iridescence: 0, chroma: 0, glitchAmount: 0,
    voxel: 0, lattice: 0, opaque: 1, solid: 1, surfaceAlpha: 1, halo: 0, bloom: 0,
    opacity: 1, emission: 0.03, rough: 0.18, metal: 0.05, env: 0.7, iri: 0, sparkle: 0,
    cavity: 0.5, spectral: 0,
  },
  /* atlas: the human-brain page's somatotopy hologram, carried across from
     amyleesterling/human-brain js/brain-surface.js and js/somatotopy.js
     at ?surf=0.4. There: a MeshLambertMaterial cortex at opacity 0.4,
     DoubleSide, depthWrite off, emissive 0x0d1626 so the inside reads as
     dark glass; a separate additive fresnel shell, tint 0x4fb8ff, power
     2.4, strength min(0.75, 0.25 + 0.4 * 0.5) = 0.45; ambient 0.85, a
     white key 0.95, a fill 0.32, a cool rim light 0x9fd0ff 0.4. Two
     deviations, written down: the rim is composed in the same fragment
     rather than as a second additive pass, and the page's cortex is
     vertex painted by parcel, which this mesh has no labels for, so the
     body is one tone. */
  atlas: {
    color: "#A9B4C6", coreColor: "#4FB8FF", glowIntensity: 1.6, fresnelPower: 2.4,
    bodyAlpha: 1.0, shade: 1, dotIntensity: 0, density: 0, inner: 0, iridescence: 0,
    chroma: 0, glitchAmount: 0, voxel: 0, lattice: 0, opaque: 1, solid: 0,
    surfaceAlpha: 0.4, halo: 0, bloom: 0, opacity: 1, emission: 0.3,
    rough: 0.9, metal: 0, env: 0.15, film: 400, iri: 0, sparkle: 0, cavity: 0.3,
  },
  /* orchid: a pink hologram that runs to purple toward the base, opaque,
     with a soft violet bloom and a little film so the pink has depth */
  orchid: {
    color: "#FF7AD9", color2: "#6B2FD9", ombre: 1, coreColor: "#FFF0FA",
    glowIntensity: 1.5, fresnelPower: 2.6, bodyAlpha: 1.0, shade: 1, dotIntensity: 0,
    density: 0, inner: 0, iridescence: 0, chroma: 0.15, glitchAmount: 0.002, voxel: 0,
    lattice: 0, opaque: 1, solid: 1, halo: 1.0, haloSize: 0.06, haloColor: "#C86BFF",
    opacity: 1, emission: 0.25, rough: 0.4, metal: 0.25, env: 0.7, film: 400, iri: 0.35,
    sparkle: 0.7, sparkleScale: 120, cavity: 0.55, bloom: 1.0, bloomSize: 0.24,
  },
  /* white heat: an incandescent surface. Opaque, warm white, a hot white
     rim, a wide white gold bloom, and just enough film that the white has
     depth. Not a projection: a thing that is glowing. */
  whiteHeat: {
    color: "#FFF1DC", coreColor: "#FFFFFF", glowIntensity: 2.2, fresnelPower: 2.6,
    bodyAlpha: 1.1, shade: 1, dotIntensity: 0, density: 0, inner: 0, iridescence: 0,
    chroma: 0.05, glitchAmount: 0.002, voxel: 0, lattice: 0, opaque: 1, solid: 1,
    halo: 1.4, haloSize: 0.07, haloColor: "#FFE0A8", opacity: 1,
    rough: 0.3, metal: 0.15, env: 1.2, film: 320, iri: 0.3, sparkle: 0.9,
    sparkleScale: 120, cavity: 0.5, bloom: 2.0, bloomSize: 0.34,
  },
};

const NOISE = /* glsl */ `
float hash(float n) { return fract(sin(n) * 43758.5453123); }
float hash3(vec3 p) { return hash(dot(p, vec3(1.0, 57.0, 113.0))); }
/* 1D value noise, smooth in time */
float noise1(float x) {
  float i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash(i), hash(i + 1.0), f);
}
/* 3D value noise */
float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n = dot(i, vec3(1.0, 57.0, 113.0));
  return mix(
    mix(mix(hash(n),         hash(n + 1.0),   f.x),
        mix(hash(n + 57.0),  hash(n + 58.0),  f.x), f.y),
    mix(mix(hash(n + 113.0), hash(n + 114.0), f.x),
        mix(hash(n + 170.0), hash(n + 171.0), f.x), f.y), f.z);
}
/* the interference envelope: mostly 0, short bursts toward 1 */
float burst(float t, float freq) {
  float n = noise1(t * freq) * 0.6 + noise1(t * freq * 3.7 + 11.0) * 0.4;
  return smoothstep(0.58, 0.82, n);
}`;

const VERT = /* glsl */ `
uniform float uTime;
uniform float uGlitchFreq;
uniform float uGlitchAmount;
uniform float uVoxel;
uniform vec2  uBounds;      /* world y of the bottom and top of the object */
uniform float uWeather;
uniform float uWeatherSpread;
uniform float uWeatherSpeed;
uniform float uWeatherLift;
uniform float uFrame;          /* the recording frame being shown, fractional */
uniform vec2  uTraceSize;      /* cells, frames */
uniform sampler2D uTraces;     /* activity, cells across, frames down */
uniform sampler2D uEpicentres; /* one texel per cell: its point on the surface, mesh space */
varying vec3  vN;
varying vec3  vV;
varying vec3  vW;
varying float vBurst;
varying float vDepth;
varying float vWeather;
${NOISE}

/* The weather. Every cell's recorded activity, read at a delay that grows
   with distance from the cell's point on the surface, so a burst runs
   outward as a ring at uWeatherSpeed and dies away over uWeatherSpread. The
   sum over all cells is one number per vertex. Nothing here is generated:
   the texture is the calcium recording, frame for frame. */
float weatherAt(vec3 p) {
  if (uWeather < 0.5) return 0.0;
  float total = 0.0;
  float cells = uTraceSize.x, frames = uTraceSize.y;
  for (int i = 0; i < 128; i++) {
    if (float(i) >= cells) break;
    float u = (float(i) + 0.5) / cells;
    vec3 e = texture2D(uEpicentres, vec2(u, 0.5)).xyz;
    float d = distance(p, e);
    float fall = exp(-d / uWeatherSpread);
    if (fall < 0.02) continue;
    /* the delay: the ring has to travel d at uWeatherSpeed, in recording
       seconds, which is frames at 30 a second */
    float f = uFrame - d / uWeatherSpeed * 30.0;
    if (f < 0.0) continue;
    /* above baseline only: a calcium trace sits at a resting level and the
       weather is the rise, not the rest */
    float a = max(texture2D(uTraces, vec2(u, (f + 0.5) / frames)).r - 0.22, 0.0) * 1.3;
    total += a * fall;
  }
  /* a soft knee, so a hundred cells cannot sum to a white sheet */
  return 1.0 - exp(-total);
}
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float extent = max(uBounds.y - uBounds.x, 1e-3);

  /* signal interference: during a burst every vertex shivers by a 3D noise
     that itself moves quickly, mostly sideways, a little along the normal */
  float b = burst(uTime, uGlitchFreq);
  vec3 q = wp.xyz * 9.0 + vec3(0.0, uTime * 7.0, 0.0);
  vec3 j = vec3(noise3(q) - 0.5, (noise3(q + 31.0) - 0.5) * 0.3, noise3(q + 67.0) - 0.5);
  wp.xyz += j * (uGlitchAmount * extent * b);

  /* the digital glitch: a burst snaps the geometry to a voxel grid, and the
     grid is finer or coarser from one tick to the next */
  if (uVoxel > 0.0) {
    float cell = uVoxel * extent * (0.6 + 0.8 * hash(floor(uTime * 12.0)));
    vec3 snapped = (floor(wp.xyz / cell) + 0.5) * cell;
    wp.xyz = mix(wp.xyz, snapped, step(0.5, b));
  }
  vBurst = b;
  vWeather = weatherAt(position);
  /* the surface breathes where the cells fire */
  wp.xyz += normalize(mat3(modelMatrix) * normal) * (vWeather * uWeatherLift);

  vec4 mv = viewMatrix * wp;
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  vW = wp.xyz;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
precision highp float;
uniform vec3  uColor;
uniform vec3  uCoreColor;
uniform float uTime;
uniform float uGlowIntensity;
uniform float uFresnelPower;
uniform float uBodyAlpha;
uniform float uDotScale;
uniform float uDotRadius;
uniform float uDotIntensity;
uniform float uChroma;
uniform float uOpacity;
uniform float uDensity;
uniform float uInner;
uniform float uLattice;
uniform float uParallax;
uniform float uIridescence;
uniform float uTouch;
uniform float uShade;
uniform float uRough;
uniform float uMetal;
uniform float uEnv;
uniform float uFilm;
uniform float uIri;
uniform float uSparkle;
uniform float uSparkleScale;
uniform float uCavity;
uniform float uWeatherFilm;
uniform float uWeatherGlow;
uniform float uEmission;
uniform vec3  uColor2;
uniform float uOmbre;
uniform float uSpectral;
uniform float uSpectralDrift;
uniform float uSurfaceAlpha;

/* rotate a colour's hue by an angle in turns, in YIQ, so the shift keeps
   the colour's own brightness */
vec3 hueShift(vec3 c, float turns) {
  const vec3 k = vec3(0.57735);
  float a = turns * 6.28318;
  float ca = cos(a), sa = sin(a);
  return c * ca + cross(k, c) * sa + k * dot(k, c) * (1.0 - ca);
}
uniform vec3  uPointer;
uniform float uPointerT;
uniform float uPointerOn;
uniform sampler2D uThick;
uniform vec2  uResolution;
uniform vec2  uBounds;
varying vec3  vN;
varying vec3  vV;
varying vec3  vW;
varying float vBurst;
varying float vDepth;
varying float vWeather;
${NOISE}

/* one plane of the lattice: distance to the nearest cell centre in 2D,
   turned into a sharp dot with a one pixel soft edge */
float dots2(vec2 p) {
  vec2 c = fract(p) - 0.5;
  float d = length(c);
  float aa = fwidth(d) * 1.2;
  return 1.0 - smoothstep(uDotRadius - aa, uDotRadius + aa, d);
}

/* thin film interference: each wavelength at its own phase for a film of
   the given thickness seen at NdV, pushed hard away from grey */
vec3 thinFilm(float thick, float NdV) {
  vec3 lam = vec3(650.0, 540.0, 470.0);
  vec3 phase = 4.0 * 3.14159 * 1.4 * thick * NdV / lam;
  vec3 iri = 0.5 + 0.5 * cos(phase);
  iri = clamp(mix(vec3(dot(iri, vec3(0.333))), iri, 2.6), 0.0, 1.0);
  return iri * iri;
}
/* diffraction glints: a random micro normal per cell, a tight highlight
   off it, coloured by where in the spectrum its order falls */
vec3 glints(vec3 P, vec3 N, vec3 V, vec3 L, float NdV, float scale, float t) {
  vec3 cell = floor(P * scale);
  float pick = hash3(cell);
  vec3 micro = normalize(N + (vec3(hash3(cell + 1.0), hash3(cell + 2.0), hash3(cell + 3.0)) - 0.5) * 0.7);
  float glint = pow(max(dot(reflect(-L, micro), V), 0.0), 220.0) * step(0.55, pick);
  float hue = fract(hash3(cell + 4.0) + NdV * 1.5 + t * 0.05);
  vec3 glintCol = 0.55 + 0.45 * cos(6.28318 * (hue + vec3(0.0, 0.33, 0.67)));
  return glintCol * glint;
}
/* a spectrum from 0 to 1, red through violet, for the diffraction rim */
vec3 spectrum(float x) {
  return clamp(vec3(abs(x * 6.0 - 3.0) - 1.0, 2.0 - abs(x * 6.0 - 2.0),
                    2.0 - abs(x * 6.0 - 4.0)), 0.0, 1.0);
}

void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(vV);
  /* the colour, and the ombre: uColor at the top of the object running to
     uColor2 at its base, by world height */
  float ty = clamp((vW.y - uBounds.x) / max(uBounds.y - uBounds.x, 1e-3), 0.0, 1.0);
  vec3 C = mix(uColor, mix(uColor2, uColor, ty), uOmbre);
  /* the spectral shift: a dichroic film's colour depends on the angle it is
     seen at, so the hue walks with 1 - N.V, and may drift with time */
  float grazing = 1.0 - abs(dot(N, V));   /* abs: the normal is not faced yet, and winding lies */
  C = hueShift(C, uSpectral * 0.66 * grazing + uSpectralDrift * uTime / 60.0);
  /* face the normal toward the eye by geometry, not by winding: a mirrored
     export (the mouse brain is one) has every triangle wound backwards */
  if (dot(N, V) < 0.0) N = -N;
  float f = 1.0 - clamp(dot(N, V), 0.0, 1.0);

  /* rim, split by channel. A faint constant split, widened during a burst,
     so red hugs the body and blue reaches past it */
  float split = 0.3 * uChroma * (0.35 + vBurst);
  float p = uFresnelPower;
  vec3 rim = vec3(pow(f, p * (1.0 + split)), pow(f, p), pow(f, p * (1.0 - split)));
  rim *= uGlowIntensity;

  /* the surface pattern: either the dot grid, triplanar on the normal, or
     four plane waves whose nodes make a lattice that drifts with the view */
  float pat;
  if (uLattice < 0.5) {
    vec3 Nw = abs(N);
    vec3 w = Nw * Nw; w /= (w.x + w.y + w.z);
    vec3 q = vW * uDotScale;
    pat = dots2(q.yz) * w.x + dots2(q.xz) * w.y + dots2(q.xy) * w.z;
  } else {
    /* the four directions of a tetrahedron, so the nodes are a 3D lattice
       and no surface orientation gets stripes */
    const vec3 k0 = vec3( 0.577,  0.577,  0.577);
    const vec3 k1 = vec3( 0.577, -0.577, -0.577);
    const vec3 k2 = vec3(-0.577,  0.577, -0.577);
    const vec3 k3 = vec3(-0.577, -0.577,  0.577);
    float s = uDotScale * 6.28318 * 0.5;
    /* world space view direction: the phase each wave takes from the eye */
    vec3 Vw = normalize(cameraPosition - vW);
    float wsum = cos(dot(vW, k0) * s + dot(Vw, k0) * uParallax)
               + cos(dot(vW, k1) * s + dot(Vw, k1) * uParallax)
               + cos(dot(vW, k2) * s + dot(Vw, k2) * uParallax)
               + cos(dot(vW, k3) * s + dot(Vw, k3) * uParallax);
    float aa = fwidth(wsum) * 1.5;
    /* the nodes are the peaks of the sum, kept small: at the default radius
       only the top few percent of the wave survives */
    float thr = 4.0 - 5.0 * uDotRadius;
    pat = smoothstep(thr - aa, thr + aa, wsum);
  }
  /* the pattern is the topology, so it shows on the facing surface too,
     only a little dimmer there than at the edge */
  pat *= uDotIntensity * mix(0.45, 1.0, f);

  /* a little form for the body; or, at uShade 1, a lit surface: a lambert
     term from the same key direction plus a soft wrap, so an opaque style
     reads as an object under light rather than as a projection */
  vec3 L = normalize(vec3(0.4, 0.7, 0.6));
  float lit = 0.6 + 0.4 * abs(dot(N, L));
  float lam = 0.1 + 0.9 * max(dot(N, L), 0.0) + 0.14 * max(dot(N, normalize(vec3(-0.6, 0.2, 0.5))), 0.0);
  /* a warm white highlight from the key, so a solid style has a sheen */
  lam += 0.6 * pow(max(dot(reflect(-L, N), V), 0.0), 24.0);
  float bodyLight = mix(lit * (0.4 + 0.6 * f), lam, uShade);

  /* the dynamics on a translucent hologram: where the recording is active
     the rim and the pattern brighten, the body lifts, and the colour runs
     toward the spectrum. Opaque styles get the film instead, below. */
  float wx = clamp(vWeather, 0.0, 1.0);
  vec3 wCol = mix(C, spectrum(fract(0.08 + wx * 0.75)), wx * 0.7);
  /* the film and the glints, for the translucent hologram as well: the
     film tints the rim and the body by uIri, the glints ride on top */
  float NdVt = max(dot(N, V), 0.001);
  float filmThick = uFilm * (1.0 + 0.5 * (noise3(vW * 2.5 + vec3(0.0, uTime * 0.12, 0.0)) - 0.5))
                  + uWeatherFilm * vWeather;
  vec3 filmT = thinFilm(filmThick, NdVt);
  wCol = mix(wCol, wCol * (0.35 + 1.3 * filmT), clamp(uIri, 0.0, 1.0) * 0.8);
  rim *= 1.0 + wx * 1.2;
  pat *= 1.0 + wx * 2.0;

  vec3 col = wCol * (uBodyAlpha * bodyLight * (1.0 + wx * 2.5));
  vec3 rimCol = mix(wCol, uCoreColor, clamp(rim.g * 0.45, 0.0, 1.0));
  /* the diffraction colour: a spectrum keyed to the grazing angle, brightest
     where the rim is, so it reads as a property of the light and not paint */
  rimCol = mix(rimCol, spectrum(fract(f * 1.4 + 0.55)), uIridescence * f);
  col += rimCol * rim;
  col += wCol * pat;
  col += glints(vW, N, V, L, NdVt, uSparkleScale, uTime) * uSparkle * 2.0 * (0.3 + 0.7 * f);

  /* the volume: how much object this ray passes through, from the thickness
     pass, glowing by Beer's law. The pass holds the farthest surface on this
     ray, so the near wall carries the whole thickness and the far wall
     carries none, whichever way the triangles are wound. */
  /* which wall this is: with the pass on, the near wall is the one with
     object behind it; without it, all that is left is the winding */
  float front = gl_FrontFacing ? 1.0 : 0.0;
  if (uDensity > 0.0) {
    float back = texture2D(uThick, gl_FragCoord.xy / uResolution).r;
    float thick = max(back - vDepth, 0.0);
    float vol = 1.0 - exp(-thick * uDensity);
    col += mix(C, uCoreColor, vol * 0.5) * vol * uInner;
    front = step(0.004, thick);
  }

  /* the touch: interference rings running out from the pointer's point on
     the surface, through the volume, fading over a couple of seconds */
  if (uPointerOn > 0.0) {
    float age = uTime - uPointerT;
    float d = distance(vW, uPointer);
    float ring = 0.5 + 0.5 * sin(d * 70.0 - age * 9.0);
    ring = pow(ring, 6.0);
    float env = exp(-d * 5.0) * exp(-age * 0.9) * step(d, age * 0.8 + 0.05);
    col += mix(C, uCoreColor, 0.5) * ring * env * 2.0 * uTouch;
  }

  /* the weather lifts the translucent body too, so it is not an opaque only
     thing */
  col += uCoreColor * clamp(vWeather, 0.0, 2.0) * uWeatherGlow;

  /* interference also lifts the whole thing a touch and grains it */
  col *= 1.0 + vBurst * 0.25;
  col *= 1.0 - vBurst * 0.15 * hash(floor(gl_FragCoord.y * 0.5) + floor(uTime * 30.0));

  /* the far wall of a shell is drawn too, dimmer, so a volume reads as one
     and the near edge does not double up to white */
  float a = uOpacity * mix(0.35, 1.0, front);
  gl_FragColor = vec4(col, a);
  #ifdef HOLO_OPAQUE
  {
    /* ---- an opaque surface: microfacet specular, a procedural studio in
       the reflections, thin film interference, diffraction glints, cavity
       shading. View space throughout; L is the key. ---- */
    vec3 H = normalize(L + V);
    float NdL = max(dot(N, L), 0.0);
    float NdV = max(dot(N, V), 0.001);
    float NdH = max(dot(N, H), 0.0);
    float VdH = max(dot(V, H), 0.0);
    float r = max(uRough, 0.03);
    float a2 = r * r * r * r;
    float dd = NdH * NdH * (a2 - 1.0) + 1.0;
    float D = a2 / (3.14159 * dd * dd);
    vec3 F0 = mix(vec3(0.04), C, uMetal);
    vec3 F = F0 + (1.0 - F0) * pow(1.0 - VdH, 5.0);
    float G = 1.0 / (4.0 * mix(NdL, 1.0, 0.5) * mix(NdV, 1.0, 0.5) + 0.02);
    vec3 spec = D * F * G * NdL;

    /* the studio: a warm white zenith, a gold horizon, a deep floor, one sun
       on the key, and six soft boxes around the horizon so a mirror has
       something to reflect */
    vec3 R = reflect(-V, N);
    float up = R.y;
    /* the ground is nearly black and the sky is a dim warm gradient: the
       light comes from the boxes and the sun, not from everywhere, or a
       mirror has nothing dark to be a mirror against */
    vec3 zen = vec3(0.22, 0.20, 0.19), hor = vec3(0.30, 0.19, 0.10), flo = vec3(0.015, 0.012, 0.010);
    vec3 env = up > 0.0 ? mix(hor, zen, smoothstep(0.0, 0.8, up)) : mix(hor, flo, smoothstep(0.0, -0.35, up));
    float ang = atan(R.x, R.z);
    /* four soft boxes above the horizon and two low warm bounces */
    float boxes = smoothstep(0.55, 0.95, cos(ang * 4.0)) * smoothstep(0.55, 0.12, abs(up - 0.42));
    env += vec3(1.0, 0.95, 0.88) * boxes * 2.6;
    float bounce = smoothstep(0.75, 1.0, cos(ang * 2.0 + 0.9)) * smoothstep(0.4, 0.05, abs(up + 0.18));
    env += vec3(1.0, 0.66, 0.28) * bounce * 1.5;
    /* the sun, tight and hot */
    env += vec3(1.0, 0.93, 0.78) * 9.0 * pow(max(dot(R, L), 0.0), 400.0);
    env += vec3(1.0, 0.85, 0.6) * 1.2 * pow(max(dot(R, L), 0.0), 22.0);
    vec3 Fenv = F0 + (1.0 - F0) * pow(1.0 - NdV, 5.0);
    float envRough = mix(1.0, 0.35, r);

    /* thin film: a film whose thickness wanders slowly over the surface;
       each wavelength interferes at its own phase, so the colour runs
       through the spectrum with the angle of view */
    vec3 iri = thinFilm(filmThick, NdV);
    float iriW = uIri * mix(0.35, 1.0, pow(1.0 - NdV, 1.5)) * (0.4 + 0.6 * NdL);
    iriW += clamp(vWeather, 0.0, 1.5) * 0.9;

    vec3 sparkle = glints(vW, N, V, L, NdV, uSparkleScale, uTime) * uSparkle * 3.0;

    /* cavity: a sulcus faces inward, a gyrus crest faces out */
    vec3 radialV = normalize(mat3(viewMatrix) * normalize(vW));
    float cav = clamp(dot(N, radialV) * 0.5 + 0.5, 0.0, 1.0);
    float ao = mix(1.0, mix(0.35, 1.0, cav), uCavity);

    vec3 albedo = C * (1.0 - uMetal * 0.85);
    vec3 diffuse = albedo * (0.16 + 0.84 * NdL + 0.12 * max(dot(N, normalize(vec3(-0.6, 0.2, 0.5))), 0.0));
    vec3 surf = diffuse * ao * mix(1.0, 0.45, uIri * 0.5)
              + spec * mix(vec3(1.0), iri * 2.0, clamp(uIri, 0.0, 1.0))
              + env * Fenv * uEnv * envRough * ao
              + iri * iriW * 1.4 * ao
              + sparkle;
    /* what the surface gives off on its own, shadow or not */
    surf += C * uEmission;
    /* the hologram's own rim on top, gold at the silhouette. Divided by
       the surface alpha so that, once blended, it lands at full strength
       the way a separate additive shell would */
    vec3 rimO = mix(C, uCoreColor, clamp(rim.g * 0.9, 0.0, 1.0));
    surf += rimO * rim * 0.5 / max(uSurfaceAlpha, 0.05);
    surf += uCoreColor * clamp(vWeather, 0.0, 2.0) * uWeatherGlow;
    surf *= uOpacity * uBodyAlpha;
    gl_FragColor = vec4(surf, uSurfaceAlpha);
  }
  #endif
  /* nothing leaves this shader that is not finite and non negative: a
     decimated shell carries a few degenerate normals, and one NaN fragment
     added into a float render target poisons the bloom's blur into a black
     frame, which is how a whole brain disappears */
  {
    /* a select, not arithmetic: NaN times zero is still NaN */
    vec3 c = gl_FragColor.rgb;
    c = vec3(c.r == c.r ? c.r : 0.0, c.g == c.g ? c.g : 0.0, c.b == c.b ? c.b : 0.0);
    gl_FragColor.rgb = clamp(c, 0.0, 64.0);
    gl_FragColor.a = (gl_FragColor.a == gl_FragColor.a) ? clamp(gl_FragColor.a, 0.0, 1.0) : 0.0;
  }
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function makeHologramMaterial(opts) {
  const o = Object.assign({}, HOLO_DEFAULTS, opts || {});
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uColor:         { value: new THREE.Color(o.color) },
      uCoreColor:     { value: new THREE.Color(o.coreColor) },
      uTime:          { value: 0 },
      uGlowIntensity: { value: o.glowIntensity },
      uFresnelPower:  { value: o.fresnelPower },
      uBodyAlpha:     { value: o.bodyAlpha },
      uDotScale:      { value: o.dotScale },
      uDotRadius:     { value: o.dotRadius },
      uDotIntensity:  { value: o.dotIntensity },
      uGlitchFreq:    { value: o.glitchFreq },
      uGlitchAmount:  { value: o.glitchAmount },
      uChroma:        { value: o.chroma },
      uOpacity:       { value: o.opacity },
      uDensity:       { value: o.density },
      uInner:         { value: o.inner },
      uLattice:       { value: o.lattice },
      uParallax:      { value: o.parallax },
      uIridescence:   { value: o.iridescence },
      uVoxel:         { value: o.voxel },
      uTouch:         { value: o.touch },
      uShade:         { value: o.shade },
      uRough:         { value: o.rough },
      uMetal:         { value: o.metal },
      uEnv:           { value: o.env },
      uFilm:          { value: o.film },
      uIri:           { value: o.iri },
      uSparkle:       { value: o.sparkle },
      uSparkleScale:  { value: o.sparkleScale },
      uCavity:        { value: o.cavity },
      uWeather:       { value: 0 },
      uWeatherFilm:   { value: o.weatherFilm },
      uWeatherGlow:   { value: o.weatherGlow },
      uWeatherSpread: { value: o.weatherSpread },
      uWeatherSpeed:  { value: o.weatherSpeed },
      uWeatherLift:   { value: o.weatherLift },
      uEmission:      { value: o.emission },
      uColor2:        { value: new THREE.Color(o.color2) },
      uOmbre:         { value: o.ombre },
      uSpectral:      { value: o.spectral },
      uSurfaceAlpha:  { value: o.surfaceAlpha },
      uSpectralDrift: { value: o.spectralDrift },
      uFrame:         { value: 0 },
      uTraceSize:     { value: new THREE.Vector2(1, 1) },
      uTraces:        { value: null },
      uEpicentres:    { value: null },
      uPointer:       { value: new THREE.Vector3() },
      uPointerT:      { value: 0 },
      uPointerOn:     { value: 0 },
      uThick:         { value: null },
      uResolution:    { value: new THREE.Vector2(1, 1) },
      uBounds:        { value: new THREE.Vector2(-1, 1) },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  m.isHologram = true;
  m.solid = !!o.solid;
  m.opaque = false;
  /* the depth only twin for the solid prepass. It runs the SAME vertex
     shader on the same uniforms, so a jittered or voxelised burst lands on
     the same depth and the surface is not rejected against its own prepass. */
  m.depthOnly = new THREE.ShaderMaterial({
    uniforms: m.uniforms, vertexShader: VERT,
    fragmentShader: "void main() { gl_FragColor = vec4(0.0); }",
    colorWrite: false, side: THREE.DoubleSide,
  });
  m.halo = {
    uHaloColor: { value: new THREE.Color(o.haloColor) },
    uHaloGain: { value: o.halo },
    uHaloSize: { value: o.haloSize },
    uBloomGain: { value: o.bloom },
    uBloomSize: { value: o.bloomSize },
    uMeanR: { value: 1 },
    uSpectral: m.uniforms.uSpectral,
    uSpectralDrift: m.uniforms.uSpectralDrift,
    uTime: m.uniforms.uTime,
  };
  return m;
}

/* The bloom. Three copies of the surface pushed out along their normals by a
   growing distance, drawn back face only, additive, no depth test, each a
   little dimmer than the last. Where the copies overlap near the silhouette
   the light sums, and it thins out to nothing at the outer shell: a soft
   halo with no post processing and no blur pass. */
const HALO_VERT = /* glsl */ `
uniform float uHaloSize;
uniform float uLayer;
uniform float uLayers;
uniform float uSpherize;   /* 1: the outer shells relax toward a sphere */
uniform float uMeanR;      /* the object's mean radius, for that sphere */
uniform float uTime;
varying float vF;
varying float vT;
void main() {
  float t = uLayer / uLayers;
  vT = t;
  float breathe = 1.0 + 0.08 * sin(uTime * 1.3 + uLayer * 2.0);
  /* pushed away from the object's centre, a little along the normal for the
     tight glow: a folded surface pushed along its normals tears, and the
     geometry is recentred on the origin, so radial is smooth. The bloom's
     outer shells also relax toward a sphere of the mean radius, so a wide
     bloom is a haze and not a stack of ghost brains. */
  vec3 radial = normalize(position);
  vec3 dir = normalize(mix(normal, radial, mix(0.9, 1.0, uSpherize)));
  vec3 base = mix(position, radial * uMeanR, uSpherize * t * 0.85);
  vec3 p = base + dir * (uHaloSize * t * breathe);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  /* the fade reads the smooth push direction, not the folded normal, or
     every shell carries the gyri as a ghost of the brain */
  vec3 N = normalize(normalMatrix * dir);
  vec3 V = normalize(-mv.xyz);
  vF = 1.0 - abs(dot(N, V));
  gl_Position = projectionMatrix * mv;
}`;
const HALO_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uHaloColor;
uniform float uHaloGain;
uniform float uLayer;
uniform float uLayers;
uniform float uSpherize;
uniform float uSpectral;
uniform float uSpectralDrift;
uniform float uTime;
varying float vF;
varying float vT;
vec3 hueShift(vec3 c, float turns) {
  const vec3 k = vec3(0.57735);
  float a = turns * 6.28318;
  float ca = cos(a), sa = sin(a);
  return c * ca + cross(k, c) * sa + k * dot(k, c) * (1.0 - ca);
}
void main() {
  /* the glow is tight and reads the grazing angle; the bloom is a haze
     that fades with distance from the surface, shell by shell */
  float glow = pow(vF, 1.6) / uLayer;
  float haze = pow(1.0 - vT, 1.4) * (0.5 + 0.5 * vF) / uLayers;
  float a = uHaloGain * mix(0.22 * glow, 0.5 * haze, uSpherize);
  /* the spectral shift walks the light too, further out in the bloom */
  vec3 c = hueShift(uHaloColor, uSpectral * 0.66 * mix(vF, vT, uSpherize) + uSpectralDrift * uTime / 60.0);
  gl_FragColor = vec4(c * a, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
function makeHaloMaterial(halo, layer, layers, spherize) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uHaloColor: halo.uHaloColor, uTime: halo.uTime, uLayer: { value: layer },
      uLayers: { value: layers }, uSpherize: { value: spherize },
      uHaloGain: spherize ? halo.uBloomGain : halo.uHaloGain,
      uHaloSize: spherize ? halo.uBloomSize : halo.uHaloSize,
      uMeanR: halo.uMeanR, uSpectral: halo.uSpectral, uSpectralDrift: halo.uSpectralDrift,
    },
    vertexShader: HALO_VERT, fragmentShader: HALO_FRAG,
    transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.AdditiveBlending, side: THREE.BackSide,
  });
}

/* Put one hologram material on every mesh under root and tell it how tall the
   object is in world space. Call after the root is positioned and scaled,
   because the jitter amount is a fraction of that height. */
export function applyHologram(root, material) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  material.uniforms.uBounds.value.set(box.min.y, box.max.y);
  const drop = [];
  root.traverse(function (o) {
    if (!o.isMesh) return;
    /* a shell's wireframe child is a second mesh on the same geometry and it
       would double the rim, so it goes */
    if (o.material && o.material.wireframe) { drop.push(o); return; }
    if (o.isHalo) return;
    o.material = material;
  });
  drop.forEach(function (o) { o.parent.remove(o); });
  /* the bloom shells ride under each mesh, sharing its geometry */
  const hosts = [];
  root.traverse(function (o) { if (o.isMesh && o.material === material) hosts.push(o); });
  hosts.forEach(function (o) {
    if (o.userData.halo) return;
    const g = new THREE.Group(); g.isHalo = true;
    /* the glow: three tight shells; the bloom: eight wide ones */
    [1, 2, 3].forEach(function (layer) {
      const h = new THREE.Mesh(o.geometry, makeHaloMaterial(material.halo, layer, 3, 0));
      h.isHalo = true; h.isGlow = true; h.renderOrder = -30 + layer;
      g.add(h);
    });
    [1, 2, 3, 4, 5, 6, 7, 8].forEach(function (layer) {
      const h = new THREE.Mesh(o.geometry, makeHaloMaterial(material.halo, layer, 8, 1));
      h.isHalo = true; h.isBloom = true; h.renderOrder = -20 + layer;
      g.add(h);
    });
    o.add(g); o.userData.halo = g;
    /* the mean radius, for the bloom's sphere */
    const pos = o.geometry.attributes.position;
    let sum = 0;
    for (let i = 0; i < pos.count; i += 7) sum += Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i));
    material.halo.uMeanR.value = sum / Math.ceil(pos.count / 7);
  });
  setHaloVisible(root, material);
  return box;
}

function setHaloVisible(root, material) {
  const glow = material.halo.uHaloGain.value > 0, bloom = material.halo.uBloomGain.value > 0;
  root.traverse(function (o) {
    if (o.isGlow) o.visible = glow;
    else if (o.isBloom) o.visible = bloom;
    else if (o.isHalo && o.isGroup) o.visible = glow || bloom;
  });
}

/* One frame of a hologram: the thickness pass, then, for a solid style, a
   depth only prepass so only the nearest surface survives, then the additive
   pass. Pass the thickness pass from makeThicknessPass or null. */
export function renderHologramFrame(renderer, scene, camera, material, thickness) {
  if (thickness) thickness.render(renderer, scene, camera, material);
  renderer.clear();
  /* the prepass also serves the halo: with depth in the buffer the bloom
     shells only survive outside the silhouette, where a bloom belongs */
  if (material.solid || material.halo.uHaloGain.value > 0 || material.halo.uBloomGain.value > 0) {
    const prevOverride = scene.overrideMaterial;
    const halos = [];
    scene.traverse(function (o) { if (o.isHalo && o.isGroup && o.visible) { halos.push(o); o.visible = false; } });
    scene.overrideMaterial = material.depthOnly;
    renderer.render(scene, camera);
    scene.overrideMaterial = prevOverride;
    halos.forEach(function (o) { o.visible = true; });
    /* a translucent style with a halo keeps its layers: the prepass depth
       is then only for the halo, and the surface is tested against nothing */
    material.depthTest = material.solid;
  } else {
    material.depthTest = true;
  }
  material.depthFunc = THREE.LessEqualDepth;
  const prevAuto = renderer.autoClear;
  renderer.autoClear = false;
  renderer.render(scene, camera);
  renderer.autoClear = prevAuto;
}

export function tickHologram(material, t) {
  material.uniforms.uTime.value = t;
}

/* Set any HOLO_DEFAULTS key by name at runtime. Colours take a hex string. */
export function setHologramParam(material, key, value, root) {
  if (key === "solid") { material.solid = value > 0; return true; }
  if (key === "surfaceAlpha") {
    material.uniforms.uSurfaceAlpha.value = value;
    if (material.opaque) {
      material.transparent = value < 1;
      material.depthWrite = value >= 0.5;
      material.needsUpdate = true;
    }
    return true;
  }
  if (key === "opaque") {
    const on = value > 0;
    const sa = material.uniforms.uSurfaceAlpha.value;
    material.opaque = on;
    material.blending = on ? THREE.NormalBlending : THREE.AdditiveBlending;
    material.transparent = !on || sa < 1;
    material.depthWrite = on && sa >= 0.5;
    material.defines = on ? { HOLO_OPAQUE: 1 } : {};
    material.needsUpdate = true;
    return true;
  }
  if (key === "halo") {
    material.halo.uHaloGain.value = value;
    if (root) setHaloVisible(root, material);
    return true;
  }
  if (key === "bloom") {
    material.halo.uBloomGain.value = value;
    if (root) setHaloVisible(root, material);
    return true;
  }
  if (key === "haloSize") { material.halo.uHaloSize.value = value; return true; }
  if (key === "bloomSize") { material.halo.uBloomSize.value = value; return true; }
  if (key === "haloColor") { material.halo.uHaloColor.value.set(value); return true; }
  const name = "u" + key.charAt(0).toUpperCase() + key.slice(1);
  const u = material.uniforms[name];
  if (!u) return false;
  if (u.value && u.value.isColor) u.value.set(value);
  else u.value = value;
  return true;
}

/* The weather. Give the material a recording (cells across, frames down,
   0 to 1) and each cell's point on the surface in mesh space. Both become
   textures the vertex shader reads. Turn it on with the "weather" param and
   drive the frame with tickWeather. */
export function setWeather(material, traces, epicentres) {
  const u = material.uniforms;
  if (u.uTraces.value) u.uTraces.value.dispose();
  if (u.uEpicentres.value) u.uEpicentres.value.dispose();
  const t = new THREE.DataTexture(traces.data, traces.cells, traces.frames, THREE.RedFormat, THREE.FloatType);
  t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter;
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  const e = new THREE.DataTexture(epicentres, traces.cells, 1, THREE.RGBAFormat, THREE.FloatType);
  e.minFilter = THREE.NearestFilter; e.magFilter = THREE.NearestFilter;
  e.needsUpdate = true;
  u.uTraces.value = t; u.uEpicentres.value = e;
  u.uTraceSize.value.set(traces.cells, traces.frames);
}
export function tickWeather(material, frame) {
  material.uniforms.uFrame.value = frame;
}

/* The touch. Give it a world point on the surface and the time; rings run
   out from there. Call touchHologram(m, null) when the pointer leaves. */
export function touchHologram(material, point, t) {
  const u = material.uniforms;
  if (!point) { u.uPointerOn.value = 0; return; }
  u.uPointer.value.copy(point);
  u.uPointerT.value = t;
  u.uPointerOn.value = 1;
}

/* The thickness pass. Renders every surface into a float target with the
   depth test reversed, so what survives is the FARTHEST surface on each ray,
   as view depth. The hologram subtracts its own depth from it. Farthest
   rather than "nearest back face" because that needs correct winding, and a
   mirrored export has none; this way is right for any mesh. Costs one extra
   draw of the same geometry with a trivial fragment shader.
   Call pass.render(renderer, scene, camera, material) before the main render. */
export function makeThicknessPass() {
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    depthBuffer: true,
  });
  let depthMat = null;   /* built on first render, on the hologram's uniforms */
  function depthMaterial(holo) {
    if (!depthMat) depthMat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      depthFunc: THREE.GreaterDepth,
      uniforms: holo.uniforms,
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying float vDepth;
        void main() { gl_FragColor = vec4(vDepth, 0.0, 0.0, 1.0); }`,
    });
    return depthMat;
  }
  const size = new THREE.Vector2();
  return {
    target: target, material: depthMat,
    render: function (renderer, scene, camera, holo) {
      /* nothing to do while the volume is off */
      if (holo.uniforms.uDensity.value <= 0) return;
      renderer.getDrawingBufferSize(size);
      if (target.width !== size.x || target.height !== size.y) {
        target.setSize(size.x, size.y);
      }
      const prevTarget = renderer.getRenderTarget();
      const prevOverride = scene.overrideMaterial;
      const prevClear = renderer.getClearAlpha();
      const gl = renderer.getContext();
      const halos = [];
      scene.traverse(function (o) { if (o.isHalo && o.isGroup && o.visible) { halos.push(o); o.visible = false; } });
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      /* a reversed depth test needs the buffer cleared to the near end */
      gl.clearDepth(0);
      renderer.clear();
      scene.overrideMaterial = depthMaterial(holo);
      const prevAuto = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(scene, camera);
      renderer.autoClear = prevAuto;
      gl.clearDepth(1);
      scene.overrideMaterial = prevOverride;
      renderer.setRenderTarget(prevTarget);
      renderer.setClearColor(0x000000, prevClear);
      halos.forEach(function (o) { o.visible = true; });
      holo.uniforms.uThick.value = target.texture;
      holo.uniforms.uResolution.value.copy(size);
    },
    dispose: function () { target.dispose(); if (depthMat) depthMat.dispose(); },
  };
}
