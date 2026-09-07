/* The hologram material's demo: one stage, one material, a mesh picker and a
 * slider per uniform. Mounted on the main page and on hologram-3d.html from
 * this one module, so the two never drift apart.
 *
 * Nothing fetches until the reader is near it (whenNear), and the render loop
 * only runs while the stage is on screen (makeLoop), the same rule every 3D
 * panel in this repo follows.
 *
 * Expected markup inside the root: a stage with [data-mount], [data-status]
 * and [data-facts], and a form[data-knobs] carrying [data-swatches],
 * [data-cell], [data-ranges] and [data-reset]. components/hologram-3d.css
 * styles it.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { REDUCED, makeRenderer, fitRenderer, makeLoop, whenNear, disposeTree, fmt }
  from "./holo3d.js";
import { HOLO_DEFAULTS, HOLO_ERAS, HOLO_STYLES, makeHologramMaterial, applyHologram, tickHologram,
  setHologramParam, touchHologram, makeThicknessPass, renderHologramFrame, setWeather, tickWeather }
  from "./holo-material.js";

/* The meshes the library already carries: two whole brain surfaces and the
   nine MICrONS cells. A shell and a cell want different settings. Fresnel is
   a silhouette effect, and a dendrite one pixel wide is all silhouette and no
   face, so on a cell the rim is softened, the body lifted, and the lattice
   made fine enough to land on a tube. Each entry's preset is laid over
   HOLO_DEFAULTS when it loads, and Reset returns to that preset. */
const CELL = { fresnelPower: 1.2, bodyAlpha: 0.4, glowIntensity: 2.5, opacity: 1.5,
               dotScale: 70, dotRadius: 0.16, dotIntensity: 1.2 };
const MICRONS = "MICrONS minnie65, decimated for the web";
export const MESHES = [
  { p: "meshes/mouse-brain.glb", n: "Mouse brain, whole surface",
    note: "Allen Institute reference atlas, root structure, 59,999 faces exported", preset: {} },
  /* the human cortex is folded: a ray through it crosses gyri and both
     hemispheres, eight or more surfaces where the mouse shell is two, and
     additive light stacks per surface. The gain is dropped to match. */
  { p: "meshes/human-brain.glb", n: "Human brain, cortex",
    note: "FreeSurfer pial surface, both hemispheres, 150,000 faces exported",
    preset: { opacity: 0.22, inner: 0.12 } },
  { p: "meshes/cells/lightning-tree.glb", n: "Lightning Tree, layer 5 pyramidal", note: MICRONS, preset: CELL },
  { p: "meshes/cells/crown.glb", n: "Crown, layer 2/3 pyramidal", note: MICRONS, preset: CELL },
  { p: "meshes/cells/dust-star.glb", n: "Dust Star, layer 4", note: MICRONS, preset: CELL },
  { p: "meshes/cells/coral-fan.glb", n: "Coral Fan, basket cell", note: MICRONS, preset: CELL },
  { p: "meshes/cells/candelabra.glb", n: "Candelabra, chandelier cell", note: MICRONS, preset: CELL },
  { p: "meshes/cells/reaching-hand.glb", n: "Reaching Hand, Martinotti cell", note: MICRONS, preset: CELL },
  { p: "meshes/cells/spindle.glb", n: "Spindle, bipolar interneuron", note: MICRONS, preset: CELL },
  { p: "meshes/cells/forest-floor.glb", n: "Forest Floor, astrocyte", note: MICRONS, preset: CELL },
  { p: "meshes/cells/watcher.glb", n: "Watcher, microglia", note: MICRONS, preset: CELL },
];
const SWATCHES = [
  ["#7EE0FF", "Cyan"], ["#3E96F0", "Electric blue"], ["#B2D8F8", "Beam"],
  ["#C4E4FF", "Line"], ["#8A60E6", "Violet"], ["#E8A93A", "Warm"],
];
/* The sliders, in groups. The first group is always open and carries the
   three that matter most; the rest fold. label, key, min, max, step. */
