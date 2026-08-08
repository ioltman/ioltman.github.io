import { divergingColor, LAND_COLOR } from "./colormap.js";

// Rotatable 3D Earth textured with the simulated sea-surface height field.
// Texture is an equirectangular canvas: column 0..W = longitude 0..360,
// row 0..H = latitude +90..-90 (image convention, north at top). Data only
// covers the simulated latitude band (+-75 here); the rest is padded with
// a neutral "land" gray, consistent with the model treating high latitudes
// as a closed boundary.
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

    // Unlit material: this sphere is a data display, not a lit object --
    // any specular/diffuse shading would distort the colormap's meaning.
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;

    const geo = new THREE.SphereGeometry(5, 96, 64);
    const mat = new THREE.MeshBasicMaterial({ map: this.texture });
    this.sphere = new THREE.Mesh(geo, mat);
    this.scene.add(this.sphere);

    // thin wireframe graticule for orientation
    const wire = new THREE.Mesh(
      new THREE.SphereGeometry(5.01, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.06 })
    );
    this.scene.add(wire);

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
  }

  setMarker(latDeg, lonDeg) {
    const r = 5.05;
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
