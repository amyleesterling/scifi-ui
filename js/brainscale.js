/* Two brains in one space, at their true relative size, each turned on its own.
 *
 * WHAT IS REAL HERE. Both meshes are measured surfaces, not models: the human
 * is the FreeSurfer pial surface, left and right hemispheres, plus the
 * cerebellum in the same coordinate frame; the mouse is the Allen Institute
 * root compartment, structure 997. Their recorded bounding boxes ship beside
 * them in human-brain.json and mouse-brain.json, and every number this panel
 * prints is computed from those two files at load rather than typed in.
 *
 * THE SCALE IS DERIVED, NOT ASSUMED. Both GLBs were exported normalised to two
 * units on their own longest axis, so putting them in one scene at face value
 * would draw a mouse brain the size of a human one. The ratio that undoes that
 * is (mouse longest mm) / (human longest mm), which the recorded boxes give as
 * 13.184 / 170.050, or 0.07753. Inner Cosmos uses a round 1/15 for the same
 * comparison, which is 14 per cent small; the honest figure is 1/12.9, and it
 * is worth the arithmetic because the whole point of the panel is the size.
 *
 * EACH BRAIN TURNS ON ITS OWN. There is no OrbitControls here and the camera
 * never moves, which is the difference between this and the upstream version:
 * orbiting a camera turns both brains together and tells you nothing about
 * either. A drag raycasts, finds which brain it landed on, and turns that one.
 * With the mouse brain at 7.8 per cent of the width of the human one it is a
 * small target, so a miss falls back to whichever brain is nearer the pointer
 * on screen.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  REDUCED, makeRenderer, fitRenderer, makeLoop, whenNear,
  studioLights, shellMaterials, disposeTree, fmt,
} from "./holo3d.js";

const HUMAN = "#b072e0", HUMAN_EM = "#7a3ac0", HUMAN_WIRE = "#f0c0ff";
const MOUSE = "#6fd0ff", MOUSE_EM = "#1c6ea8", MOUSE_WIRE = "#cdefff";
const V1 = "#ffc24a";           /* the pia colour from the render's own ramp */