const GROUPS = [
  { name: "Light", open: true, help: "How much light the hologram gives, and where.", knobs: [
    ["Opacity", "opacity", 0, 2, 0.05, "Overall gain on the light. On a translucent style values above 1 stack brighter; on an opaque one it scales the surface."],
    ["Emission", "emission", 0, 2, 0.05, "Light the surface gives off on its own, in shadow or not. Opaque styles only."],
    ["Ombre to second colour", "ombre", 0, 1, 0.05, "Runs the colour from the crown of the object into the style's second colour at its base."],
    ["Rim glow", "glowIntensity", 0, 4, 0.05, "Fresnel: how bright the silhouette and every edge on angle burn. Above about 1.5 an edge clips to white."],
    ["Rim power", "fresnelPower", 0.5, 6, 0.05, "How thin the rim is. Higher keeps the light to the very edge; lower lets it bleed onto the faces."],
    ["Body", "bodyAlpha", 0, 1.6, 0.01, "Light the facing surface carries. Near zero the centre is clear; high, it is a lit body."],
  ] },
  { name: "Surface", help: "What kind of surface it is.", knobs: [
    ["Solid surface (0/1)", "solid", 0, 1, 1, "Draw only the nearest surface, through a depth prepass. A folded mesh reads as one body instead of a stack of translucent layers."],
    ["Opaque (0/1)", "opaque", 0, 1, 1, "Normal blending with depth write: a surface you cannot see through on any background, with the full surface model below."],
    ["Shading", "shade", 0, 1, 0.05, "0 is the hologram's own flat body; 1 is a lit surface with a key light and a highlight."],
    ["Roughness", "rough", 0.03, 1, 0.01, "Microfacet roughness. Low is a mirror, high is matte. Opaque only."],
    ["Metal", "metal", 0, 1, 0.01, "Metalness: what the highlight and the reflections are tinted by. 0 dielectric, 1 metal. Opaque only."],
    ["Studio reflection", "env", 0, 2, 0.05, "Strength of the procedural studio (dark ground, four soft boxes, one sun) reflected in the surface. Opaque only."],
    ["Cavity", "cavity", 0, 1, 0.05, "Darkens the sulci: a fold facing inward gets less light than a gyrus crest facing out. Opaque only."],
  ] },
  { name: "Rainbow", help: "Colour that depends on the angle you look from.", knobs: [
    ["Spectral shift with angle", "spectral", 0, 1, 0.01, "Dichroic: the whole hologram's hue walks around the wheel as the surface turns away from you. 1 is two thirds of a turn. Reaches the glow and the bloom too."],
    ["Spectral drift (turns/min)", "spectralDrift", 0, 6, 0.1, "The hue drifts with time, this many turns of the wheel a minute."],
    ["Film thickness (nm)", "film", 100, 900, 5, "Thickness of the thin film whose interference makes the rainbow bands. Each wavelength interferes at its own phase, so the colour runs through the spectrum with the angle of view."],
    ["Rainbow", "iri", 0, 2, 0.05, "Strength of the thin film colour. On a translucent style it tints the rim and body; on an opaque one it colours the highlight and the surface."],
    ["Sparkle", "sparkle", 0, 3, 0.05, "Diffraction glints: tight spectral highlights off random micro facets, changing colour with the angle."],
    ["Sparkle scale", "sparkleScale", 20, 400, 5, "How many glint cells per world unit. Higher is finer glitter."],
    ["Diffraction at the rim", "iridescence", 0, 1, 0.01, "Runs a spectrum along the rim at grazing angles, like a holographic plate. Translucent styles."],
    ["Colour split", "chroma", 0, 1, 0.01, "Chromatic split of the rim: red hugs the body, blue reaches past it. Widens during a glitch burst."],
  ] },
  { name: "Pattern", help: "The lattice drawn on the surface to show its shape.", knobs: [
    ["Dots across", "dotsAcross", 4, 300, 1, "How many dots (or lattice nodes) fit across the height of the object. The lattice sits in world space, so it holds still while the object turns."],
    ["Dot radius", "dotRadius", 0.02, 0.4, 0.005, "Radius of each dot as a fraction of its cell. For the wave lattice, how much of each node survives."],
    ["Dot glow", "dotIntensity", 0, 6, 0.05, "Brightness of the pattern. 0 removes it."],
    ["Lattice (0 dots, 1 waves)", "lattice", 0, 1, 1, "0 is a triplanar dot grid. 1 is four plane waves summed in 3D whose nodes drift with your viewing angle, the way a real hologram's fringes do."],
    ["Lattice parallax", "parallax", 0, 12, 0.1, "How far the wave nodes drift as you move your view. Waves only."],
  ] },
  { name: "Volume, glow and bloom", help: "Light inside the object, and light outside its silhouette.", knobs: [
    ["Volume density", "density", 0, 4, 0.05, "Optical density of the interior. A second pass measures how much object each ray passes through, and it glows by Beer's law. 0 is off."],
    ["Volume glow", "inner", 0, 1.5, 0.05, "Gain on the interior glow."],
    ["Glow", "halo", 0, 3, 0.05, "A tight light just outside the silhouette: three shells pushed a little way out, brightest where the surface turns away."],
    ["Glow size", "haloSize", 0, 0.3, 0.005, "How far the glow reaches, in world units."],
    ["Bloom", "bloom", 0, 3, 0.05, "A wide soft haze around the whole object: eight shells that relax toward a sphere as they go out, so the haze does not carry the folds."],
    ["Bloom size", "bloomSize", 0, 0.6, 0.01, "How far the bloom reaches, in world units."],
  ] },
  { name: "Glitch and touch", help: "Interference, and the response to a press.", knobs: [
    ["Glitch rate", "glitchFreq", 0, 6, 0.1, "How fast the interference noise runs. Bursts arrive in short bunches; 0 never."],
    ["Glitch jitter", "glitchAmount", 0, 0.05, 0.001, "How far the vertices shiver during a burst, as a fraction of the object's height."],
    ["Voxel glitch", "voxel", 0, 0.1, 0.001, "During a burst the geometry snaps to a voxel grid of this size, a digital recompute rather than analog noise. 0 off."],
    ["Touch", "touch", 0, 3, 0.05, "Rings of interference run out from where you press on the surface. 0 off. Fires on a press, never a hover."],
  ] },
  { name: "Dynamics", help: "The recording playing on the surface.", knobs: [
    ["Dynamics (0/1)", "weather", 0, 1, 1, "Play 30 seconds of real MICrONS calcium activity, 108 cells, on this hologram. Same as the Dynamics button."],
    ["Film (nm)", "weatherFilm", 0, 800, 10, "How much a cell's activity thickens the thin film where it lands, which runs the interference colour through the spectrum there."],
    ["Glow", "weatherGlow", 0, 2, 0.05, "Warm light added where the cells fire."],
    ["Spread", "weatherSpread", 0.05, 1, 0.01, "How far a cell's activity reaches across the surface, in mesh units."],
    ["Speed", "weatherSpeed", 0.1, 4, 0.05, "How fast activity travels outward from a cell, mesh units per second of the recording. A burst is a ring."],
    ["Lift", "weatherLift", 0, 0.05, 0.001, "How far the surface rises along its normal where there is activity."],
  ] },
];
const KNOBS = GROUPS.reduce(function (a, g) { return a.concat(g.knobs); }, []);
const ERAS = ["2026", "2076", "2226"];
const STYLE_HELP = {
  "": "The era alone, in the swatch colour, with no style laid over it.",
  supernova: "An opaque gold surface lit from within by emission, with a wide golden bloom.",
  lantern: "Paper lit from within: soft, warm white, hardly any rim, a wide gentle bloom.",
  aurora: "A solid surface with a wave lattice whose nodes drift with your view, and a rim that runs a spectrum.",
  goldOnBlue: "A cool blue body with a molten gold rim and a gold glow. One warm accent on a cool field.",
  novaCore: "Warm white, opaque, a little thin film for depth, a wide golden bloom.",
  holoFoil: "A holographic sticker: gold with the whole thin film spectrum sliding across it and spectral glints.",
  opal: "A blue pearl: the rainbow scattered inside a milky surface rather than reflected off it.",
  chromeSun: "A warm mirror. The studio and its sun are in the surface; the rainbow is a thin oil film on chrome.",
  solidGold: "Opaque gold with a lit surface, a highlight and a gold rim. For a page that is not black.",
  orchid: "Pink at the crown running to purple at the base, opaque, with a violet bloom.",
  whiteHeat: "Incandescent: an opaque warm white surface with a hot rim and a wide white gold bloom.",
  glass: "The BANC and FlyWire shell: a cool translucent skin with a bright cyan edge and a deep blue haze inside. Made to hold coloured things.",
  neonGlass: "The BANC palette: magenta at the crown into violet at the base, saturated, inside the cyan edged glass.",
};
const ERA_HELP = {
  "2026": "Light projected onto the outside of a shape: a translucent centre, a fresnel rim, a dot lattice.",
  "2076": "Adds a volume: the interior glows by how much object each ray passes through. Voxel glitch, a diffraction tint.",
  "2226": "A light field: an interference lattice whose nodes shift with your viewing angle, a full spectrum rim, a denser volume.",
};
const STYLE_LABEL = { supernova: "Supernova", lantern: "Lantern",
  aurora: "Aurora", goldOnBlue: "Gold on blue", solidGold: "Solid gold", whiteHeat: "White heat",
  holoFoil: "Holo foil", opal: "Opal", chromeSun: "Chrome sun", novaCore: "Nova core", orchid: "Orchid",
  glass: "Glass", neonGlass: "Neon glass" };

