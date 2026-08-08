import { divergingColor, LAND_COLOR } from "./colormap.js";

// Rotatable 3D Earth textured with the simulated sea-surface height field.
// Texture is an equirectangular canvas: column 0..W = longitude 0..360,
// row 0..H = latitude +90..-90 (image convention, north at top). Data only
// covers the simulated latitude band (+-75 here); the rest is padded with
// a neutral "land" gray, consistent with the model treating high latitudes
// as a closed boundary.
//
// The ocean surface is real displaced geometry, not just a flat colormap:
// every vertex is pushed outward along its own radial direction by an
// amount proportional to eta at that point, then normals are recomputed so
// lighting actually reveals the bumps. The real amplitude (centimeters to
// tens of meters, depending on scenario) is invisible against a
// 6371km-radius sphere, so the displacement is an explicit artistic
// exaggeration -- MAX_BUMP is what the frame's largest |eta| maps to,
// scaled the same way per scenario as the color (both driven by the
// scenario's eta_min/eta_max), not to real physical scale.
const SPHERE_RADIUS = 5;
const MAX_BUMP = 0.42; // world units at the scenario's max |eta|

export class EarthView {
  constructor(container, meta, onPick) {
    this.container = container;
    this.meta = meta;
    this.onPick = onPick;

    const nlat = meta.n_lat, nlon = meta.n_lon;
    const dlat = meta.lat_deg[1] - meta.lat_deg[0];
    const padRows = Math.max(0, Math.round((90 - meta.lat_deg[nlat - 1] - dlat / 2) / dlat));
    this.padRows = padRows;
    this.texH = nlat + 2 * padRows;
    this.texW = nlon;

    this.canvas = document.createElement("canvas");
    this.canvas.width = this.texW;
    this.canvas.height = this.texH;
    this.ctx = this.canvas.getContext("2d");
    this.imgData = this.ctx.createImageData(this.texW, this.texH);
    this._paintLandBase();

    const THREE = window.THREE;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x03050c);

    const w = container.clientWidth, h = container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
    this.camera.position.set(0, 0, 14);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    // roughness:1/metalness:0 gives near-Lambertian shading (no specular
    // hotspot) -- enough to read the bumps via lighting without the washed
    // -out glare a shinier material produced in an earlier version.
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const dl = new THREE.DirectionalLight(0xffffff, 0.85);
    dl.position.set(6, 4, 6);
    this.scene.add(dl);
    const dl2 = new THREE.DirectionalLight(0xffffff, 0.25);
    dl2.position.set(-5, -2, -4);
    this.scene.add(dl2);

    const geo = new THREE.SphereGeometry(SPHERE_RADIUS, 128, 80);
    const mat = new THREE.MeshStandardMaterial({ map: this.texture, roughness: 1, metalness: 0 });
    this.sphere = new THREE.Mesh(geo, mat);
    this.scene.add(this.sphere);
    this._prepareDisplacement(geo);

