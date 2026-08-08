// Condensed HTML rendering of the theory in main.tex. KaTeX auto-render is
// invoked on this content after it's inserted (see app.js).
export const THEORY_HTML = `
<div class="theory">

<h2>1. Starting point: two laws, one definition</h2>
<p>Everything here follows from two statements of fundamental physics and nothing else:</p>
<div class="eqbox">
$$\\text{Newton's second law:}\\qquad \\mathbf F = m\\mathbf a$$
$$\\text{Newton's law of gravitation:}\\qquad \\mathbf F_{b\\to X} = \\frac{GM_b\\,m\\,(\\mathbf r_b-\\mathbf r_X)}{|\\mathbf r_b-\\mathbf r_X|^3}$$
</div>
<p>where <span>$G$</span> is the gravitational constant, <span>$M_b$</span> the mass of body <span>$b$</span> (Sun or a moon), and
<span>$\\mathbf r_b,\\mathbf r_X$</span> position vectors in a common inertial frame. Dividing by <span>$m$</span> gives the
acceleration a unit test mass at <span>$\\mathbf r_X$</span> feels from body <span>$b$</span> alone,</p>
<div class="eqbox">$$\\mathbf g_b(\\mathbf r_X) = \\frac{GM_b(\\mathbf r_b-\\mathbf r_X)}{|\\mathbf r_b-\\mathbf r_X|^3}$$</div>
<div class="remark"><b>There is no separate &ldquo;tidal force&rdquo; in Newton's laws.</b> What's called the tidal force is a
<b>definition</b>: the difference between real gravity at a surface point and at Earth's centre. Everything below &mdash; the
two-bulge structure, the <span>$n$</span>-body invariance, the beating between multiple moons &mdash; is a mathematical
consequence of that one definition, not an additional physical postulate.</div>

<h2>2. The tidal acceleration field</h2>
<p>Summing over the Sun and every moon, and transforming into the frame co-moving with Earth's centre by subtracting that
frame's true acceleration <span>$\\mathbf a_\\oplus$</span> (taken from the same <span>$N$</span>-body integration, not
re-derived independently &mdash; see the report for why that distinction caught a real bug):</p>
<div class="eqbox">$$\\boxed{\\ \\mathbf a_{\\mathrm{tid}}(P) = \\underbrace{\\textstyle\\sum_b \\mathbf g_b(P)}_{\\text{real gravity, every point}} - \\ \\underbrace{\\mathbf a_\\oplus}_{\\text{Earth's true accel.}}\\ }$$</div>
<p>Only the tangential (east/north) component drives horizontal flow; the radial part slightly perturbs local effective
gravity and is dropped, as is standard. No multipole truncation is used anywhere in the simulation &mdash; this is exact
Newtonian gravity, differenced.</p>

<h3>Free fall, not rotation</h3>
<p>The usual narrative blames the far-side bulge on the centrifugal force of Earth revolving around the Earth&ndash;Moon
barycentre. That's a <i>special case</i>: the boxed equation contains no velocity, so the tidal field only depends on
instantaneous position. A &ldquo;frozen Moon&rdquo; scenario (Moon pinned in inertial space, Earth orbiting nothing) still
shows Earth undergoing straight-line free fall toward the Moon, and still produces two bulges. The general statement is the
equivalence principle: an extended body in <i>free fall</i> through a non-uniform field is stretched along the field
gradient. Orbiting is merely one way to be in free fall.</p>
<div class="remark">The converse experiment: pin Earth and the Moon apart with a rigid, massless rod (still spinning, still
orbiting the Sun). The rod supplies a real constraint force that cancels the Moon's pull at Earth's centre &mdash; Earth stops
free-falling &mdash; and the far bulge disappears entirely. Measured: <b>one</b> high tide per sidereal day (23.947&nbsp;h vs a
predicted 23.934&nbsp;h) instead of two, at roughly 20&times; the amplitude, since the ocean now feels raw lunar gravity
instead of its much smaller gradient. See the <b>rod-linked</b> tab.</div>

<h2>3. Why exactly two bulges, for any number of moons</h2>
<h3>Exact multipole expansion</h3>
<p>Let <span>$\\Phi_b(\\mathbf r_X)=-GM_b/|\\mathbf r_b-\\mathbf r_X|$</span>, <span>$R$</span> = Earth's radius,
<span>$d_b=|\\mathbf r_b|$</span>, and <span>$\\psi_b$</span> the angle between the local zenith and the direction to body
<span>$b$</span>. Since <span>$R\\ll d_b$</span>, the Legendre generating function gives the convergent, exact expansion</p>
<div class="eqbox">$$\\Phi_b(P) = -\\frac{GM_b}{d_b}\\sum_{\\ell=0}^\\infty\\left(\\frac{R}{d_b}\\right)^{\\!\\ell} P_\\ell(\\cos\\psi_b)$$</div>
<p>The <span>$\\ell=0$</span> term is constant (no force); the <span>$\\ell=1$</span> term is linear in <span>$\\mathbf r_X$</span>,
so its gradient is exactly the uniform vector subtracted as <span>$\\mathbf a_\\oplus$</span>. So <b>the boxed equation above
is precisely the exact <span>$\\ell\\ge2$</span> tail of this series</b> &mdash; nothing discarded, to all orders.</p>

<h3>The quadrupole term: exactly two bulges</h3>
<p><span>$P_2(x)=\\tfrac12(3x^2-1)$</span>. On the great circle through body <span>$b$</span>'s sub-point, with
<span>$\\theta$</span> measured from it, the identity <span>$\\cos^2\\theta=\\tfrac12(1+\\cos2\\theta)$</span> gives</p>
<div class="eqbox">$$P_2(\\cos\\theta) = \\frac34\\cos(2\\theta) + \\frac14$$</div>
<p>Exact algebra, not approximation: a pure second-harmonic oscillation plus a constant. Two maxima
(<span>$\\theta=0,\\pi$</span>: near and far side), two minima (<span>$\\theta=\\pi/2,3\\pi/2$</span>). That's the entire
mechanism &mdash; the shape of one polynomial. At general latitude, the spherical-harmonic addition theorem bounds the
azimuthal frequency content of an <span>$\\ell=2$</span> source to <span>$|m|\\le 2$</span>: three &ldquo;species&rdquo;
&mdash; long-period (<span>$m=0$</span>), diurnal (<span>$m=1$</span>, <span>$\\propto\\sin2\\phi\\sin2\\delta_b$</span>,
needs both off-equator latitude <i>and</i> nonzero declination), and semidiurnal (<span>$m=2$</span>, the dominant term at
low latitude). <b>Two cycles per rotation is a structural ceiling for a quadrupole source, not an empirical count.</b></p>

<h3>Superposition over <span>$n$</span> bodies</h3>
<p>At any fixed instant, each body's <span>$m=2$</span> contribution is <span>$A_b\\cos(2\\lambda-2\\lambda_b(t))$</span>.
Summing phasors,</p>
<div class="eqbox">$$\\sum_{b=1}^n A_b\\cos\\!\\big(2\\lambda-2\\lambda_b(t)\\big) = \\mathcal A(t)\\cos\\!\\big(2\\lambda-\\Phi(t)\\big)$$</div>
<p>&mdash; a single wavenumber-2 pattern, for <i>any</i> <span>$n$</span>, any masses, any orbital planes, at every instant.
Adding moons cannot manufacture a new spatial frequency, exactly as summing <span>$\\sin(2x)$</span> terms can never
produce a <span>$\\sin(3x)$</span> term. Verified directly: the inclined, unequal-mass two-moon scenario gives exactly 2
bulges in 31/31 sampled instants; Jupiter with all four Galilean moons (masses spanning 17&times;) gives exactly 2 bulges
in 400/400 samples.</p>
<div class="remark"><b>The honest correction:</b> <span>$\\ell=3$</span> is odd, so <span>$P_3(-x)=-P_3(x)$</span> breaks the
near/far symmetry of the quadrupole term &mdash; this is precisely the measured near/far ratio <b>0.9515</b> (real physics,
not truncation error). It permits a genuine but tiny terdiurnal (<span>$m=3$</span>) line, suppressed by an extra factor
<span>$R/d_b\\approx0.017$</span> for the Moon.</p></div>

<h3>Species beating: spatial invariance vs. temporal irregularity</h3>
<p>The superposition result is about space at one instant. At a <i>fixed point</i> over time, each body's semidiurnal term
oscillates at its own frequency</p>
<div class="eqbox">$$\\omega_b = 2\\big(\\Omega_\\oplus-\\dot\\theta_b\\big)$$</div>
<p>where <span>$\\Omega_\\oplus$</span> is Earth's sidereal rotation rate and <span>$\\dot\\theta_b$</span> body
<span>$b$</span>'s orbital angular rate. This single formula reproduces every measured period in this app: 11.987&nbsp;h for
the frozen Moon (<span>$\\dot\\theta=0$</span>), 12.408&nbsp;h for the real Moon (the <span>$M_2$</span> line), 13.257&nbsp;h
when the inclined second moon dominates. When two moons have <i>different</i> periods, the fixed-point signal is a genuine
multi-tone sum &mdash; not reducible to one cosine &mdash; and beats: the inclined two-moon run shows only 1.80 peaks/day on
average, with gaps from 7.5&ndash;27.5&nbsp;h, purely from this beating. The spatial field is still exactly two bulges at
every sampled instant; what beats is how a fixed point samples them.</p>

<h2>4. Numerical model</h2>
<p>Shallow-water equations on a rotating sphere, Arakawa C-grid (an unstaggered A-grid was tried first and diverged via the
classic checkerboard mode after ~1000 steps), explicit forward&ndash;backward time stepping, mass-conserving to round-off.
Earth's true barycentric wobble is included (measured 4500&ndash;4690&nbsp;km, real value ~4670&nbsp;km); obliquity
23.44&deg; is applied as a fixed pole tilt, without which no diurnal constituent could exist anywhere at any resolution.</p>

<h2>5. Results at a glance</h2>
<table>
<tr><th>Scenario</th><th>Predicted period</th><th>Measured</th><th>Notes</th></tr>
<tr><td>Frozen Moon</td><td>11.967 h</td><td>11.987 h</td><td>half sidereal day</td></tr>
<tr><td>Real Moon (baseline)</td><td>12.420 h</td><td>12.408 h</td><td>the M2 line</td></tr>
<tr><td>Two Moons (Moon 2 dominant)</td><td>13.250 h</td><td>13.257 h</td><td>faster orbit wins</td></tr>
<tr><td>Rod-linked Moon</td><td>23.934 h</td><td>23.947 h</td><td>one bulge, ~20&times; amplitude</td></tr>
</table>
<p>The Gulf of Mexico experiment with realistic coastlines and obliquity enabled gave a <i>negative</i> result worth stating
plainly: form factor <span>$F=(K_1+O_1)/(M_2+S_2)=0.48$</span> against a real value <span>$>3$</span>. Diurnal energy is
genuinely concentrated there (9&times; open-ocean K1/O1), but the model's uniform ~3300&nbsp;m depth (real mean ~1600&nbsp;m)
detunes the basin's resonance well clear of the diurnal band. See the <b>realistic geometry</b> tab.</p>

<h2>6. Limitations</h2>
<p>Linear shallow water (no <span>$M_4$</span> overtides); uniform linear bottom friction; no self-attraction/loading;
domain capped at &plusmn;75&deg; latitude; continents in three of the four tabs are hand-drawn boxes, not real coastlines
(the <b>realistic geometry</b> tab uses digitized polygons instead); depth is a crude shelf taper, not real bathymetry.
Full derivations, every numeric check, and the complete audit are in the written report.</p>

</div>
`;