export function mountHologramDemo(root) {
  const mount = root.querySelector("[data-mount]");
  const status = root.querySelector("[data-status]");
  const facts = root.querySelector("[data-facts]");
  const form = root.querySelector("[data-knobs]");
  if (!mount || !form) return null;
  const stageEl = mount.closest(".mviz") || root;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 4 / 3, 0.01, 100);
  camera.position.set(0, 0.05, 2.9);
  const renderer = makeRenderer(mount);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.enablePan = false; controls.minDistance = 0.8; controls.maxDistance = 8;
  controls.autoRotate = !REDUCED; controls.autoRotateSpeed = 1.1;
  renderer.domElement.style.cursor = "grab";
  renderer.domElement.addEventListener("pointerdown", function () { controls.autoRotate = false; });

  const holo = makeHologramMaterial();
  const thickness = makeThicknessPass();
  let now = 0;

  /* the weather's clock: a frame of the recording, advanced at uRate times
     real time and wrapped at the end of the 30 seconds */
  const weather = { traces: null, manifest: null, frame: 0, rate: 1, ready: false, loading: false };
  const clock = root.querySelector("[data-weather-clock]");
  function tickWeatherClock(dt) {
    if (!weather.ready || holo.uniforms.uWeather.value < 0.5) return;
    if (weather.hold) { tickWeather(holo, weather.frame); return; }
    weather.frame = (weather.frame + dt * weather.traces.fps * weather.rate) % weather.traces.frames;
    tickWeather(holo, weather.frame);
    if (clock) clock.textContent = (weather.frame / weather.traces.fps).toFixed(1) + " s of " +
      (weather.traces.frames / weather.traces.fps).toFixed(0) + " s, at " + weather.rate + "x";
  }

  const loop = makeLoop(stageEl, function (dt, t) {
    now = t;
    tickHologram(holo, t);
    tickWeatherClock(dt);
    controls.update();
    renderHologramFrame(renderer, scene, camera, holo, thickness);
  });

  /* Load the recording and put every cell on the surface. The cells are 108
     MICrONS neurons in a mouse's visual cortex; the surface is whatever mesh
     is loaded, a human cortex by default. So the placement is a metaphor and
     the copy says so: the swarm is scaled to sit inside the mesh, and each
     cell's epicentre is where a ray from the centre through its soma meets
     the surface. The activity, its timing, and which cell is which are real. */
  function loadWeather() {
    if (weather.ready || weather.loading) return Promise.resolve();
    weather.loading = true;
    return Promise.all([
      fetch("data/activity-manifest.json").then(function (r) { return r.json(); }),
      fetch("data/activity-traces.bin").then(function (r) { return r.arrayBuffer(); }),
    ]).then(function (res) {
      const manifest = res[0], buf = res[1];
      const dv = new DataView(buf);
      const cells = dv.getUint32(0, true), frames = dv.getUint32(4, true), fps = dv.getFloat32(8, true);
      weather.manifest = manifest;
      weather.traces = { cells: cells, frames: frames, fps: fps, data: new Float32Array(buf, 12, cells * frames) };
      weather.loading = false; weather.ready = true;
      placeWeather();
    });
  }
  function placeWeather() {
    if (!weather.ready || !group) return;
    const cells = weather.manifest.cells;
    /* the swarm's own centre and extent, then scaled to 55% of the mesh */
    const box = new THREE.Box3();
    cells.forEach(function (c) { box.expandByPoint(new THREE.Vector3().fromArray(c.world)); });
    const centre = new THREE.Vector3(); box.getCenter(centre);
    const size = new THREE.Vector3(); box.getSize(size);
    const meshes = [];
    group.traverse(function (o) { if (o.isMesh && o.material === holo) meshes.push(o); });
    const mbox = new THREE.Box3();
    meshes.forEach(function (m) { m.geometry.computeBoundingBox(); mbox.union(m.geometry.boundingBox); });
    const msize = new THREE.Vector3(); mbox.getSize(msize);
    const mcentre = new THREE.Vector3(); mbox.getCenter(mcentre);
    const s = 0.55 * Math.max(msize.x, msize.y, msize.z) / (Math.max(size.x, size.y, size.z) || 1);
    const ray = new THREE.Raycaster();
    const epi = new Float32Array(cells.length * 4);
    /* raycast in mesh space: the meshes sit at the group origin unrotated,
       so their local frame is the frame the vertex shader reads position in */
    const saved = group.matrixWorld.clone();
    group.matrixWorld.identity();
    meshes.forEach(function (m) { m.matrixWorld.identity(); });
    let hits = 0;
    cells.forEach(function (c, i) {
      const p = new THREE.Vector3().fromArray(c.world).sub(centre).multiplyScalar(s).add(mcentre);
      const dir = p.clone().sub(mcentre).normalize();
      ray.set(mcentre, dir); ray.far = 100;
      const hs = ray.intersectObjects(meshes, false);
      /* the outermost hit is the pial surface; a fold's inner wall is not */
      const h = hs.length ? hs[hs.length - 1].point : p;
      if (hs.length) hits++;
      epi[i * 4] = h.x; epi[i * 4 + 1] = h.y; epi[i * 4 + 2] = h.z; epi[i * 4 + 3] = 1;
    });
    group.matrixWorld.copy(saved);
    group.updateMatrixWorld(true);
    weather.hits = hits;
    setWeather(holo, weather.traces, epi);
    if (facts) facts.insertAdjacentHTML("beforeend",
      '<div class="mviz-row"><span>Weather</span><b>' + cells.length + ' cells, ' +
      (weather.traces.frames / weather.traces.fps).toFixed(0) + ' s</b>' +
      '<em class="mviz-note">MICrONS two photon calcium, 30 frames a second, real timing. ' +
      'The cells are from a mouse visual cortex and the surface is not; each one is placed where a ray ' +
      'from the centre through its soma meets the pia (' + hits + ' of ' + cells.length + ' landed).</em></div>');
  }

  /* the touch: the pointer's point on the surface, raycast against the real
     mesh, throttled because a cell is 120,000 triangles with no BVH. A tap
     on a phone lands the same way; a drag that turns the object does not
     keep re-touching it, the point stays where the finger went down. */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let lastCast = 0;
  function cast(ev) {
    if (!group) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(group, true)[0];
    if (hit) { touchHologram(holo, hit.point, now); loop.once(); }
  }
  /* only a deliberate press, never a hover, and only when the style asks
     for touch at all */
  renderer.domElement.addEventListener("pointerdown", function (ev) {
    if (holo.uniforms.uTouch.value <= 0) return;
    cast(ev);
  });
  renderer.domElement.addEventListener("pointerleave", function () {
    /* the rings finish their decay on their own; the flag only stops new
       ones. Nothing is switched off mid ripple. */
  });
  const ro = new ResizeObserver(function () {
    if (fitRenderer(renderer, camera, mount)) loop.once();
  });
  ro.observe(mount);

  /* ---- the knobs ------------------------------------------------------- */
  const swatches = root.querySelector("[data-swatches]");
  swatches.innerHTML = SWATCHES.map(function (s) {
    const on = s[0].toUpperCase() === HOLO_DEFAULTS.color.toUpperCase();
    return '<label style="--c:' + s[0] + '" title="' + s[1] + '"><input type="radio" name="colour" value="' +
      s[0] + '"' + (on ? " checked" : "") + ' aria-label="' + s[1] + '"><i></i></label>';
  }).join("");
  swatches.addEventListener("change", function (e) {
    style = "";
    if (styles) styles.querySelectorAll("[data-style]").forEach(function (x) {
      x.setAttribute("aria-pressed", String(x.getAttribute("data-style") === ""));
    });
    setHologramParam(holo, "coreColor", HOLO_DEFAULTS.coreColor);
    setHologramParam(holo, "color", e.target.value); loop.once();
  });

  /* the era: three presets on the one material */
  let era = "2026";
  const eras = root.querySelector("[data-eras]");
  if (eras) {
    eras.innerHTML = ERAS.map(function (e) {
      return '<button type="button" data-era="' + e + '" aria-pressed="' + (e === era) + '" title="' +
        (ERA_HELP[e] || "") + '">' + e + "</button>";
    }).join("");
    eras.addEventListener("click", function (ev) {
      const b = ev.target.closest("[data-era]");
      if (!b) return;
      era = b.getAttribute("data-era");
      eras.querySelectorAll("[data-era]").forEach(function (x) {
        x.setAttribute("aria-pressed", String(x === b));
      });
      applyPreset();
    });
  }

  /* the style: whole looks, laid over the era. "None" is the era alone. */
  const params = new URLSearchParams(location.search);
  /* gold on blue is the one the page opens on, Amy's call; ?style=none gives the bare era */
  let style = params.get("style") === "none" ? "" :
    HOLO_STYLES[params.get("style")] ? params.get("style") : "goldOnBlue";
  if (ERAS.indexOf(params.get("era")) >= 0) era = params.get("era");
  const styles = root.querySelector("[data-styles]");
  if (styles) {
    const names = [""].concat(Object.keys(HOLO_STYLES));
    styles.innerHTML = names.map(function (n) {
      return '<button type="button" data-style="' + n + '" aria-pressed="' + (n === style) + '" title="' +
        (STYLE_HELP[n] || "").replace(/"/g, "&quot;") + '">' + (n ? STYLE_LABEL[n] || n : "None") + "</button>";
    }).join("");
    styles.addEventListener("click", function (ev) {
      const b = ev.target.closest("[data-style]");
      if (!b) return;
      style = b.getAttribute("data-style");
      styles.querySelectorAll("[data-style]").forEach(function (x) {
        x.setAttribute("aria-pressed", String(x === b));
      });
      applyPreset();
    });
  }
  if (eras) eras.querySelectorAll("[data-era]").forEach(function (x) {
    x.setAttribute("aria-pressed", String(x.getAttribute("data-era") === era));
  });

  const cellSel = root.querySelector("[data-cell]");
  cellSel.innerHTML = MESHES.map(function (c, i) {
    return '<option value="' + i + '">' + c.n + "</option>";
  }).join("");
  cellSel.addEventListener("change", function () { load(+cellSel.value); });

  const ranges = form.querySelector("[data-ranges]");
  /* "dots across" is the dot scale times the object's height, so the
     number on the slider is a count you could check by eye */
  function objectHeight() { const b = holo.uniforms.uBounds.value; return Math.max(b.y - b.x, 1e-3); }
  function toParam(key, v) { return key === "dotsAcross" ? { key: "dotScale", v: v / objectHeight() } : { key: key, v: v }; }
  function fromParam(key, v) { return key === "dotsAcross" ? Math.round(v * objectHeight()) : v; }
  function knobHTML(k) {
    const v = fromParam(k[1], HOLO_DEFAULTS[k[1] === "dotsAcross" ? "dotScale" : k[1]]);
    const tip = (k[5] || "").replace(/"/g, "&quot;");
    return '<label class="holoknob" title="' + tip + '"><span>' + k[0] + '</span><output>' + v + '</output>' +
      '<input type="range" name="' + k[1] + '" min="' + k[2] + '" max="' + k[3] +
      '" step="' + k[4] + '" value="' + v + '" aria-label="' + k[0] + '"></label>';
  }
  ranges.innerHTML = GROUPS.map(function (g) {
    return '<details class="hologroup"' + (g.open ? " open" : "") + '><summary title="' +
      (g.help || "").replace(/"/g, "&quot;") + '">' + g.name +
      '</summary>' + g.knobs.map(knobHTML).join("") + "</details>";
  }).join("");
  ranges.addEventListener("input", function (e) {
    const v = parseFloat(e.target.value);
    if (e.target.name === "weather") { setDynamics(v > 0); return; }
    const m = toParam(e.target.name, v);
    setHologramParam(holo, m.key, m.v, group);
    e.target.previousElementSibling.value = v;
    loop.once();
  });
  /* the Dynamics toggle: the same param as the slider, as a button, and it
     loads the recording the first time it is pressed */
  const dynBtn = root.querySelector("[data-dynamics]");
  function setDynamics(on) {
    if (on) loadWeather();
    setHologramParam(holo, "weather", on ? 1 : 0, group);
    const r = ranges.querySelector('[name="weather"]');
    if (r) { r.value = on ? 1 : 0; r.previousElementSibling.value = on ? 1 : 0; }
    if (dynBtn) {
      dynBtn.setAttribute("aria-pressed", String(on));
      dynBtn.textContent = on ? "Dynamics on" : "Dynamics off";
    }
    if (clock && !on) clock.textContent = "";
    loop.once();
  }
  if (dynBtn) dynBtn.addEventListener("click", function () {
    setDynamics(holo.uniforms.uWeather.value < 0.5);
  });
  /* fullscreen: the stage card takes the screen, the canvas follows it
     through the ResizeObserver, Escape gives it back */
  const fsBtn = root.querySelector("[data-fullscreen]");
  if (fsBtn) {
    if (!stageEl.requestFullscreen) fsBtn.hidden = true;
    fsBtn.addEventListener("click", function () {
      if (document.fullscreenElement) document.exitFullscreen();
      else stageEl.requestFullscreen();
    });
    document.addEventListener("fullscreenchange", function () {
      const on = document.fullscreenElement === stageEl;
      fsBtn.setAttribute("aria-pressed", String(on));
      fsBtn.textContent = on ? "Exit fullscreen" : "Fullscreen";
      fitRenderer(renderer, camera, mount); loop.once();
    });
  }
  const rateSel = root.querySelector("[data-weather-rate]");
  if (rateSel) rateSel.addEventListener("change", function () { weather.rate = parseFloat(rateSel.value) || 1; });

  /* the current mesh's preset over the defaults, into the material and onto
     the sliders, so the panel never shows a number the shader is not using */
  let current = MESHES[0];
  function applyPreset() {
    /* a solid style draws one layer, so a mesh's layered gain must not apply */
    const base = Object.assign({}, HOLO_DEFAULTS, HOLO_ERAS[era] || {}, HOLO_STYLES[style] || {});
    const mp = Object.assign({}, current.preset);
    if (base.solid) { delete mp.opacity; delete mp.inner; }
    const p = Object.assign(base, mp);
    if (REDUCED) { p.glitchAmount = 0; p.glitchFreq = 0; }
    /* a style carries its colours; without one the swatch stands */
    if (HOLO_STYLES[style]) {
      setHologramParam(holo, "color", p.color);
      setHologramParam(holo, "coreColor", p.coreColor);
      setHologramParam(holo, "color2", p.color2);
      swatches.querySelectorAll("input").forEach(function (i) { i.checked = false; });
    } else {
      setHologramParam(holo, "coreColor", HOLO_DEFAULTS.coreColor);
      setHologramParam(holo, "color2", HOLO_DEFAULTS.color2);
      const on = swatches.querySelector("input:checked");
      setHologramParam(holo, "color", on ? on.value : HOLO_DEFAULTS.color);
    }
    setHologramParam(holo, "haloColor", p.haloColor);
    p.weather = holo.uniforms.uWeather.value;   /* the toggle survives a style change */
    /* ?p.key=value overrides any slider from the URL, for a render or a link */
    params.forEach(function (v, k) { if (k.slice(0, 2) === "p." && k.slice(2) in p) p[k.slice(2)] = parseFloat(v); });
    KNOBS.forEach(function (k) {
      const key = k[1] === "dotsAcross" ? "dotScale" : k[1];
      setHologramParam(holo, key, p[key], group);
      const shown = fromParam(k[1], p[key]);
      const r = ranges.querySelector('[name="' + k[1] + '"]');
      r.value = shown; r.previousElementSibling.value = shown;
    });
    loop.once();
  }
  root.querySelector("[data-reset]").addEventListener("click", function () {
    swatches.querySelectorAll("input").forEach(function (i) {
      i.checked = i.value.toUpperCase() === HOLO_DEFAULTS.color.toUpperCase();
    });
    applyPreset();
  });

  /* ---- the look, as a thing that travels ---------------------------------
     Another page can open this maker with ?to=<its url>. A button appears
     that sends the current look back as ?holo=<base64 json> on that url,
     and a maker opened with ?holo= restores the look onto its knobs, so the
     round trip can go on. The look is the era, the style, the three
     colours and every knob. */
  function currentLook() {
    const look = { era: era, style: style };
    look.color = "#" + holo.uniforms.uColor.value.getHexString();
    look.coreColor = "#" + holo.uniforms.uCoreColor.value.getHexString();
    look.haloColor = "#" + holo.halo.uHaloColor.value.getHexString();
    KNOBS.forEach(function (k) {
      const r = ranges.querySelector('[name="' + k[1] + '"]');
      look[k[1]] = parseFloat(r.value);
    });
    return look;
  }
  function applyLook(look) {
    if (ERAS.indexOf(String(look.era)) >= 0) { era = String(look.era); }
    if (eras) eras.querySelectorAll("[data-era]").forEach(function (x) { x.setAttribute("aria-pressed", String(x.getAttribute("data-era") === era)); });
    style = HOLO_STYLES[look.style] ? look.style : "";
    if (styles) styles.querySelectorAll("[data-style]").forEach(function (x) { x.setAttribute("aria-pressed", String(x.getAttribute("data-style") === style)); });
    applyPreset();
    if (look.color) setHologramParam(holo, "color", look.color);
    if (look.coreColor) setHologramParam(holo, "coreColor", look.coreColor);
    if (look.haloColor) setHologramParam(holo, "haloColor", look.haloColor);
    swatches.querySelectorAll("input").forEach(function (i) { i.checked = look.color && i.value.toUpperCase() === String(look.color).toUpperCase(); });
    KNOBS.forEach(function (k) {
      if (typeof look[k[1]] !== "number") return;
      setHologramParam(holo, k[1], look[k[1]], group);
      const r = ranges.querySelector('[name="' + k[1] + '"]');
      r.value = look[k[1]]; r.previousElementSibling.value = look[k[1]];
    });
    loop.once();
  }
  const encodeLook = function (look) { return btoa(unescape(encodeURIComponent(JSON.stringify(look)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
  const decodeLook = function (str) { try { return JSON.parse(decodeURIComponent(escape(atob(str.replace(/-/g, "+").replace(/_/g, "/"))))); } catch (e) { return null; } };
  const sendTo = params.get("to");
  let pendingLook = params.get("holo") ? decodeLook(params.get("holo")) : null;
  if (sendTo) {
    let host = "the page that sent you";
    try { host = new URL(sendTo).hostname; } catch (e) {}
    const btn = document.createElement("button");
    btn.type = "button"; btn.setAttribute("data-send", "");
    btn.textContent = "Apply this look on " + host;
    btn.addEventListener("click", function () {
      let u; try { u = new URL(sendTo); } catch (e) { return; }
      u.searchParams.set("holo", encodeLook(currentLook()));
      location.href = u.toString();
    });
    form.appendChild(btn);
  }

  /* ---- the mesh -------------------------------------------------------- */
  let group = null, token = 0;
  const loader = new GLTFLoader();
  function load(i) {
    current = MESHES[i];
    if (cellSel.value !== String(i)) cellSel.value = String(i);
    if (status) { status.hidden = false; status.textContent = "Loading " + current.n.split(",")[0]; }
    const mine = ++token;
    loader.load(current.p, function (gltf) {
      if (mine !== token) { disposeTree(gltf.scene); return; }
      if (group) { scene.remove(group); disposeTree(group); }
      group = new THREE.Group();
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const centre = new THREE.Vector3(); box.getCenter(centre);
      const size = new THREE.Vector3(); box.getSize(size);
      let tris = 0;
      const src = [];
      gltf.scene.traverse(function (o) { if (o.isMesh) src.push(o); });
      for (const o of src) {
        o.geometry.translate(-centre.x, -centre.y, -centre.z);
        if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
        group.add(o);
        const idx = o.geometry.getIndex();
        tris += (idx ? idx.count : o.geometry.attributes.position.count) / 3;
      }
      /* a shell is framed whole. A cell is framed on its arbor, twice as
         close, because at whole cell framing a dendrite is thinner than a
         pixel and a surface shader has nothing to draw; the axon runs off the
         stage, which is fine, it is the arbor that reads */
      const frame = current.preset === CELL ? 3.6 : 1.7;
      group.scale.setScalar(frame / (Math.max(size.x, size.y, size.z) || 1));
      /* a three quarter view to start: every mesh here is exported facing the
         camera square on, and a hologram wants an angle */
      group.rotation.set(isNaN(pitch) ? 0.18 : pitch, isNaN(yaw) ? 0.6 : yaw, 0);
      scene.add(group);
      /* the material is applied last: it reads the world bounds */
      applyHologram(group, holo);
      applyPreset();
      if (weather.ready) placeWeather();
      else if (params.get("weather") === "1" || params.get("dynamics") === "1") {
        loadWeather().then(function () { setDynamics(true); });
      }
      if (status) status.hidden = true;
      if (facts) facts.innerHTML =
        '<div class="mviz-row"><span>Mesh</span><b>' + fmt(Math.round(tris)) + ' faces</b>' +
        '<em class="mviz-note">' + current.note + '</em></div>';
      fitRenderer(renderer, camera, mount);
      loop.run(); loop.once();
    }, null, function () {
      if (mine === token && status) status.textContent = "That mesh did not load.";
    });
  }

  /* ?mesh=N picks the mesh, ?shot=1 is the render mode: no auto rotate, a
     fixed three quarter view, so a headless browser gets the same frame
     every time; ?yaw= and ?pitch= set it in radians */
  const meshIdx = Math.min(MESHES.length - 1, Math.max(0, parseInt(params.get("mesh") || "1", 10) || 0));
  const shot = params.get("shot") === "1";
  const yaw = parseFloat(params.get("yaw")), pitch = parseFloat(params.get("pitch"));
  if (params.get("frame")) { weather.frame = parseFloat(params.get("frame")) || 0; weather.hold = true; }
  if (params.get("rate")) weather.rate = parseFloat(params.get("rate")) || 1;
  if (shot) controls.autoRotate = false;
  const start = whenNear(stageEl, function () {
    fitRenderer(renderer, camera, mount);
    load(meshIdx);
    if (pendingLook) { const lk = pendingLook; pendingLook = null; setTimeout(function () { applyLook(lk); }, 400); }
  });

  return { el: root, loop: loop, start: start, load: load, material: holo, shot: shot, weather: weather,
    loadWeather: loadWeather, setDynamics: setDynamics,
    setStyle: function (s) { const b = styles && styles.querySelector('[data-style="' + s + '"]'); if (b) b.click(); },
    scene: scene, camera: camera, renderer: renderer, meshes: MESHES,
    group: function () { return group; },
    thickness: thickness,
    setEra: function (e) {
      const b = eras && eras.querySelector('[data-era="' + e + '"]');
      if (b) b.click();
    },
    dispose: function () {
      loop.stop(); ro.disconnect(); controls.dispose(); thickness.dispose();
      disposeTree(scene); renderer.dispose();
    } };
}
