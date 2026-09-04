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
 * FIVE INGREDIENTS, ONE MATERIAL, EVERY ONE A UNIFORM.
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
 *                 uDotScale is dots per world unit, uDotRadius their size,
 *                 uDotIntensity their brightness.
 *   Glitch        A 1D value noise of time, sampled at uGlitchFreq, gated
 *                 through a smoothstep so interference arrives in short
 *                 bursts. During a burst the vertex shader jitters positions
 *                 by a 3D noise (uGlitchAmount) and the fragment shader
 *                 widens the chromatic split (uChroma). Between bursts a faint
 *                 constant split remains.
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
  dotScale: 30,            /* dots per world unit */
  dotRadius: 0.08,         /* dot radius as a fraction of one cell */
  dotIntensity: 1.0,       /* dot gain */
  glitchFreq: 1.8,         /* noise samples per second; bursts arrive faster */
  glitchAmount: 0.012,     /* vertex jitter as a fraction of the object height */
  chroma: 0.5,             /* channel split at the rim, 0 none */
  opacity: 1.0,            /* overall gain, may exceed 1 */
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
uniform vec2  uBounds;      /* world y of the bottom and top of the object */
varying vec3  vN;
varying vec3  vV;
varying vec3  vW;
varying float vBurst;
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
  vBurst = b;

  vec4 mv = viewMatrix * wp;
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  vW = wp.xyz;
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
varying vec3  vN;
varying vec3  vV;
varying vec3  vW;
varying float vBurst;
${NOISE}

/* one plane of the lattice: distance to the nearest cell centre in 2D,
   turned into a sharp dot with a one pixel soft edge */
float dots2(vec2 p) {
  vec2 c = fract(p) - 0.5;
  float d = length(c);
  float aa = fwidth(d) * 1.2;
  return 1.0 - smoothstep(uDotRadius - aa, uDotRadius + aa, d);
}

void main() {
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(vV);
  float f = 1.0 - clamp(dot(N, V), 0.0, 1.0);

  /* rim, split by channel. A faint constant split, widened during a burst,
     so red hugs the body and blue reaches past it */
  float split = 0.3 * uChroma * (0.35 + vBurst);
  float p = uFresnelPower;
  vec3 rim = vec3(pow(f, p * (1.0 + split)), pow(f, p), pow(f, p * (1.0 - split)));
  rim *= uGlowIntensity;

  /* the dot lattice, triplanar on the world normal */
  vec3 Nw = abs(normalize(vec3(N)));   /* view space normal, fine for weights */
  vec3 w = Nw * Nw; w /= (w.x + w.y + w.z);
  vec3 q = vW * uDotScale;
  float dots = dots2(q.yz) * w.x + dots2(q.xz) * w.y + dots2(q.xy) * w.z;
  /* the dots are the topology, so they show on the facing surface too, only
     a little dimmer there than at the edge */
  dots *= uDotIntensity * mix(0.45, 1.0, f);

  /* a little form for the body */
  float lit = 0.6 + 0.4 * abs(dot(N, normalize(vec3(0.4, 0.7, 0.6))));

  vec3 col = uColor * (uBodyAlpha * lit * (0.4 + 0.6 * f));
  col += mix(uColor, uCoreColor, clamp(rim.g * 0.45, 0.0, 1.0)) * rim;
  col += uColor * dots;
  /* interference also lifts the whole thing a touch and grains it */
  col *= 1.0 + vBurst * 0.25;
  col *= 1.0 - vBurst * 0.15 * hash(floor(gl_FragCoord.y * 0.5) + floor(uTime * 30.0));

  /* the far wall of a shell is drawn too, dimmer, so a volume reads as one
     and the near edge does not double up to white */
  float a = uOpacity * (gl_FrontFacing ? 1.0 : 0.35);
  gl_FragColor = vec4(col, a);
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
  return m;
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
    o.material = material;
  });
  drop.forEach(function (o) { o.parent.remove(o); });
  return box;
}

export function tickHologram(material, t) {
  material.uniforms.uTime.value = t;
}

/* Set any HOLO_DEFAULTS key by name at runtime. Colours take a hex string. */
export function setHologramParam(material, key, value) {
  const name = "u" + key.charAt(0).toUpperCase() + key.slice(1);
  const u = material.uniforms[name];
  if (!u) return false;
  if (u.value && u.value.isColor) u.value.set(value);
  else u.value = value;
  return true;
}
