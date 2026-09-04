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
};

/* three presets on the same material */
export const HOLO_ERAS = {
  2026: {},
  2076: { density: 0.9, inner: 0.35, iridescence: 0.25, voxel: 0.02, glitchAmount: 0.006 },
  2226: { density: 1.6, inner: 0.5, lattice: 1, parallax: 4, iridescence: 0.7, dotScale: 40,
          voxel: 0.035, glitchAmount: 0.003, chroma: 0.8, fresnelPower: 3.2,
          bodyAlpha: 0.015, dotIntensity: 1.3 },
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

  /* a little form for the body */
  float lit = 0.6 + 0.4 * abs(dot(N, normalize(vec3(0.4, 0.7, 0.6))));

  vec3 col = uColor * (uBodyAlpha * lit * (0.4 + 0.6 * f));
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
  if (uDensity > 0.0) {
    float back = texture2D(uThick, gl_FragCoord.xy / uResolution).r;
    float thick = max(back - vDepth, 0.0);
    float vol = 1.0 - exp(-thick * uDensity);
    col += mix(uColor, uCoreColor, vol * 0.5) * vol * uInner;
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
      uDensity:       { value: o.density },
      uInner:         { value: o.inner },
      uLattice:       { value: o.lattice },
      uParallax:      { value: o.parallax },
      uIridescence:   { value: o.iridescence },
      uVoxel:         { value: o.voxel },
      uTouch:         { value: o.touch },
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
  const depthMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    depthFunc: THREE.GreaterDepth,
    vertexShader: /* glsl */ `
      varying float vDepth;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vDepth;
      void main() { gl_FragColor = vec4(vDepth, 0.0, 0.0, 1.0); }`,
  });
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
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      /* a reversed depth test needs the buffer cleared to the near end */
      gl.clearDepth(0);
      renderer.clear();
      scene.overrideMaterial = depthMat;
      const prevAuto = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(scene, camera);
      renderer.autoClear = prevAuto;
      gl.clearDepth(1);
      scene.overrideMaterial = prevOverride;
      renderer.setRenderTarget(prevTarget);
      renderer.setClearColor(0x000000, prevClear);
      holo.uniforms.uThick.value = target.texture;
      holo.uniforms.uResolution.value.copy(size);
    },
    dispose: function () { target.dispose(); depthMat.dispose(); },
  };
}
