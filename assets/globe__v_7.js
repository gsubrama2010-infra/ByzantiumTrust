// Real 3D Earth for the hero: NASA Blue Marble on a sphere, spinning on a tilted axis
// under a fixed sun, with satellites whose orbits pass properly behind the planet.
// If WebGL or the texture is unavailable, the page keeps showing the static photo.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js";

const planetEl = document.querySelector(".planet");
const canvas = document.querySelector(".globe-gl");
const hero = document.querySelector(".hero");

let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: devicePixelRatio < 2, powerPreference: "high-performance" });
} catch { /* no WebGL: keep the photo */ }

if (renderer) init();

function init() {
  const PR = Math.min(devicePixelRatio || 1, innerWidth < 720 ? 2 : 1.75);
  renderer.setPixelRatio(PR);
  const scene = new THREE.Scene();
  // This distance puts the sphere's radius at ~42% of the canvas, matching the photo it replaces
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.z = 4.55;

  // Lit from almost directly behind the viewer, like the Blue Marble photograph: the whole
  // face is in daylight and only the edges fall away into shadow
  const SUN = new THREE.Vector3(-0.25, 0.2, 1).normalize();
  const sun = new THREE.DirectionalLight(0xffffff, 3.1);
  sun.position.copy(SUN);
  scene.add(sun, new THREE.AmbientLight(0x8fb0ea, 0.6));

  // Earth's 23.4° axial tilt, leaned slightly toward the viewer so the northern hemisphere shows
  const axis = new THREE.Group();
  axis.rotation.set(0.32, 0, -0.41);
  scene.add(axis);
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96),
    new THREE.MeshPhongMaterial({ specular: 0x1c2a3c, shininess: 14 }));
  axis.add(earth);

  // Clouds: a slightly larger sphere, drifting a little faster than the surface
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.006, 128, 96), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uMap: { value: null }, uSun: { value: SUN } },
    vertexShader: `
      varying vec2 vUv; varying vec3 vW;
      void main() {
        vUv = uv;
        vW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D uMap; uniform vec3 uSun; varying vec2 vUv; varying vec3 vW;
      void main() {
        float c = texture2D(uMap, vUv).g;
        float a = clamp(c * 1.12, 0.0, 1.0);
        float light = 0.24 + 0.92 * max(dot(normalize(vW), uSun), 0.0);
        gl_FragColor = vec4(vec3(light), a);
      }`
  }));
  axis.add(clouds);

  // Atmosphere: a haze on the limb and a glow beyond it, both brighter on the sunlit side
  function atmosphere(side, scale, color, strength, power, halo) {
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(scale, 64, 48), new THREE.ShaderMaterial({
      side, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(color) }, uSun: { value: SUN }, uStr: { value: strength }, uPow: { value: power } },
      vertexShader: `
        varying vec3 vN; varying vec3 vW; varying vec3 vP;
        void main() {
          vN = normalize(normalMatrix * normal);
          vW = normalize(mat3(modelMatrix) * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vP = mv.xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform vec3 uSun; uniform float uStr; uniform float uPow;
        varying vec3 vN; varying vec3 vW; varying vec3 vP;
        void main() {
          float d = dot(normalize(vN), normalize(-vP));
          float k = ${halo ? `clamp(-d / ${Math.sqrt(1 - 1 / (scale * scale)).toFixed(3)}, 0.0, 1.0)` : "1.0 - max(d, 0.0)"};
          float lit = 0.25 + 0.75 * smoothstep(-0.35, 0.6, dot(normalize(vW), uSun));
          gl_FragColor = vec4(uColor, pow(k, uPow) * uStr * lit);
        }`
    })));
  }
  atmosphere(THREE.FrontSide, 1.008, 0x86b6ff, 0.75, 2.3, false); // the photo's blue haze toward the edges
  atmosphere(THREE.BackSide, 1.05, 0x6fa4ff, 0.28, 3.5, true);

  // Soft round glowing points, used for orbit paths, comet tails and satellites
  const dotMaterial = (color, size, opacity) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(color) }, uSize: { value: size * PR }, uOp: { value: opacity } },
    vertexShader: `
      attribute float aA; uniform float uSize; varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (0.3 + 0.7 * aA) * (4.55 / -mv.z);
        vA = aA;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uOp; varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        gl_FragColor = vec4(uColor, smoothstep(0.5, 0.05, d) * vA * uOp);
      }`
  });
  const points = (pos, alpha, material) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aA", new THREE.Float32BufferAttribute(alpha, 1));
    return new THREE.Points(g, material);
  };
  // n points along a circle of radius r, starting at angle `from` and running back `span` radians
  const arc = (r, n, from, span) => {
    const pos = [];
    for (let i = 0; i < n; i++) { const a = from - span * i / (n - 1); pos.push(r * Math.cos(a), r * Math.sin(a), 0); }
    return pos;
  };

  const orbits = [];
  function orbit({ r, tiltX, tiltZ, period, dots, sats, pathOpacity }) {
    const outer = new THREE.Group(); outer.rotation.z = tiltZ;
    const plane = new THREE.Group(); plane.rotation.x = tiltX;
    outer.add(plane); scene.add(outer);
    plane.add(points(arc(r, dots, 0, Math.PI * 2), new Array(dots).fill(1), dotMaterial(0xa9c4e3, 2.2, pathOpacity)));
    const spin = new THREE.Group(); plane.add(spin);
    const tailN = 70, tailA = Array.from({ length: tailN }, (_, i) => Math.pow(1 - i / tailN, 1.6));
    const dir = Math.sign(period);
    for (let k = 0; k < sats; k++) {
      const off = k * Math.PI * 2 / sats, head = [r * Math.cos(off), r * Math.sin(off), 0];
      spin.add(points(arc(r, tailN, off, 1.1 * dir), tailA, dotMaterial(0xcfe0ff, 5, 0.75)));
      spin.add(points(head, [1], dotMaterial(0xffffff, 14, 1)));
      spin.add(points(head, [1], dotMaterial(0x6e9aca, 42, 0.35)));
    }
    orbits.push({ spin, speed: Math.PI * 2 / period });
  }
  orbit({ r: 1.36, tiltX: -1.33, tiltZ: 0.31, period: 18, dots: 360, sats: 1, pathOpacity: 0.22 });
  orbit({ r: 1.6, tiltX: -1.2, tiltZ: -0.16, period: -40, dots: 150, sats: 2, pathOpacity: 0.16 });

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w && h) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  }
  resize();
  addEventListener("resize", resize);

  const EARTH_PERIOD = 90; // seconds per full turn
  let last = 0, running = false, visible = true;
  function frame(now) {
    if (!visible || document.hidden) { running = false; return; }
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    earth.rotation.y += dt * Math.PI * 2 / EARTH_PERIOD;
    clouds.rotation.y = earth.rotation.y * 1.06;
    for (const o of orbits) o.spin.rotation.z += dt * o.speed;
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  const start = () => {
    if (!running && visible && !document.hidden) { running = true; last = performance.now(); requestAnimationFrame(frame); }
  };

  // NASA Blue Marble surface + its 2002 cloud layer (the one in the original photo); the 8K surface only where the screen and GPU can use it
  const big = innerWidth >= 720 && renderer.capabilities.maxTextureSize >= 8192;
  const loader = new THREE.TextureLoader();
  Promise.all([
    loader.loadAsync(big ? "assets/earth-map-8k.jpg" : "assets/earth-map-4k.jpg"),
    loader.loadAsync("assets/earth-clouds-4k.jpg")
  ]).then(([surface, cloudTex]) => {
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    surface.colorSpace = THREE.SRGBColorSpace;
    surface.anisotropy = cloudTex.anisotropy = aniso;
    earth.material.map = surface;
    earth.material.needsUpdate = true;
    clouds.material.uniforms.uMap.value = cloudTex;
    renderer.render(scene, camera);
    planetEl.classList.add("gl-ready");
    new IntersectionObserver(en => { visible = en[0].isIntersecting; start(); }).observe(hero);
    document.addEventListener("visibilitychange", start);
    start();
  });
}
