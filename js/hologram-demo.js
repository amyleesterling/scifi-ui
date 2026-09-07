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
  { name: "Light", open: true, knobs: [
    ["Opacity", "opacity", 0, 2, 0.05],
    ["Rim glow", "glowIntensity", 0, 4, 0.05],
    ["Rim power", "fresnelPower", 0.5, 6, 0.05],
    ["Body", "bodyAlpha", 0, 1.6, 0.01],
  ] },
  { name: "Surface", knobs: [
    ["Solid surface (0/1)", "solid", 0, 1, 1],
    ["Opaque (0/1)", "opaque", 0, 1, 1],
    ["Shading", "shade", 0, 1, 0.05],
    ["Roughness", "rough", 0.03, 1, 0.01],
    ["Metal", "metal", 0, 1, 0.01],
    ["Studio reflection", "env", 0, 2, 0.05],
    ["Cavity", "cavity", 0, 1, 0.05],
  ] },
  { name: "Rainbow", knobs: [
    ["Film thickness (nm)", "film", 100, 900, 5],
    ["Rainbow", "iri", 0, 2, 0.05],
    ["Sparkle", "sparkle", 0, 3, 0.05],
    ["Sparkle scale", "sparkleScale", 20, 400, 5],
    ["Diffraction at the rim", "iridescence", 0, 1, 0.01],
    ["Colour split", "chroma", 0, 1, 0.01],
  ] },
  { name: "Pattern", knobs: [
    ["Dot scale", "dotScale", 2, 120, 1],
    ["Dot radius", "dotRadius", 0.02, 0.4, 0.005],
    ["Dot glow", "dotIntensity", 0, 6, 0.05],
    ["Lattice (0 dots, 1 waves)", "lattice", 0, 1, 1],
    ["Lattice parallax", "parallax", 0, 12, 0.1],
  ] },
  { name: "Volume and bloom", knobs: [
    ["Volume density", "density", 0, 4, 0.05],
    ["Volume glow", "inner", 0, 1.5, 0.05],
    ["Halo", "halo", 0, 3, 0.05],
    ["Halo size", "haloSize", 0, 0.3, 0.005],
  ] },
  { name: "Glitch and touch", knobs: [
    ["Glitch rate", "glitchFreq", 0, 6, 0.1],
    ["Glitch jitter", "glitchAmount", 0, 0.05, 0.001],
    ["Voxel glitch", "voxel", 0, 0.1, 0.001],
    ["Touch", "touch", 0, 3, 0.05],
  ] },
  { name: "Dynamics", knobs: [
    ["Dynamics (0/1)", "weather", 0, 1, 1],
    ["Film (nm)", "weatherFilm", 0, 800, 10],
    ["Glow", "weatherGlow", 0, 2, 0.05],
    ["Spread", "weatherSpread", 0.05, 1, 0.01],
    ["Speed", "weatherSpeed", 0.1, 4, 0.05],
    ["Lift", "weatherLift", 0, 0.05, 0.001],
  ] },
];
const KNOBS = GROUPS.reduce(function (a, g) { return a.concat(g.knobs); }, []);
const ERAS = ["2026", "2076", "2226"];
const STYLE_LABEL = { supernova: "Supernova", emberLattice: "Ember lattice", lantern: "Lantern",
  aurora: "Aurora", goldOnBlue: "Gold on blue", solidGold: "Solid gold", whiteHeat: "White heat",
  holoFoil: "Holo foil", opal: "Opal", chromeSun: "Chrome sun", novaCore: "Nova core" };

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
  const swatches = form.querySelector("[data-swatches]");
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
  const eras = form.querySelector("[data-eras]");
  if (eras) {
    eras.innerHTML = ERAS.map(function (e) {
      return '<button type="button" data-era="' + e + '" aria-pressed="' + (e === era) + '">' + e + "</button>";
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
  const styles = form.querySelector("[data-styles]");
  if (styles) {
    const names = [""].concat(Object.keys(HOLO_STYLES));
    styles.innerHTML = names.map(function (n) {
      return '<button type="button" data-style="' + n + '" aria-pressed="' + (n === style) + '">' +
        (n ? STYLE_LABEL[n] || n : "None") + "</button>";
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

  const cellSel = form.querySelector("[data-cell]");
  cellSel.innerHTML = MESHES.map(function (c, i) {
    return '<option value="' + i + '">' + c.n + "</option>";
  }).join("");
  cellSel.addEventListener("change", function () { load(+cellSel.value); });

  const ranges = form.querySelector("[data-ranges]");
  function knobHTML(k) {
    const v = HOLO_DEFAULTS[k[1]];
    return '<label class="holoknob"><span>' + k[0] + '</span><output>' + v + '</output>' +
      '<input type="range" name="' + k[1] + '" min="' + k[2] + '" max="' + k[3] +
      '" step="' + k[4] + '" value="' + v + '"></label>';
  }
  ranges.innerHTML = GROUPS.map(function (g) {
    return '<details class="hologroup"' + (g.open ? " open" : "") + '><summary>' + g.name +
      '</summary>' + g.knobs.map(knobHTML).join("") + "</details>";
  }).join("");
  ranges.addEventListener("input", function (e) {
    const v = parseFloat(e.target.value);
    if (e.target.name === "weather") { setDynamics(v > 0); return; }
    setHologramParam(holo, e.target.name, v, group);
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
      swatches.querySelectorAll("input").forEach(function (i) { i.checked = false; });
    } else {
      setHologramParam(holo, "coreColor", HOLO_DEFAULTS.coreColor);
      const on = swatches.querySelector("input:checked");
      setHologramParam(holo, "color", on ? on.value : HOLO_DEFAULTS.color);
    }
    setHologramParam(holo, "haloColor", p.haloColor);
    p.weather = holo.uniforms.uWeather.value;   /* the toggle survives a style change */
    KNOBS.forEach(function (k) {
      setHologramParam(holo, k[1], p[k[1]], group);
      const r = ranges.querySelector('[name="' + k[1] + '"]');
      r.value = p[k[1]]; r.previousElementSibling.value = p[k[1]];
    });
    loop.once();
  }
  form.querySelector("[data-reset]").addEventListener("click", function () {
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
  const meshIdx = Math.min(MESHES.length - 1, Math.max(0, parseInt(params.get("mesh") || "0", 10) || 0));
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
