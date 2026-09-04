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
  touch: 1,                /* gain on the pointer rings */
  /* two things that are not uniforms of the surface shader */
  solid: 0,                /* 1: a depth prepass keeps only the nearest surface,
                              so a folded mesh reads as one lit body instead of
                              a stack of translucent layers */
  halo: 0,                 /* gain on the bloom shells outside the silhouette */
  haloSize: 0.05,          /* how far the outermost shell is pushed, world units */
  haloColor: "#FFE6B0",    /* the bloom's colour */
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
    color: "#FFC964", coreColor: "#FFFBF0", glowIntensity: 1.8, fresnelPower: 2.4,
    bodyAlpha: 1.3, dotIntensity: 0, density: 2.0, inner: 1.2, iridescence: 0,
    chroma: 0.1, glitchAmount: 0.003, voxel: 0, lattice: 0,
    solid: 1, halo: 1.6, haloSize: 0.14, haloColor: "#FFC24A", opacity: 1,
  },
  /* the surface is a net of gold nodes over a dark amber body, and the nodes
     drift as you move: a light field you could count */
  emberLattice: {
    color: "#FFB347", coreColor: "#FFF1D6", glowIntensity: 1.2, fresnelPower: 2.4,
    bodyAlpha: 0.35, lattice: 1, dotScale: 46, dotRadius: 0.16, dotIntensity: 6,
    parallax: 6, density: 0.8, inner: 0.25, iridescence: 0, chroma: 0.2,
    voxel: 0.02, glitchAmount: 0.004, solid: 1, halo: 0.5, haloSize: 0.05,
    haloColor: "#FF9A3C", opacity: 1,
  },
  /* a paper lantern: soft, warm, hardly any rim, the body itself lit from
     within, a fine gentle dot grid like the weave of the paper */
  lantern: {
    color: "#FFD9A0", coreColor: "#FFFDF7", glowIntensity: 0.4, fresnelPower: 1.2,
    bodyAlpha: 0.9, dotScale: 90, dotRadius: 0.12, dotIntensity: 0.4,
    density: 0.8, inner: 0.3, iridescence: 0, chroma: 0, glitchAmount: 0,
    voxel: 0, lattice: 0, solid: 1, halo: 0.6, haloSize: 0.18, haloColor: "#FFE0A8",
    opacity: 1,
  },
  /* champagne aurora: the gold rim runs through a spectrum at grazing
     angles, a voxel glitch keeps re-computing it, the lattice hums */
  aurora: {
    color: "#FFCF7A", coreColor: "#FFFFFF", glowIntensity: 1.3, fresnelPower: 2.8,
    bodyAlpha: 0.03, lattice: 1, dotScale: 34, dotRadius: 0.06, dotIntensity: 1.2,
    parallax: 9, density: 0.7, inner: 0.3, iridescence: 0.9, chroma: 0.9,
    voxel: 0.04, glitchAmount: 0.003,
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
  /* white heat: everything burns toward white, the rim is a searing line,
     the interior a dense white gold, the dots gone; a hologram that is more
     a flare than an image */
  /* nova core: the supernova as a solid object. Warm white gold, opaque, a
     wide golden bloom around it, and just enough interference that the
     white is never flat. */
  novaCore: {
    color: "#FFE7BE", coreColor: "#FFFFFF", glowIntensity: 1.4, fresnelPower: 2.2,
    bodyAlpha: 1.0, shade: 1, dotIntensity: 0, density: 0, inner: 0, iridescence: 0,
    chroma: 0.1, glitchAmount: 0.002, voxel: 0, lattice: 0, opaque: 1, solid: 1,
    halo: 2.2, haloSize: 0.2, haloColor: "#FFC24A", opacity: 1,
    rough: 0.42, metal: 0.35, env: 1.0, film: 520, iri: 0.45, sparkle: 1.1,
    sparkleScale: 130, cavity: 0.55,
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
    color: "#FFF3DC", coreColor: "#FFFFFF", glowIntensity: 0.7, fresnelPower: 2.2,
    bodyAlpha: 1.0, shade: 1, dotIntensity: 0, density: 0, inner: 0, iridescence: 0,
    chroma: 0.05, glitchAmount: 0, voxel: 0, lattice: 0, opaque: 1, solid: 1,
    halo: 0.9, haloSize: 0.14, haloColor: "#FFE9C4", opacity: 1,
    rough: 0.5, metal: 0.08, env: 0.55, film: 380, iri: 1.0, sparkle: 0.7,
    sparkleScale: 110, cavity: 0.85,
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
  whiteHeat: {
    color: "#FFE8B8", coreColor: "#FFFFFF", glowIntensity: 2.6, fresnelPower: 4.5,
    bodyAlpha: 0.01, dotIntensity: 0, density: 2.2, inner: 0.8, iridescence: 0.15,
    chroma: 0.3, glitchAmount: 0.002, voxel: 0.015, lattice: 0, opacity: 1.0,
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
varying vec3  vN;
varying vec3  vV;
varying vec3  vW;
varying float vBurst;
varying float vDepth;
${NOISE}
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
uniform vec3  uPointer;
uniform float uPointerT;
uniform float uPointerOn;
uniform sampler2D uThick;
uniform vec2  uResolution;
varying vec3  vN;
varying vec3  vV;
varying vec3  vW;
varying float vBurst;
varying float vDepth;
${NOISE}

/* one plane of the lattice: distance to the nearest cell centre in 2D,
   turned into a sharp dot with a one pixel soft edge */
float dots2(vec2 p) {
  vec2 c = fract(p) - 0.5;
  float d = length(c);
  float aa = fwidth(d) * 1.2;
  return 1.0 - smoothstep(uDotRadius - aa, uDotRadius + aa, d);
}

/* a spectrum from 0 to 1, red through violet, for the diffraction rim */
vec3 spectrum(float x) {
  return clamp(vec3(abs(x * 6.0 - 3.0) - 1.0, 2.0 - abs(x * 6.0 - 2.0),
                    2.0 - abs(x * 6.0 - 4.0)), 0.0, 1.0);
}

void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(vV);
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

  vec3 col = uColor * (uBodyAlpha * bodyLight);
  vec3 rimCol = mix(uColor, uCoreColor, clamp(rim.g * 0.45, 0.0, 1.0));
  /* the diffraction colour: a spectrum keyed to the grazing angle, brightest
     where the rim is, so it reads as a property of the light and not paint */
  rimCol = mix(rimCol, spectrum(fract(f * 1.4 + 0.55)), uIridescence * f);
  col += rimCol * rim;
  col += uColor * pat;

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
    col += mix(uColor, uCoreColor, vol * 0.5) * vol * uInner;
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
    col += mix(uColor, uCoreColor, 0.5) * ring * env * 2.0 * uTouch;
  }

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
    vec3 F0 = mix(vec3(0.04), uColor, uMetal);
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
    float thick = uFilm * (1.0 + 0.5 * (noise3(vW * 2.5 + vec3(0.0, uTime * 0.12, 0.0)) - 0.5));
    vec3 lam = vec3(650.0, 540.0, 470.0);
    vec3 phase = 4.0 * 3.14159 * 1.4 * thick * NdV / lam;
    vec3 iri = 0.5 + 0.5 * cos(phase);
    /* pushed hard away from grey: an interference colour that averages to
       white is not a rainbow, it is a haze */
    iri = clamp(mix(vec3(dot(iri, vec3(0.333))), iri, 2.6), 0.0, 1.0);
    iri *= iri;
    float iriW = uIri * mix(0.35, 1.0, pow(1.0 - NdV, 1.5)) * (0.4 + 0.6 * NdL);

    /* diffraction glints: a random micro normal per cell, a very tight
       highlight off it, coloured by where in the spectrum its order falls */
    vec3 cell = floor(vW * uSparkleScale);
    float pick = hash3(cell);
    vec3 micro = normalize(N + (vec3(hash3(cell + 1.0), hash3(cell + 2.0), hash3(cell + 3.0)) - 0.5) * 0.7);
    float glint = pow(max(dot(reflect(-L, micro), V), 0.0), 220.0) * step(0.55, pick);
    float hue = fract(hash3(cell + 4.0) + NdV * 1.5 + uTime * 0.05);
    vec3 glintCol = 0.55 + 0.45 * cos(6.28318 * (hue + vec3(0.0, 0.33, 0.67)));
    vec3 sparkle = glintCol * glint * uSparkle * 3.0;

    /* cavity: a sulcus faces inward, a gyrus crest faces out */
    vec3 radialV = normalize(mat3(viewMatrix) * normalize(vW));
    float cav = clamp(dot(N, radialV) * 0.5 + 0.5, 0.0, 1.0);
    float ao = mix(1.0, mix(0.35, 1.0, cav), uCavity);

    vec3 albedo = uColor * (1.0 - uMetal * 0.85);
    vec3 diffuse = albedo * (0.16 + 0.84 * NdL + 0.12 * max(dot(N, normalize(vec3(-0.6, 0.2, 0.5))), 0.0));
    vec3 surf = diffuse * ao * mix(1.0, 0.45, uIri * 0.5)
              + spec * mix(vec3(1.0), iri * 2.0, clamp(uIri, 0.0, 1.0))
              + env * Fenv * uEnv * envRough * ao
              + iri * iriW * 1.4 * ao
              + sparkle;
    /* the hologram's own rim on top, gold at the silhouette */
    surf += rimCol * rim * 0.5;
    surf *= uOpacity * uBodyAlpha;
    gl_FragColor = vec4(surf, 1.0);
  }
  #endif
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
uniform float uTime;
varying float vF;
void main() {
  float breathe = 1.0 + 0.08 * sin(uTime * 1.3 + uLayer * 2.0);
  /* pushed mostly away from the object's centre, only a little along the
     normal: a folded surface pushed along its normals tears into spikes,
     and the geometry is recentred on the origin, so radial is smooth */
  vec3 radial = normalize(position);
  vec3 dir = normalize(mix(normal, radial, 0.9));
  vec3 p = position + dir * (uHaloSize * (uLayer / 6.0) * breathe);
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
varying float vF;
void main() {
  float a = uHaloGain * 0.22 * pow(vF, 1.6) / uLayer;
  gl_FragColor = vec4(uHaloColor * a, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
function makeHaloMaterial(halo, layer) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uHaloColor: halo.uHaloColor, uHaloGain: halo.uHaloGain,
      uHaloSize: halo.uHaloSize, uTime: halo.uTime, uLayer: { value: layer },
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
    [1, 2, 3, 4, 5, 6].forEach(function (layer) {
      const h = new THREE.Mesh(o.geometry, makeHaloMaterial(material.halo, layer));
      h.isHalo = true; h.renderOrder = -20 + layer;
      g.add(h);
    });
    o.add(g); o.userData.halo = g;
  });
  setHaloVisible(root, material.halo.uHaloGain.value > 0);
  return box;
}

function setHaloVisible(root, on) {
  root.traverse(function (o) { if (o.isHalo && o.isGroup) o.visible = on; });
}

/* One frame of a hologram: the thickness pass, then, for a solid style, a
   depth only prepass so only the nearest surface survives, then the additive
   pass. Pass the thickness pass from makeThicknessPass or null. */
export function renderHologramFrame(renderer, scene, camera, material, thickness) {
  if (thickness) thickness.render(renderer, scene, camera, material);
  renderer.clear();
  /* the prepass also serves the halo: with depth in the buffer the bloom
     shells only survive outside the silhouette, where a bloom belongs */
  if (material.solid || material.halo.uHaloGain.value > 0) {
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
  if (key === "opaque") {
    const on = value > 0;
    material.opaque = on;
    material.blending = on ? THREE.NormalBlending : THREE.AdditiveBlending;
    material.transparent = !on;
    material.depthWrite = on;
    material.defines = on ? { HOLO_OPAQUE: 1 } : {};
    material.needsUpdate = true;
    return true;
  }
  if (key === "halo") {
    material.halo.uHaloGain.value = value;
    if (root) setHaloVisible(root, value > 0);
    return true;
  }
  if (key === "haloSize") { material.halo.uHaloSize.value = value; return true; }
  if (key === "haloColor") { material.halo.uHaloColor.value.set(value); return true; }
  const name = "u" + key.charAt(0).toUpperCase() + key.slice(1);
  const u = material.uniforms[name];
  if (!u) return false;
  if (u.value && u.value.isColor) u.value.set(value);
  else u.value = value;
  return true;
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
