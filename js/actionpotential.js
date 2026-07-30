/* One spike, along a real path, across a real synapse.
 *
 * WHAT IS REAL HERE. Two reconstructed cells from the same MICrONS volume,
 * both re extracted in a frame centred on the synapse where they touch, so the
 * origin of this scene is a place in a mouse brain rather than a convenient
 * zero. The route the spark takes is not a line drawn between them: it is the
 * cells' own skeletons, resampled to 200 evenly spaced points each, and the
 * lengths printed under the stage are measured along those skeletons.
 *
 *   tendril      axon distal tip to the synapse      1,379,331 nm
 *   aura_apical  the synapse down to the soma          188,255 nm
 *   aura_axon    the soma out to the axon tip          718,123 nm
 *
 * WHAT IS NOT REAL, SAID PLAINLY. The timing is not physics. There is no
 * membrane model here, no millivolts, no channel kinetics and no refractory
 * period. The spark crosses those 2.29 mm in four seconds because that is
 * legible, and a real spike would cross them in a few milliseconds. What the
 * animation is honest about is the route and the distances, which is the part
 * a picture can carry and a number cannot.
 *
 * The trail shader, the phase constants and the slot pool are carried across
 * from Inner Cosmos unchanged, including the pool: pressing the button while a
 * spike is already running fires a second one alongside it rather than
 * restarting the first.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  REDUCED, makeRenderer, fitRenderer, makeLoop, whenNear,
  studioLights, disposeTree, fmt,
} from "./holo3d.js";

const PRE = "#ffc24a";          /* the presynaptic axon, in the render's gold */
const POST = "#6fa8ff";         /* the postsynaptic cell, cooler and deeper */
const CONTACT = "#9ce8c0";

const TRAIL_LEN = 28;
const CYCLE_LEN = 4.0;
const AXON_END = 0.30, CROSS_END = 0.38, SOMA_END = 0.65, PYRA_END = 0.95;
const TRAIL_SPAN_U = 0.10;
const MAX_AP_CONCURRENT = 8;

const TRAIL_VERT = `
  attribute float aIdx;
  uniform float uHeadSize;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    float age = aIdx / ${TRAIL_LEN.toFixed(1)};
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vAlpha = pow(1.0 - age, 1.6) * uOpacity;
    gl_PointSize = uHeadSize * (0.35 + 0.65 * pow(1.0 - age, 1.2)) * (1.0 / max(0.05, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;
const TRAIL_FRAG = `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c);
    if (r > 0.5) discard;
    float core = smoothstep(0.5, 0.0, r);
    gl_FragColor = vec4(uColor, core * core * vAlpha);
  }
