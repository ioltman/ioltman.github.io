// Plotly-based eta(t) plot at a picked point: box-zoom + rangeslider for the
// time axis, a vertical bar tracking the current animation frame, and a
// click handler that scrubs the shared playhead to the clicked time.
export class TimeSeries {
  constructor(container, onScrub) {
    this.container = container;
    this.onScrub = onScrub;
    this.timesDays = [];

    const trace = {
      x: [], y: [], type: "scatter", mode: "lines",
      line: { color: "#39ff9c", width: 1.4 },
      name: "eta",
      hovertemplate: "day %{x:.2f}<br>eta %{y:.3f} m<extra></extra>",
    };
    const layout = {
      paper_bgcolor: "#0b0f1a", plot_bgcolor: "#0b0f1a",
      font: { color: "#cfd8e3", size: 12 },
      margin: { l: 55, r: 20, t: 10, b: 40 },
      xaxis: {
        title: "time (days)", gridcolor: "#1c2436", zerolinecolor: "#1c2436",
        rangeslider: { visible: true, bgcolor: "#0b0f1a", bordercolor: "#1c2436" },
      },
      yaxis: { title: "sea surface height (m)", gridcolor: "#1c2436", zerolinecolor: "#3a4356" },
      shapes: [{
        type: "line", x0: 0, x1: 0, y0: 0, y1: 1, yref: "paper",
        line: { color: "#ffffff", width: 1.5, dash: "solid" },
      }],
    };
    Plotly.newPlot(container, [trace], layout, {
      displaylogo: false, responsive: true,
      modeBarButtonsToRemove: ["lasso2d", "select2d"],
    });

    container.on("plotly_click", (ev) => {
      if (!ev.points || !ev.points.length) return;
      const xVal = ev.points[0].x;
      if (this.onScrub) this.onScrub(xVal);
    });
  }

  setSeries(timesDays, values, title) {
    this.timesDays = timesDays;
    Plotly.restyle(this.container, { x: [timesDays], y: [values] }, [0]);
    Plotly.relayout(this.container, {
      title: { text: title, font: { size: 12, color: "#9fb0c3" } },
      "xaxis.autorange": true, "yaxis.autorange": true,
    });
  }

  setFrameTime(tDays) {
    Plotly.relayout(this.container, { "shapes[0].x0": tDays, "shapes[0].x1": tDays });
  }

  nearestFrame(tDays) {
    let lo = 0, hi = this.timesDays.length - 1;
    if (tDays <= this.timesDays[0]) return 0;
    if (tDays >= this.timesDays[hi]) return hi;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.timesDays[mid] < tDays) lo = mid; else hi = mid;
    }
    return (tDays - this.timesDays[lo] < this.timesDays[hi] - tDays) ? lo : hi;
  }
}