    this.marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x39ff14 })
    );
    this.marker.visible = false;
    this.scene.add(this.marker);

    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 7;
    this.controls.maxDistance = 30;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.renderer.domElement.addEventListener("click", (e) => this._handleClick(e));

    // ResizeObserver catches container-size changes that a bare window
    // 'resize' listener can miss -- e.g. devtools viewport emulation,
    // which changes layout without always dispatching a resize event.
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(container);
    this._animate = this._animate.bind(this);
    requestAnimationFrame(this._animate);
  }

  _paintLandBase() {
    const data = this.imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = LAND_COLOR[0]; data[i + 1] = LAND_COLOR[1]; data[i + 2] = LAND_COLOR[2]; data[i + 3] = 255;
    }
  }

  // For every geometry vertex, precompute (once) its base outward unit
  // normal and which data cell it samples -- turns per-frame displacement
  // into a flat array lookup instead of repeated trig/search.
  _prepareDisplacement(geo) {
    const { lat_deg, lon_deg, n_lat, n_lon, H } = this.meta;
    const dlat = lat_deg[1] - lat_deg[0];
    const dlon = lon_deg[1] - lon_deg[0];
    const latLo = lat_deg[0] - dlat / 2, latHi = lat_deg[n_lat - 1] + dlat / 2;

    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const n = pos.count;
    this._basePos = new Float32Array(pos.array); // pristine sphere, radius SPHERE_RADIUS
    this._baseNormal = new Float32Array(n * 3);
    this._cellIndex = new Int32Array(n);
    this._isLand = new Uint8Array(n);

    for (let i = 0; i < n; i++) {
      const bx = this._basePos[i * 3], by = this._basePos[i * 3 + 1], bz = this._basePos[i * 3 + 2];
      const r = Math.hypot(bx, by, bz) || 1;
      this._baseNormal[i * 3] = bx / r;
      this._baseNormal[i * 3 + 1] = by / r;
      this._baseNormal[i * 3 + 2] = bz / r;

      const lonDeg = uv.getX(i) * 360;
      const latDeg = -90 + uv.getY(i) * 180; // matches the pick-conversion convention

      if (latDeg < latLo || latDeg > latHi) {
        this._isLand[i] = 1;
        continue;
      }
      const row = Math.min(n_lat - 1, Math.max(0, Math.round((latDeg - lat_deg[0]) / dlat)));
      const col = ((Math.round((((lonDeg % 360) + 360) % 360) / dlon) % n_lon) + n_lon) % n_lon;
      this._cellIndex[i] = row * n_lon + col;
      this._isLand[i] = H[row][col] <= 0 ? 1 : 0;
    }
  }

  setFrame(etaFrame) {
    const { n_lat, n_lon, H } = this.meta;
    const vmax = Math.max(Math.abs(this.meta.eta_min), Math.abs(this.meta.eta_max)) || 1e-6;
    const data = this.imgData.data;
    for (let r = 0; r < n_lat; r++) {
      const texRow = this.padRows + (n_lat - 1 - r);   // data row r (south->north) -> image row (north on top)
      const rowOff = texRow * this.texW * 4;
      const dataRowOff = r * n_lon;
      for (let c = 0; c < n_lon; c++) {
        const px = (rowOff + c * 4);
        if (H[r][c] <= 0) {
          data[px] = LAND_COLOR[0]; data[px + 1] = LAND_COLOR[1]; data[px + 2] = LAND_COLOR[2];
        } else {
          const eta = etaFrame[dataRowOff + c];
          const t = (eta / vmax + 1) / 2;
          const [cr, cg, cb] = divergingColor(t);
          data[px] = cr; data[px + 1] = cg; data[px + 2] = cb;
        }
        data[px + 3] = 255;
      }
    }
    this.ctx.putImageData(this.imgData, 0, 0);
    this.texture.needsUpdate = true;

    // Real surface displacement: push each ocean vertex outward along its
    // own radial direction by eta/vmax * MAX_BUMP, then recompute normals
    // so the lighting set up in the constructor actually reveals the bumps
    // (displacing position alone, with stale normals, would look flat).
    const posAttr = this.sphere.geometry.attributes.position;
    const n = posAttr.count;
    for (let i = 0; i < n; i++) {
      let bump = 0;
      if (!this._isLand[i]) {
        bump = (etaFrame[this._cellIndex[i]] / vmax) * MAX_BUMP;
      }
      const radius = SPHERE_RADIUS + bump;
      posAttr.setXYZ(
        i,
        this._baseNormal[i * 3] * radius,
        this._baseNormal[i * 3 + 1] * radius,
        this._baseNormal[i * 3 + 2] * radius,
      );
    }
    posAttr.needsUpdate = true;
    this.sphere.geometry.computeVertexNormals();
  }

  setMarker(latDeg, lonDeg) {
    const r = SPHERE_RADIUS + MAX_BUMP + 0.12; // always clear of the tallest possible bump
    const phi = THREE_deg2rad(90 - latDeg);
    const theta = THREE_deg2rad(lonDeg);
    const x = -r * Math.sin(phi) * Math.cos(theta);
    const z = r * Math.sin(phi) * Math.sin(theta);
    const y = r * Math.cos(phi);
    this.marker.position.set(x, y, z);
    this.marker.visible = true;
  }

  _handleClick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.sphere);
    if (hits.length === 0 || !hits[0].uv) return;
    const uv = hits[0].uv;
    const lonDeg = uv.x * 360;
    // three.js SphereGeometry stores uv.y = 1 - v, and v=0 is theta=0 (the
    // +Y pole, "top"), so uv.y=1 is the top of the sphere. We painted row 0
    // of the canvas (image top) as the north pole, and CanvasTexture's
    // default flipY makes that align with the mesh's geometric top -- so
    // uv.y=1 -> +90 deg, uv.y=0 -> -90 deg.
    const latDeg = -90 + uv.y * 180;
    if (this.onPick) this.onPick(latDeg, lonDeg);
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

function THREE_deg2rad(d) { return (d * Math.PI) / 180; }
