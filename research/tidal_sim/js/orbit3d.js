// The "what's being simulated" panel: Sun at the origin, Earth on its true
// (partial -- only the simulated span, so a short arc) heliocentric path,
// Moon(s) orbiting Earth. Distances are NOT to true relative scale (the
// real Earth-Moon distance is ~1/389 of an AU, which would put the Moon
// invisibly close to Earth on this canvas) -- angular motion is exact,
// taken directly from the same N-body integration as the ocean forcing;
// only the two orbit radii are compressed for visibility, and this is
// labeled on screen rather than left implicit.
const R_EARTH_ORBIT = 9;
const MOON_RADII = [2.0, 3.1, 4.2]; // visual radius per moon, if more than one

const MOON_COLORS = [0xdddddd, 0xffa552, 0x8ecae6];

export class OrbitView {
  constructor(container, meta) {
    this.container = container;
    this.meta = meta;
    const THREE = window.THREE;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x03050c);

    const w = container.clientWidth, h = container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
    this.camera.position.set(0, 9, 17);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.35));

    // Sun -- a solid sphere plus two larger, near-transparent concentric
    // spheres for a soft glow (NOT a Sprite: a billboard sprite renders as
    // a flat square unless given a radial-alpha texture, which reads as
    // "the Sun is a cube" at a glance -- concentric spheres keep the
    // silhouette round from every camera angle).
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffd54a });
    this.sun = new THREE.Mesh(new THREE.SphereGeometry(0.9, 32, 24), sunMat);
    this.scene.add(this.sun);
    const sunLight = new THREE.PointLight(0xffffff, 2.2, 0, 0);
    this.scene.add(sunLight);
    [[1.25, 0.16], [1.7, 0.07]].forEach(([r, opacity]) => {
      const glowShell = new THREE.Mesh(
        new THREE.SphereGeometry(r, 24, 16),
        new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity, depthWrite: false })
      );
      this.scene.add(glowShell);
    });

    // Earth
    this.earth = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 24, 18),
      new THREE.MeshPhongMaterial({ color: 0x3a86ff })
    );
    this.scene.add(this.earth);

    // Earth's full annual orbit, shown faint and complete for context
    const fullOrbit = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(circlePoints(R_EARTH_ORBIT, 128)),
      new THREE.LineBasicMaterial({ color: 0x3a86ff, transparent: true, opacity: 0.15 })
    );
    this.scene.add(fullOrbit);

    // Earth's actual traced path over the simulated span (grows as it plays)
    this.earthTrail = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x8ecae6, linewidth: 2 })
    );
    this.scene.add(this.earthTrail);

    this.moons = {};
    this.moonTrails = {};
    this.moonFullOrbits = {};
    Object.keys(meta.moons).forEach((name, k) => {
      const massRel = meta.moons[name].mass_rel_to_moon;
      const radius = 0.16 * Math.cbrt(Math.max(massRel, 0.1));
      const color = MOON_COLORS[k % MOON_COLORS.length];
      const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12),
        new THREE.MeshPhongMaterial({ color }));
      this.scene.add(m);
      this.moons[name] = m;

      const visR = MOON_RADII[k % MOON_RADII.length];
      const orbit = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 })
      );
      this.scene.add(orbit);
      this.moonTrails[name] = { line: orbit, visR };
    });

    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(container);
    this._animate = this._animate.bind(this);
    requestAnimationFrame(this._animate);
  }

  setFrame(frameIndex) {
    const THREE = window.THREE;
    const ed = this.meta.earth_dir[frameIndex];
    const earthPos = new THREE.Vector3(ed[0], ed[2], ed[1]).multiplyScalar(R_EARTH_ORBIT);
    this.earth.position.copy(earthPos);

    const trailPts = [];
    for (let i = 0; i <= frameIndex; i++) {
      const d = this.meta.earth_dir[i];
      trailPts.push(new THREE.Vector3(d[0], d[2], d[1]).multiplyScalar(R_EARTH_ORBIT));
    }
    this.earthTrail.geometry.setFromPoints(trailPts);

    for (const name in this.moons) {
      const { visR } = this.moonTrails[name];
      const dir = this.meta.moons[name].dir[frameIndex];
      const pos = earthPos.clone().add(
        new THREE.Vector3(dir[0], dir[2], dir[1]).multiplyScalar(visR)
      );
      this.moons[name].position.copy(pos);

      const pts = [];
      const start = Math.max(0, frameIndex - 60);
      for (let i = start; i <= frameIndex; i++) {
        const d = this.meta.moons[name].dir[i];
        pts.push(earthPos.clone().add(new THREE.Vector3(d[0], d[2], d[1]).multiplyScalar(visR)));
      }
      this.moonTrails[name].line.geometry.setFromPoints(pts);
    }
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _animate() {
    requestAnimationFrame(this._animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

function circlePoints(r, n) {
  const THREE = window.THREE;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
  }
  return pts;
}
