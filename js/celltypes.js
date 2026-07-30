/* Nine kinds of cell from the same volume, one at a time, at full resolution.
 *
 * WHAT IS REAL HERE. Every mesh is a reconstruction from the MICrONS electron
 * microscopy, decimated for the web. The segment ids are real minnie65 ids and
 * each one opens in Neuroglancer on the volume itself. Two of the nine are not
 * neurons, which is the point of including them: a cortical millimetre is not
 * made only of neurons.
 *
 * WHY THE FACE COUNT IS READ OFF THE FILE. meshes/cells/manifest.json records
 * what each extraction produced, and for seven of the nine it still matches the
 * bytes on disk exactly. Two, the chandelier and the Martinotti, were later
 * re exported at roughly twice the resolution and the manifest was not updated,
 * so its decimatedFaces and fileKB are wrong for those. Rather than quote a
 * stale number or drop two good cells, the decimated count is counted off the
 * geometry after it loads. The raw counts and the extent describe the original
 * reconstruction and are still the manifest's to give.
 *
 * ONE CONTEXT, ONE MESH. Nine canvases would be nine WebGL contexts and about
 * 25 MB of mesh for a reader who wanted to look at one cell. There is a single
 * stage, and choosing a cell fetches that cell and disposes the last one.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  REDUCED, makeRenderer, fitRenderer, makeLoop, whenNear,
  studioLights, shellMaterials, disposeTree, fmt,
} from "./holo3d.js";

/* slug, segment id, name, scientific type, class, colour, gallery state, and
   the raw reconstruction figures from the extraction manifest */
const CELLS = [
  { s: "lightning-tree", id: "864691135572530981", n: "Lightning Tree",
    t: "Layer 5 thick tufted pyramidal", c: "excitatory", col: "#23baff",
    g: "layer5_thick_tufted.json", raw: 10291430, rawV: 5231141, ext: 918888.1,
    d: "One thick apical dendrite climbing toward the surface, a tuft at the top, basal dendrites spread around the soma. A major output cell of cortex." },
  { s: "crown", id: "864691135855890478", n: "Crown",
    t: "Layer 2/3 pyramidal", c: "excitatory", col: "#5b7cff",
    g: "layer23_cells.json", raw: 11005639, rawV: 5594766, ext: 1083256.0,
    d: "The most numerous excitatory cell in cortex, and a smaller relative of the layer 5 cell above it." },
  { s: "dust-star", id: "864691135279086497", n: "Dust Star",
    t: "Layer 4 cell", c: "excitatory", col: "#7be4ff",
    g: "layer4_cells.json", raw: 2810605, rawV: 1427327, ext: 341232.0,
    d: "Layer 4 is where signals from the thalamus arrive in cortex. This is one of the cells that receives them." },
  { s: "coral-fan", id: "864691136662432990", n: "Coral Fan",
    t: "Parvalbumin basket cell", c: "inhibitory", col: "#b56fd8",
    g: "basket_cells.json", raw: 17970685, rawV: 9130867, ext: 528135.8,
    d: "Targets the cell body and the dendrites nearest it, close in, where it has the most say over when its neighbours fire." },
  { s: "candelabra", id: "864691135572094189", n: "Candelabra",
    t: "Chandelier cell", c: "inhibitory", col: "#ffd24a",
    g: "chandelier_cells.json", raw: 7775420, rawV: 3953855, ext: 393888.1,
    d: "Aims at the axon initial segment, the one place on a neuron where the decision to fire is actually taken." },
  { s: "reaching-hand", id: "864691135919630768", n: "Reaching Hand",
    t: "Martinotti cell", c: "inhibitory", col: "#3ee0bc",
    g: "martinotti_cells.json", raw: 11729181, rawV: 5959338, ext: 497912.1,
    d: "Reaches up into layer 1 and inhibits the far ends of the dendrites rather than the cell body. A dimmer rather than a stop." },
  { s: "spindle", id: "864691135407923657", n: "Spindle",
    t: "Bipolar interneuron", c: "inhibitory", col: "#ffae3e",
    g: "bipolar_cells.json", raw: 1254652, rawV: 638987, ext: 361176.0,
    d: "A narrow vertical cell that reaches across the layers rather than spreading out inside one of them." },
  { s: "forest-floor", id: "864691135113162137", n: "Forest Floor",
    t: "Protoplasmic astrocyte", c: "other", col: "#c2c8ff",
    g: "astrocytes.json", raw: 23896258, rawV: 12095041, ext: 93983.9,
    d: "Not a neuron. A glial cell whose fine processes wrap the synapses around it, which is why it carries so much surface in so little space." },
  { s: "watcher", id: "864691136194411734", n: "Watcher",
    t: "Microglia", c: "other", col: "#d4ff7e",
    g: "microglia_set.json", raw: 1254426, rawV: 636842, ext: 88791.8,
    d: "Not a neuron. The brain's resident immune cell, and the only one here that moves through the tissue rather than staying put." },
];

const CLASS_LABEL = {
  excitatory: "Excitatory", inhibitory: "Inhibitory", other: "Not a neuron",
};