`;

/* A radial gradient on a canvas, so the glow has genuinely soft edges. A
   sphere with an additive material shows its own silhouette and reads as a
   ball rather than a light. */
function bloomSprite(rgb, scale) {
  const size = 256, cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d"), c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  const s = rgb[0] + "," + rgb[1] + "," + rgb[2];
  g.addColorStop(0.00, "rgba(255,255,255,1)");
  g.addColorStop(0.06, "rgba(255,255,255,0.95)");
  g.addColorStop(0.18, "rgba(" + s + ",0.7)");
  g.addColorStop(0.42, "rgba(" + s + ",0.22)");
  g.addColorStop(0.75, "rgba(" + s + ",0.05)");
  g.addColorStop(1.00, "rgba(" + s + ",0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({
    map: tex, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(scale, scale, 1);
  return { sprite: sprite, mat: mat };
}

function makeTrail(color, headSize) {
  const positions = new Float32Array(TRAIL_LEN * 3);
  const idx = new Float32Array(TRAIL_LEN);
  for (let i = 0; i < TRAIL_LEN; i++) idx[i] = i;
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("aIdx", new THREE.BufferAttribute(idx, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uHeadSize: { value: headSize }, uOpacity: { value: 0 },
      uColor: { value: new THREE.Color(color) },
    },
    vertexShader: TRAIL_VERT, fragmentShader: TRAIL_FRAG,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const points = new THREE.Points(geom, mat);
  points.frustumCulled = false;   /* positions change per frame, box is stale */
  return { points: points, mat: mat, positions: positions, geom: geom };
}

export function mountActionPotential(el) {
  const mount = el.querySelector("[data-mount]");
  const status = el.querySelector("[data-status]");
  const facts = el.querySelector("[data-facts]");
  const fire = el.querySelector("[data-fire]");
  if (!mount) return;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.01, 100);
  camera.position.set(0.35, 0.12, 2.15);
  const renderer = makeRenderer(mount);
  studioLights(scene, POST);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.enablePan = false; controls.minDistance = 0.6; controls.maxDistance = 7;
  controls.target.set(0.1, -0.15, 0);
  renderer.domElement.style.cursor = "grab";

  /* the contact itself, always lit, so the origin of the scene is visible */
  const contact = bloomSprite([156, 232, 192], 0.07);
  contact.mat.opacity = 0.85;
  scene.add(contact.sprite);

  let tendrilPath = null, apicalPath = null, axonPath = null;

  const slots = [];
  for (let i = 0; i < MAX_AP_CONCURRENT; i++) {
    const s = {
      pre: bloomSprite([255, 194, 74], 0.115),
      post: bloomSprite([111, 168, 255], 0.115),
      tPre: makeTrail(PRE, 130),
      tPost: makeTrail(POST, 130),
      firedAt: -1,
    };
    s.pre.sprite.visible = false; s.post.sprite.visible = false;
    scene.add(s.pre.sprite); scene.add(s.post.sprite);
    scene.add(s.tPre.points); scene.add(s.tPost.points);
    slots.push(s);
  }

  function samplePath(path, u, out) {
    const n = path.length;
    const f = Math.max(0, Math.min(n - 1, u * (n - 1)));
    const i = Math.floor(f), t = f - i;
    if (i >= n - 1) out.copy(path[n - 1]);
    else out.copy(path[i]).lerp(path[i + 1], t);
    return out;
  }

  /* The tail follows the path's own curvature rather than trailing straight
     behind the head, which is the whole reason it reads as travelling along
     an axon instead of flying through the tissue. */
  const tmp = new THREE.Vector3();
  function stampTrail(trail, path, headU, stepU) {
    if (!path) return;
    for (let i = 0; i < TRAIL_LEN; i++) {
      const u = headU - i * stepU;
      if (u <= 0) tmp.copy(path[0]);
      else {
        const f = u * (path.length - 1), j = Math.floor(f), tt = f - j;
        if (j >= path.length - 1) tmp.copy(path[path.length - 1]);
        else tmp.copy(path[j]).lerp(path[j + 1], tt);
      }
      trail.positions[i * 3] = tmp.x;
      trail.positions[i * 3 + 1] = tmp.y;
      trail.positions[i * 3 + 2] = tmp.z;
    }
    trail.geom.getAttribute("position").needsUpdate = true;
  }

  function rest(s) {
    s.pre.mat.opacity = 0; s.post.mat.opacity = 0;
    s.pre.sprite.visible = false; s.post.sprite.visible = false;
    s.tPre.mat.uniforms.uOpacity.value = 0;
    s.tPost.mat.uniforms.uOpacity.value = 0;
  }

  let clock = 0, nextAuto = 0.6, autofire = !REDUCED;
  const trailStep = TRAIL_SPAN_U / (TRAIL_LEN - 1);

  function fireOne() {
    for (const s of slots) if (s.firedAt < 0) { s.firedAt = clock; return true; }
    return false;   /* all eight busy: a further press is dropped on purpose */
  }

  const loop = makeLoop(el, function (dt) {
    clock += dt;
    controls.update();

    /* the ambient repeat. It only runs while the panel is on screen and the
       tab is in front, and never under a motion preference. */
    if (autofire && clock >= nextAuto) { fireOne(); nextAuto = clock + 5.2; }

    for (const s of slots) {
      if (s.firedAt < 0) { rest(s); continue; }
      const age = clock - s.firedAt;
      if (age >= CYCLE_LEN) { s.firedAt = -1; rest(s); continue; }
      const phase = age / CYCLE_LEN;

      if (phase < AXON_END) {
        const u = phase / AXON_END;
        if (tendrilPath) samplePath(tendrilPath, u, s.pre.sprite.position);
        s.pre.mat.opacity = 0.95; s.post.mat.opacity = 0;
        s.pre.sprite.visible = true; s.post.sprite.visible = false;
        stampTrail(s.tPre, tendrilPath, u, trailStep);
        s.tPre.mat.uniforms.uOpacity.value = 0.85;
        s.tPost.mat.uniforms.uOpacity.value = 0;
      } else if (phase < CROSS_END) {
        /* the crossing. Both sides are lit and the spark is at the origin,
           because the origin IS the synapse in this frame. */
        const u = (phase - AXON_END) / (CROSS_END - AXON_END);
        s.pre.sprite.position.set(0, 0, 0);
        s.post.sprite.position.set(0, 0, 0);
        s.pre.mat.opacity = 0.95 * (1 - u);
        s.post.mat.opacity = 0.95 * u;
        s.pre.sprite.visible = true; s.post.sprite.visible = true;
        stampTrail(s.tPre, tendrilPath, 1.0, trailStep);
        s.tPre.mat.uniforms.uOpacity.value = 0.85 * (1 - u);
        s.tPost.mat.uniforms.uOpacity.value = 0;
      } else if (phase < SOMA_END) {
        const u = (phase - CROSS_END) / (SOMA_END - CROSS_END);
        if (apicalPath) samplePath(apicalPath, u, s.post.sprite.position);
        s.pre.mat.opacity = 0; s.post.mat.opacity = 0.95;
        s.pre.sprite.visible = false; s.post.sprite.visible = true;
        stampTrail(s.tPost, apicalPath, u, trailStep);
        s.tPre.mat.uniforms.uOpacity.value = 0;
        s.tPost.mat.uniforms.uOpacity.value = 0.85;
      } else if (phase < PYRA_END) {
        const u = (phase - SOMA_END) / (PYRA_END - SOMA_END);
        if (axonPath) samplePath(axonPath, u, s.post.sprite.position);
        s.pre.mat.opacity = 0; s.post.mat.opacity = 0.95;
        s.pre.sprite.visible = false; s.post.sprite.visible = true;
        stampTrail(s.tPost, axonPath, u, trailStep);
        s.tPre.mat.uniforms.uOpacity.value = 0;
        s.tPost.mat.uniforms.uOpacity.value = 0.85;
      } else {
        rest(s);
      }
    }
    renderer.render(scene, camera);
  });

  if (fire) {
    fire.addEventListener("click", function () {
      /* a press takes the panel off its own timer: from here the reader is
         driving, and a spike arriving on its own would read as their press */
      autofire = false;
      fireOne();
      loop.once();
    });
  }

  const ro = new ResizeObserver(function () {
    if (fitRenderer(renderer, camera, mount)) loop.once();
  });
  ro.observe(mount);

  const start = whenNear(el, function () {
    const loader = new GLTFLoader();
    let pending = 3;
    function done() {
      if (--pending) return;
      if (status) status.remove();
      fitRenderer(renderer, camera, mount);
      loop.run(); loop.once();
    }

    function addCell(url, colour, emissive, opacity) {
      loader.load(url, function (gltf) {
        const src = [];
        gltf.scene.traverse(function (o) { if (o.isMesh) src.push(o); });
        for (const o of src) {
          /* NOT recentred. Both meshes were exported in one frame whose
             origin is the synapse, and moving either would break the only
             thing that makes this a synapse rather than two cells near
             each other. */
          o.material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(colour),
            emissive: new THREE.Color(emissive), emissiveIntensity: 0.3,
            roughness: 0.72, metalness: 0.0,
            transparent: true, opacity: opacity, side: THREE.DoubleSide,
          });
          scene.add(o);
        }
        done();
      }, null, function () { done(); });
    }
    addCell("meshes/synapse-tendril.glb", PRE, "#a86a12", 0.78);
    addCell("meshes/synapse-aura.glb", POST, "#1c4a94", 0.82);

    fetch("meshes/synapse-skeletons.json")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        const v = function (pts) {
          return pts.map(function (p) { return new THREE.Vector3(p[0], p[1], p[2]); });
        };
        tendrilPath = v(d.tendril.points);
        apicalPath = v(d.aura_apical.points);
        axonPath = v(d.aura_axon.points);
        report(d);
        done();
      })
      .catch(function () { done(); });
  });

  function report(d) {
    if (!facts) return;
    const row = function (k, val, note) {
      return '<div class="mviz-row"><span>' + k + "</span><b>" + val + "</b>" +
             (note ? '<em class="mviz-note">' + note + "</em>" : "") + "</div>";
    };
    const a = d.tendril.lengthNm, b = d.aura_apical.lengthNm, c = d.aura_axon.lengthNm;
    facts.innerHTML =
      row("Presynaptic axon", fmt(a / 1000, 0) + " µm",
        "segment " + d.meta.tendrilSegId + ", axon tip to the contact") +
      row("Postsynaptic dendrite", fmt(b / 1000, 0) + " µm",
        "segment " + d.meta.auraSegId + ", contact down to the soma") +
      row("Postsynaptic axon", fmt(c / 1000, 0) + " µm",
        "soma out to its own axon tip") +
      row("Measured along the skeletons", fmt((a + b + c) / 1000, 0) + " µm",
        "each path resampled to " + d.meta.nSamples + " evenly spaced points");
  }

  return { el: el, loop: loop, start: start, fire: fireOne, scene: scene,
    camera: camera, renderer: renderer, slots: slots,
    paths: function () { return { tendrilPath: tendrilPath, apicalPath: apicalPath, axonPath: axonPath }; },
    dispose: function () {
      loop.stop(); ro.disconnect(); controls.dispose();
      disposeTree(scene); renderer.dispose();
    } };
}