export function mountBrainScale(el) {
  const mount = el.querySelector("[data-mount]");
  const status = el.querySelector("[data-status]");
  const facts = el.querySelector("[data-facts]");
  const toggle = el.querySelector("[data-truescale]");
  const label = el.querySelector("[data-scalelabel]");
  if (!mount) return;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.01, 100);
  camera.position.set(0, 0.06, 3.05);
  camera.lookAt(0, -0.02, 0);
  const renderer = makeRenderer(mount);
  studioLights(scene, HUMAN);

  /* Each brain gets a pivot the drag turns, inside a placer that holds its
     position and scale. Turning the pivot then never fights the layout. */
  const humanPivot = new THREE.Group(), humanPlace = new THREE.Group();
  const mousePivot = new THREE.Group(), mousePlace = new THREE.Group();
  humanPlace.add(humanPivot); mousePlace.add(mousePivot);
  scene.add(humanPlace); scene.add(mousePlace);

  const BRAINS = [
    { key: "human", pivot: humanPivot, place: humanPlace, meshes: [] },
    { key: "mouse", pivot: mousePivot, place: mousePlace, meshes: [] },
  ];

  let trueScale = true, mouseScale = 1, ready = false;

  const loop = makeLoop(el, function (dt) {
    /* the idle turn is ambient and stops under a motion preference. A brain
       being dragged is never also drifting. */
    if (!REDUCED) {
      for (const b of BRAINS) if (b !== dragging) b.pivot.rotation.y += dt * 0.16;
    }
    for (const b of BRAINS) {
      b.pivot.rotation.y += b.vel * dt;
      b.vel *= Math.pow(0.0016, dt);          /* framerate independent decay */
    }
    renderer.render(scene, camera);
  });
  for (const b of BRAINS) b.vel = 0;

  /* ---- layout ------------------------------------------------------------
     The human sits left of centre and the mouse right of it, both on the same
     baseline, because a size comparison needs a shared floor to be read off. */
  /* The lowest point of each brain in its own frame, measured off the loaded
     geometry. It is the minimum and not half the height, because neither mesh
     is centred on its own vertical middle: the cerebellum hangs below the
     cortex, and using a half height leaves the two floors 0.02 units apart,
     which is a visible step under a size comparison. Nor can the height be
     assumed, since both were normalised to two units on their LONGEST axis,
     the front to back one, so neither brain is two units tall. */
  function minY(brain) {
    let lo = Infinity;
    for (const m of brain.meshes) {
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      lo = Math.min(lo, m.geometry.boundingBox.min.y);
    }
    return lo === Infinity ? -1 : lo;
  }

  const BASE = 0.82;
  function layout() {
    const s = trueScale ? mouseScale : 1;
    humanPlace.position.set(-0.62, 0, 0);
    humanPlace.scale.setScalar(BASE);
    mousePlace.scale.setScalar(BASE * s);
    /* one floor line for both: put the mouse's own lowest point on the human's */
    mousePlace.position.set(trueScale ? 0.72 : 0.92,
      BASE * minY(BRAINS[0]) - BASE * s * minY(BRAINS[1]), 0);
    if (label) {
      label.textContent = trueScale
        ? "true relative size, mouse at 1/" + fmt(1 / mouseScale, 1)
        : "matched size, the mouse brain enlarged " + fmt(1 / mouseScale, 1) + " times";
    }
    loop.once();
  }

  /* ---- the drag ----------------------------------------------------------
     pointerdown picks a brain, pointermove turns it, and the pointer is
     captured so a drag that leaves a small target still belongs to it. */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let dragging = null, lastX = 0, lastY = 0;

  function pick(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    for (const b of BRAINS) {
      if (b.meshes.length && ray.intersectObjects(b.meshes, false).length) return b;
    }
    /* a miss goes to whichever brain is nearer on screen, so the mouse brain
       is still grabbable at 7.8 per cent of the width of the human one */
    let best = null, bestD = Infinity;
    const v = new THREE.Vector3();
    for (const b of BRAINS) {
      if (!b.meshes.length) continue;
      b.place.getWorldPosition(v); v.project(camera);
      const d = (v.x - ndc.x) * (v.x - ndc.x) + (v.y - ndc.y) * (v.y - ndc.y);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  const cv = renderer.domElement;
  cv.style.cursor = "grab";
  cv.addEventListener("pointerdown", function (ev) {
    if (!ready) return;
    dragging = pick(ev);
    if (!dragging) return;
    dragging.vel = 0;
    lastX = ev.clientX; lastY = ev.clientY;
    cv.setPointerCapture(ev.pointerId);
    cv.style.cursor = "grabbing";
    el.setAttribute("data-holding", dragging.key);
    ev.preventDefault();
  });
  cv.addEventListener("pointermove", function (ev) {
    if (!dragging) return;
    const dx = ev.clientX - lastX, dy = ev.clientY - lastY;
    lastX = ev.clientX; lastY = ev.clientY;
    dragging.pivot.rotation.y += dx * 0.008;
    /* pitch is clamped: past a right angle the brain is upside down and the
       reader has lost which way is dorsal */
    dragging.pivot.rotation.x = Math.max(-1.2, Math.min(1.2,
      dragging.pivot.rotation.x + dy * 0.008));
    dragging.vel = dx * 0.35;
    loop.once();
  });
  function endDrag(ev) {
    if (!dragging) return;
    dragging = null;
    cv.style.cursor = "grab";
    el.removeAttribute("data-holding");
    try { cv.releasePointerCapture(ev.pointerId); } catch (e) {}
  }
  cv.addEventListener("pointerup", endDrag);
  cv.addEventListener("pointercancel", endDrag);

  /* the keyboard gets the same control: tab to a brain, turn it with arrows */
  el.querySelectorAll("[data-turn]").forEach(function (btn) {
    const b = BRAINS[btn.dataset.turn === "mouse" ? 1 : 0];
    btn.addEventListener("keydown", function (ev) {
      const step = ev.shiftKey ? 0.35 : 0.14;
      if (ev.key === "ArrowLeft") b.pivot.rotation.y -= step;
      else if (ev.key === "ArrowRight") b.pivot.rotation.y += step;
      else if (ev.key === "ArrowUp") b.pivot.rotation.x = Math.max(-1.2, b.pivot.rotation.x - step);
      else if (ev.key === "ArrowDown") b.pivot.rotation.x = Math.min(1.2, b.pivot.rotation.x + step);
      else return;
      ev.preventDefault();
      loop.once();
    });
  });

  if (toggle) {
    toggle.addEventListener("click", function () {
      trueScale = !trueScale;
      toggle.setAttribute("aria-pressed", String(!trueScale));
      toggle.textContent = trueScale ? "Match their sizes" : "Back to true scale";
      layout();
    });
  }

  const ro = new ResizeObserver(function () {
    if (fitRenderer(renderer, camera, mount)) loop.once();
  });
  ro.observe(mount);

  /* ---- load --------------------------------------------------------------
     Nothing is fetched until the reader is near the panel. Four and a half
     megabytes of measured surface is not something to spend on a reader who
     never scrolls this far. */
  const start = whenNear(el, function () {
    const loader = new GLTFLoader();
    let pending = 4;
    const meta = {};

    function done() {
      if (--pending) return;
      ready = true;
      el.setAttribute("data-ready", "");
      if (status) status.remove();
      report(meta);
      layout();
      fitRenderer(renderer, camera, mount);
      loop.run();
      loop.once();
    }

    /* the two json sidecars carry the recorded bounding boxes, which are the
       only reason this panel can state a real ratio rather than a round one */
    fetch("meshes/human-brain.json").then(function (r) { return r.json(); })
      .then(function (j) { meta.human = j; done(); })
      .catch(function () { meta.human = null; done(); });
    fetch("meshes/mouse-brain.json").then(function (r) { return r.json(); })
      .then(function (j) { meta.mouse = j; done(); })
      .catch(function () { meta.mouse = null; done(); });

    function addShell(gltf, brain, opts) {
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const c = new THREE.Vector3(); box.getCenter(c);
      const src = [];
      gltf.scene.traverse(function (o) { if (o.isMesh) src.push(o); });
      for (const o of src) {
        if (opts.recentre) o.geometry.translate(-c.x, -c.y, -c.z);
        shellMaterials(o, opts);
        brain.pivot.add(o);
        brain.meshes.push(o);
      }
    }

    /* Nothing is recentred. Both GLBs were exported already centred on their
       own recorded centre, and moving either one afterwards would break
       something that depends on the exported frame: the cerebellum is placed
       in the cortex's coordinates, and the V1 landmark is a point in the
       mouse's. Recentring the cortex alone would slide the cerebellum out of
       the back of the head, and recentring the mouse would put the V1 marker
       somewhere V1 is not. */
    loader.load("meshes/human-brain.glb", function (gltf) {
      addShell(gltf, BRAINS[0], {
        color: HUMAN, emissive: HUMAN_EM, wire: HUMAN_WIRE,
        wireOpacity: 0.14, recentre: false,
      });
      /* the cerebellum is exported in the cortex's own frame, so it is added
         to the same pivot and must NOT be recentred on itself, or it lands in
         the middle of the cortex instead of under the back of it */
      loader.load("meshes/human-cerebellum.glb", function (cg) {
        addShell(cg, BRAINS[0], {
          color: "#8f56c8", emissive: "#5a2a94", wire: HUMAN_WIRE,
          wireOpacity: 0.1, recentre: false,
        });
        done();
      }, null, function () { done(); });
    }, null, function () {
      if (status) status.textContent = "The human surface did not load.";
      done();
    });

    loader.load("meshes/mouse-brain.glb", function (gltf) {
      addShell(gltf, BRAINS[1], {
        /* The mouse shell is glass, and the human's is not, on purpose. The V1
           landmark below is the Allen structure's own centroid, which is a
           point 0.196 units inside this surface, not a spot painted on it. An
           opaque mouse brain hides it completely, so the legend would promise
           a gold marker that is not on screen anywhere. */
        color: MOUSE, emissive: MOUSE_EM, wire: MOUSE_WIRE,
        wireOpacity: 0.07, recentre: false, opacity: 0.30,
        depthWrite: false, side: "front", emissiveIntensity: 0.14,
      });
      done();
    }, null, function () {
      if (status) status.textContent = "The mouse surface did not load.";
      done();
    });
  });

  /* ---- the readout -------------------------------------------------------
     Everything printed here is arithmetic on the two recorded boxes. If the
     meshes are ever re exported, these move with them. */
  function report(meta) {
    const h = meta.human, m = meta.mouse;
    if (!h || !m) return;
    const hs = h.rawBbox.size;                       /* millimetres */
    const ms = m.allenBboxUm.size.map(function (v) { return v / 1000; });
    const hL = Math.max.apply(null, hs), mL = Math.max.apply(null, ms);
    mouseScale = mL / hL;

    /* The V1 marker, at the landmark recorded in the mouse's own sidecar. That
       is the region this page's 38 cells were cut from. It is inside the
       surface, so it is drawn without a depth test and after the shell: the
       shell is visibly glass, which is what makes reading the marker through
       it correct rather than a marker floating in front of everything. */
    if (m.landmarks && m.landmarks.visp_right && BRAINS[1].meshes.length) {
      const p = m.landmarks.visp_right;
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 20, 14),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(V1), depthTest: false,
        })
      );
      dot.position.set(p[0], p[1], p[2]);
      dot.renderOrder = 3;
      BRAINS[1].pivot.add(dot);
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 20, 14),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(V1), transparent: true, opacity: 0.3,
          blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
        })
      );
      halo.position.copy(dot.position);
      halo.renderOrder = 2;
      BRAINS[1].pivot.add(halo);
    }

    const hv = hs[0] * hs[1] * hs[2], mv = ms[0] * ms[1] * ms[2];
    const row = function (k, v, d) {
      return '<div class="mviz-row"><span>' + k + "</span><b>" + v + "</b>" +
             (d ? '<em class="mviz-note">' + d + "</em>" : "") + "</div>";
    };
    /* the sidecars were written elsewhere and use em dashes, which this page's
       copy does not. Take the provenance, not the punctuation. */
    const say = function (s) { return String(s).replace(/\s*[—–]\s*/g, ", "); };
    if (facts) {
      facts.innerHTML =
        row("Human", fmt(hs[0], 0) + " × " + fmt(hs[1], 0) + " × " + fmt(hs[2], 0) + " mm",
            say(h.source) + ", " + fmt(h.exportedFaces) + " faces") +
        row("Mouse", fmt(ms[0], 1) + " × " + fmt(ms[1], 1) + " × " + fmt(ms[2], 1) + " mm",
            say(m.source) + ", " + fmt(m.exportedFaces) + " faces") +
        row("Longest axis", fmt(hL / mL, 1) + " times",
            fmt(hL, 0) + " mm against " + fmt(mL, 1) + " mm") +
        row("Bounding box volume", fmt(hv / mv) + " times",
            "the boxes, not the brains: a brain does not fill its box");
    }
  }

  return { el: el, loop: loop, start: start, scene: scene, camera: camera,
    brains: BRAINS, renderer: renderer, dispose: function () {
    loop.stop(); ro.disconnect();
    disposeTree(scene); renderer.dispose();
  } };
}
