# Scottish Flag Visualizer

This local app computes and plots the spectrum of

\[
(H^N_{p_0,x_0,\lambda}u)_n
=\frac12\left(e^{-ip_0}u_{n+1}+e^{ip_0}u_{n-1}\right)
+\lambda\cos\left(\frac{2\pi n}{N}+x_0\right)u_n.
\]

The first window overlays the eigenvalues on the parallelogram
\(\Sigma_\lambda\) with vertices \(\pm1\pm\lambda\). Its energy marker controls
the second window, which plots the real locus of \(E-\lambda\cos z\), the
subarcs where the complex momentum is real, and the \(\cos p=\pm1\) turning
points. Two independently switchable streamline families follow
\((\operatorname{Im}p,\operatorname{Re}p)\) and
\((-\operatorname{Im}p,\pi-\operatorname{Re}p)\), the gradient fields of
\(\operatorname{Im}\int p\,dz\) and
\(\operatorname{Im}\int(\pi-p)\,dz\), respectively. Momentum is continued
along each streamline on the logarithmic two-sheeted cover rather than being
reset to the principal arccosine at every sample.

The lower spectral-curve workspace visualizes the real two-dimensional curve
in four real coordinates. Its main canvas uses
\((\operatorname{Re}z,-\operatorname{Im}z,-\operatorname{Im}p)\) as spatial
coordinates and colour for \(\operatorname{Re}p\bmod 2\pi\). Linked panels show
the two-sheeted cover of the \(t=\cos z\) plane, its four branch points, and the
amoeba/coamoeba projections. All views update when the energy marker or
\(\lambda\) changes.

Use **Draw contour** beneath the complex \(z\)-plane to trace a path. Starting
from the principal value at the first point, the app analytically continues the
momentum by choosing at every subsequent point the nearest member of
\(\{\pm\arccos(E-\lambda\cos z)+2\pi k:k\in\mathbb Z\}\). The resulting lift is
shown simultaneously in the \(p\)-plane, as \(\operatorname{Re}p\) and
\(\operatorname{Im}p\) along the path, on the 3D surface, and on the two copies
of the branched \(t\)-plane. A closed path around one turning point exchanges
the sheets; the status line reports this monodromy explicitly.

In the branched-cover window, the contour is first projected by
\(t=\cos z\). The left panel is defined to be the sheet containing the starting
point. Each transverse intersection with a displayed dotted branch cut splits
the path at the intersection and continues it on the other panel. These
cut-relative \(q\)-sheets are deliberately kept separate from the
\(\pm p_{\mathrm{pr}}+2\pi k\) labels used for principal-\(\arccos\)
bookkeeping.

## Run

Double-click `index.html`. The spectrum is computed entirely in the browser;
there is no server, installation, or internet connection required.

The complex Hessenberg/shifted-QR solver is adapted from
<https://ioltman.github.io/nsa_harper.html>.

Use the **Views** menu in the header to add or remove individual windows. The
app starts with Parameters, Spectrum, and Momentum visible and remembers the
chosen arrangement locally.

The optional **Explanation** window gives a mathematical guide to the
exponentiated elliptic curve, its logarithmic momentum lift, turning points,
contour continuation, sheet monodromy, and the meanings of the linked plots.
Its LaTeX is rendered by a vendored MathJax 3.2.2 bundle, so the typesetting is
available offline.