export function mountCellTypes(el) {
  const mount = el.querySelector("[data-mount]");
  const status = el.querySelector("[data-status]");
  const rail = el.querySelector("[data-rail]");
  const facts = el.querySelector("[data-facts]");
  const blurb = el.querySelector("[data-blurb]");
  if (!mount || !rail) return;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.01, 100);
  camera.position.set(0, 0, 2.7);
  const renderer = makeRenderer(mount);
  studioLights(scene, CELLS[0].col);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 0.9;
  controls.maxDistance = 9;
  controls.autoRotate = !REDUCED;
  controls.autoRotateSpeed = 1.5;
  renderer.domElement.style.cursor = "grab";
  renderer.domElement.addEventListener("pointerdown", function () {
    controls.autoRotate = false;
    renderer.domElement.style.cursor = "grabbing";
  });
  renderer.domElement.addEventListener("pointerup", function () {
    renderer.domElement.style.cursor = "grab";
  });

  const loop = makeLoop(el, function () {
    controls.update();
    renderer.render(scene, camera);
  });

  const ro = new ResizeObserver(function () {
    if (fitRenderer(renderer, camera, mount)) loop.once();
  });
  ro.observe(mount);

  /* ---- the rail ---------------------------------------------------------- */
  let current = -1, group = null, token = 0;
  const loader = new GLTFLoader();

  rail.innerHTML = CELLS.map(function (c, i) {
    return '<button class="mviz-pick" type="button" data-i="' + i +
      '" style="--pick:' + c.col + '"><i></i><b>' + c.n + "</b><em>" + c.t +
      "</em></button>";
  }).join("");
  const picks = [].slice.call(rail.querySelectorAll(".mviz-pick"));
  picks.forEach(function (b, i) {
    b.addEventListener("click", function () { select(i); });
  });

  function select(i) {
    if (i === current) return;
    current = i;
    const c = CELLS[i];
    picks.forEach(function (b, k) {
      b.setAttribute("aria-pressed", String(k === i));
    });
    describe(c, null);
    if (blurb) blurb.textContent = c.d;

    if (status) {
      status.hidden = false;
      status.textContent = "Loading " + c.n;
    }
    const mine = ++token;

    loader.load("meshes/cells/" + c.s + ".glb", function (gltf) {
      /* a second click while this was in flight already asked for something
         else, so throw this away rather than fight the newer request */
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
        /* a cell is not centred on its own box, so it has to be recentred or
           it orbits around a point off to one side of itself */
        o.geometry.translate(-centre.x, -centre.y, -centre.z);
        shellMaterials(o, {
          color: c.col, emissive: c.col, emissiveIntensity: 0.22,
          wire: c.col, wireOpacity: 0.1, opacity: 0.95,
        });
        group.add(o);
        const idx = o.geometry.getIndex();
        tris += (idx ? idx.count : o.geometry.attributes.position.count) / 3;
      }
      /* every cell is framed to the same on screen size, so the rail reads as
         a set of shapes rather than a set of distances from the camera. The
         real extents differ by a factor of twelve and are given in the readout
         instead, where a number can say it properly. */
      const longest = Math.max(size.x, size.y, size.z) || 1;
      group.scale.setScalar(1.55 / longest);
      group.rotation.x = -0.08;
      scene.add(group);

      if (status) status.hidden = true;
      describe(c, Math.round(tris));
      controls.autoRotate = !REDUCED;
      fitRenderer(renderer, camera, mount);
      loop.run();
      loop.once();
    }, null, function () {
      if (mine !== token) return;
      if (status) status.textContent = "That mesh did not load.";
    });
  }

  /* ---- the readout -------------------------------------------------------
     "Also in the picture at the top" is a lookup in the banner's own table,
     not a second copy of it. One of these nine is among the 38. */
  function describe(c, tris) {
    if (!facts) return;
    const row = function (k, v, d) {
      return '<div class="mviz-row"><span>' + k + "</span><b>" + v + "</b>" +
             (d ? '<em class="mviz-note">' + d + "</em>" : "") + "</div>";
    };
    const table = window.MICRONS_CELLS || [];
    let onPage = null;
    for (const r of table) if (r[0] === c.id && r[1] > 0) onPage = r;

    const ng = "https://ngl.microns-explorer.org/#!gs://microns-static-links/mm3/" + c.g;
    facts.innerHTML =
      row("Class", CLASS_LABEL[c.c], c.t) +
      row("Segment", c.id,
        '<a href="' + ng + '" target="_blank" rel="noopener">Open this cell in Neuroglancer</a>') +
      row("Reconstruction",
        fmt(c.raw) + " faces",
        fmt(c.rawV) + " vertices, decimated to " +
        (tris == null ? "…" : fmt(tris)) + " for the web") +
      row("Longest extent", fmt(c.ext / 1000, 0) + " µm",
        onPage
          ? "this cell is one of the 38 above, soma " + fmt(onPage[1], 0) + " µm below the pia"
          : "measured across the reconstruction");
  }

  const start = whenNear(el, function () {
    if (status) status.textContent = "Choose a cell";
    fitRenderer(renderer, camera, mount);
    select(0);
  });

  return { el: el, loop: loop, start: start, select: select, scene: scene,
    camera: camera, renderer: renderer, cells: CELLS,
    dispose: function () {
      loop.stop(); ro.disconnect(); controls.dispose();
      disposeTree(scene); renderer.dispose();
    } };
}
