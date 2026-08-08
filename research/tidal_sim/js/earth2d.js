import { divergingColor, LAND_COLOR } from "./colormap.js";

// Flat equirectangular map -- the default view. Plain 2D canvas, no WebGL,
// so it's cheap to build eagerly for every scenario (the 3D globe is built
// lazily only when the user asks for it, see app.js).
export class Earth2DView {
  constructor(container, meta, onPick) {
    this.container = container;
    this.meta = meta;
    this.onPick = onPick;

    // low-res source buffer (one pixel per grid cell), scaled up on display
    this.src = document.createElement("canvas");
    this.src.width = meta.n_lon;
    this.src.height = meta.n_lat;
    this.srcCtx = this.src.getContext("2d");
    this.imgData = this.srcCtx.createImageData(meta.n_lon, meta.n_lat);

    this.canvas = document.createElement("canvas");
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.imageRendering = "pixelated";
    this.canvas.style.display = "block";
    this.canvas.style.borderRadius = "6px";
    this.ctx = this.canvas.getContext("2d");
    container.appendChild(this.canvas);

    this.markerLat = null;
    this.markerLon = null;

    this.canvas.addEventListener("click", (e) => this._handleClick(e));
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(container);
    this.resize();
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this._redraw();
  }

  setFrame(etaFrame) {
    this._lastFrame = etaFrame;
    const { n_lat, n_lon, H } = this.meta;
    const vmax = Math.max(Math.abs(this.meta.eta_min), Math.abs(this.meta.eta_max)) || 1e-6;
    const data = this.imgData.data;
    for (let r = 0; r < n_lat; r++) {
      // image row 0 = north (highest latitude); data row 0 = southernmost
      const imgRow = n_lat - 1 - r;
      const rowOff = imgRow * n_lon * 4;
      const dataRowOff = r * n_lon;
      for (let c = 0; c < n_lon; c++) {
        const px = rowOff + c * 4;
        if (H[r][c] <= 0) {
          data[px] = LAND_COLOR[0]; data[px + 1] = LAND_COLOR[1]; data[px + 2] = LAND_COLOR[2];
        } else {
          const t = (etaFrame[dataRowOff + c] / vmax + 1) / 2;
          const [cr, cg, cb] = divergingColor(t);
          data[px] = cr; data[px + 1] = cg; data[px + 2] = cb;
        }
        data[px + 3] = 255;
      }
    }
    this.srcCtx.putImageData(this.imgData, 0, 0);
    this._redraw();
  }

  setMarker(latDeg, lonDeg) {
    this.markerLat = latDeg;
    this.markerLon = lonDeg;
    this._redraw();
  }

  _redraw() {
    const w = this.canvas.width, h = this.canvas.height;
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(this.src, 0, 0, w, h);
    if (this.markerLat !== null) {
      const [px, py] = this._latLonToPixel(this.markerLat, this.markerLon, w, h);
      this.ctx.beginPath();
      this.ctx.arc(px, py, Math.max(4, w * 0.012), 0, 2 * Math.PI);
      this.ctx.fillStyle = "#39ff14";
      this.ctx.strokeStyle = "#08210a";
      this.ctx.lineWidth = 2;
      this.ctx.fill();
      this.ctx.stroke();
    }
  }

  _latLonToPixel(latDeg, lonDeg, w, h) {
    const lat0 = this.meta.lat_deg[0], lat1 = this.meta.lat_deg[this.meta.n_lat - 1];
    const x = (((lonDeg % 360) + 360) % 360) / 360 * w;
    const y = (1 - (latDeg - lat0) / (lat1 - lat0)) * h;
    return [x, y];
  }

  _handleClick(event) {
    const rect = this.canvas.getBoundingClientRect();
    const xf = (event.clientX - rect.left) / rect.width;
    const yf = (event.clientY - rect.top) / rect.height;
    const lat0 = this.meta.lat_deg[0], lat1 = this.meta.lat_deg[this.meta.n_lat - 1];
    const lonDeg = xf * 360;
    const latDeg = lat1 - yf * (lat1 - lat0);
    if (this.onPick) this.onPick(latDeg, lonDeg);
  }
}
