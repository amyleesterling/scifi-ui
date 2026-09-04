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
import { HOLO_DEFAULTS, HOLO_ERAS, makeHologramMaterial, applyHologram, tickHologram,
  setHologramParam, touchHologram, makeThicknessPass } from "./holo-material.js";

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
  { p: "meshes/human-brain.glb", n: "Human brain, cortex",
    note: "FreeSurfer pial surface, both hemispheres, 150,000 faces exported", preset: {} },
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
/* label, key, min, max, step */
const KNOBS = [
  ["Rim glow", "glowIntensity", 0, 4, 0.05],
  ["Rim power", "fresnelPower", 0.5, 6, 0.05],
  ["Body", "bodyAlpha", 0, 0.6, 0.005],
  ["Dot scale", "dotScale", 2, 120, 1],
  ["Dot radius", "dotRadius", 0.02, 0.4, 0.005],
  ["Dot glow", "dotIntensity", 0, 3, 0.05],
  ["Glitch rate", "glitchFreq", 0, 6, 0.1],
  ["Glitch jitter", "glitchAmount", 0, 0.05, 0.001],
  ["Colour split", "chroma", 0, 1, 0.01],
  ["Gain", "opacity", 0, 2, 0.05],
  /* the light field */
  ["Volume density", "density", 0, 4, 0.05],
  ["Volume glow", "inner", 0, 1.5, 0.05],
  ["Lattice (0 dots, 1 waves)", "lattice", 0, 1, 1],
  ["Lattice parallax", "parallax", 0, 12, 0.1],
  ["Diffraction", "iridescence", 0, 1, 0.01],
  ["Voxel glitch", "voxel", 0, 0.1, 0.001],
  ["Touch", "touch", 0, 3, 0.05],
];
const ERAS = ["2026", "2076", "2226"];

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

  const loop = makeLoop(stageEl, function (dt, t) {
    now = t;
    tickHologram(holo, t);
    controls.update();
    thickness.render(renderer, scene, camera, holo);
    renderer.render(scene, camera);
  });

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
  renderer.domElement.addEventListener("pointermove", function (ev) {
    if (ev.buttons) return;
    const t = performance.now();
    if (t - lastCast < 40) return;
    lastCast = t;
    cast(ev);
  });
  renderer.domElement.addEventListener("pointerdown", cast);
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

  const cellSel = form.querySelector("[data-cell]");
  cellSel.innerHTML = MESHES.map(function (c, i) {
    return '<option value="' + i + '">' + c.n + "</option>";
  }).join("");
  cellSel.addEventListener("change", function () { load(+cellSel.value); });

  const ranges = form.querySelector("[data-ranges]");
  ranges.innerHTML = KNOBS.map(function (k) {
    const v = HOLO_DEFAULTS[k[1]];
    return '<label class="holoknob"><span>' + k[0] + '</span><output>' + v + '</output>' +
      '<input type="range" name="' + k[1] + '" min="' + k[2] + '" max="' + k[3] +
      '" step="' + k[4] + '" value="' + v + '"></label>';
  }).join("");
  ranges.addEventListener("input", function (e) {
    const v = parseFloat(e.target.value);
    setHologramParam(holo, e.target.name, v);
    e.target.previousElementSibling.value = v;
    loop.once();
  });

  /* the current mesh's preset over the defaults, into the material and onto
     the sliders, so the panel never shows a number the shader is not using */
  let current = MESHES[0];
  function applyPreset() {
    const p = Object.assign({}, HOLO_DEFAULTS, HOLO_ERAS[era] || {}, current.preset);
    if (REDUCED) { p.glitchAmount = 0; p.glitchFreq = 0; }
    KNOBS.forEach(function (k) {
      setHologramParam(holo, k[1], p[k[1]]);
      const r = ranges.querySelector('[name="' + k[1] + '"]');
      r.value = p[k[1]]; r.previousElementSibling.value = p[k[1]];
    });
    loop.once();
  }
  form.querySelector("[data-reset]").addEventListener("click", function () {
    applyPreset();
    setHologramParam(holo, "color", HOLO_DEFAULTS.color);
    swatches.querySelectorAll("input").forEach(function (i) {
      i.checked = i.value.toUpperCase() === HOLO_DEFAULTS.color.toUpperCase();
    });
    loop.once();
  });

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
      group.rotation.set(0.18, 0.6, 0);
      scene.add(group);
      /* the material is applied last: it reads the world bounds */
      applyHologram(group, holo);
      applyPreset();
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

  const start = whenNear(stageEl, function () {
    fitRenderer(renderer, camera, mount);
    load(0);
  });

  return { el: root, loop: loop, start: start, load: load, material: holo,
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
