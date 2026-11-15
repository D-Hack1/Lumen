// Owner: Ebin (written for the live pages; route "methodology")
// Methodology & Validation (PLAN_FINAL §8.7): what LUMEN does and does not compute, how a number is produced, where the data comes
// from, the definitions and the uncertainty method, the validation gates with their REAL status (read from the published
// validation report — never hand-edited), known limitations, AI-use disclosure, and the glossary.
// Honesty rules: the scope statement is the plan's own wording; a gate is shown PASS only if the report says PASS; nothing here
// claims more than the report does.
import { useEffect, useMemo, useState } from 'react';
import { DataError, fetchJson } from '../../engine/data/source';
import { CREDITS } from '../../content/credits';
import './methodology.css';

interface Gate {
  id: string;
  description?: string;
  criterion?: string;
  status: string;
  reason?: unknown;
  provenance?: string;
  value?: unknown;
}
interface Report {
  status?: string;
  gates: Gate[];
  limitations?: string[];
}
interface GlossaryEntry {
  id: string;
  term: string;
  definition: string;
  units?: string;
  formula?: string;
  impact?: string;
  uncertainty?: string;
  source?: string;
  learn_more_anchor?: string;
}

const GLYPH: Record<string, string> = { PASS: '●', PENDING: '○', BLOCKED: '✕' };

const asText = (x: unknown): string => {
  if (x == null) return '';
  if (typeof x === 'string') return x;
  if (typeof x === 'object') {
    const o = x as Record<string, unknown>;
    return asText(o.reason ?? o.summary ?? o.detail ?? o.description ?? '');
  }
  return String(x);
};

/** A short, honest evidence line per gate: the measured value for a PASS, the stated reason for anything else. */
export function gateEvidence(g: Gate): string {
  if (g.status === 'PASS') {
    const v = g.value;
    if (v && typeof v === 'object') {
      const nums = Object.entries(v as Record<string, unknown>)
        .filter(([, n]) => typeof n === 'number')
        .map(([k, n]) => `${k.replace(/_/g, ' ')}: ${Number(n).toPrecision(3)}`);
      if (nums.length) return nums.join(' · ');
    }
    return g.provenance ?? 'Passed.';
  }
  return asText(g.reason) || g.provenance || 'No result is available yet.';
}

const SECTIONS = [
  ['scope', 'What LUMEN does and does not compute'],
  ['how', 'How a number is produced'],
  ['data', 'Data sources'],
  ['definitions', 'Definitions and frames'],
  ['uncertainty', 'Uncertainty (±)'],
  ['validation', 'Validation'],
  ['limits', 'Known limitations'],
  ['ai', 'AI-use disclosure'],
  ['glossary', 'Glossary'],
] as const;

export function MethodologyPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [reportErr, setReportErr] = useState<string | null>(null);
  const [glossary, setGlossary] = useState<GlossaryEntry[]>([]);

  useEffect(() => {
    let live = true;
    fetchJson<Report>('validation/report.json').then(
      (r) => live && setReport(r),
      (e: unknown) => live && setReportErr(e instanceof DataError || e instanceof Error ? e.message : String(e)),
    );
    const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
    fetch(`${base.replace(/\/$/, '')}/content/glossary.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { entries?: GlossaryEntry[] }) => live && setGlossary(j.entries ?? []))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const counts = useMemo(() => {
    const c = { PASS: 0, PENDING: 0, BLOCKED: 0 } as Record<string, number>;
    for (const g of report?.gates ?? []) c[g.status] = (c[g.status] ?? 0) + 1;
    return c;
  }, [report]);

  return (
    <main className="lm-wrap lm-meth">
      <div>
        <h1 className="lm-h1">Methodology &amp; validation</h1>
        <p className="lm-lede">
          How LUMEN works, what it rests on, how far it has been checked, and where it stops. Written to be read, not skimmed: every claim here is
          either the project plan’s own wording or read live from the validation report.
        </p>
      </div>

      <nav aria-label="On this page" className="lm-meth__toc">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#methodology`} onClick={(e) => (e.preventDefault(), document.getElementById(`m-${id}`)?.scrollIntoView({ block: 'start' }))}>
            {label}
          </a>
        ))}
      </nav>

      <section id="m-scope" className="lm-box lm-meth__sec">
        <h2>What LUMEN does and does not compute</h2>
        <p>
          <strong>LUMEN computes</strong> geometric Sun and Earth availability, Deep Space Network coverage, and a generic power estimate.
        </p>
        <p>
          <strong>It does not compute</strong> link budgets, data rates, thermal survival or vehicle-specific array performance.
        </p>
        <p>
          Limits that follow from the data: DEM resolution bounds the near-field horizon and pad slope; LOLA elevation errors propagate into horizons
          (quantified through σ); lander-scale rocks are not modelled; “Tier C” sites assume a smooth Moon; DSN visibility is simplified to a single
          elevation threshold; and Tier-B terrain snaps to a coarse grid, with a snap error of up to about 2.8 km in the 4 km band.
        </p>
      </section>

      <section id="m-how" className="lm-box lm-meth__sec">
        <h2>How a number is produced</h2>
        <ol>
          <li>
            <strong>Ahead of time</strong> (Python): Sun and Earth positions are computed from NASA SPICE ephemeris kernels, and LOLA elevation maps are
            turned into <em>horizon masks</em> — the height of the skyline in every compass direction, at four array heights — for each site.
          </li>
          <li>
            <strong>In your browser</strong> (TypeScript, offline): for a site and a time, the Sun and Earth positions are interpolated (cubic Hermite),
            rotated into the site’s frame, and compared with the horizon mask. Each body is a disk, not a point, so its visible fraction is computed by
            chord quadrature against the skyline.
          </li>
          <li>
            Moments when something changes (a sunset, an Earthset) are found by bisection to about 10 s. Windows, percentages, the longest night and a
            ± from the horizon uncertainty follow, and the verdict is last.
          </li>
          <li>
            Every browser calculation has a Python twin; the two are checked against each other on shared test cases (“golden vectors”). The app makes
            no network calls after the first load.
          </li>
        </ol>
      </section>

      <section id="m-data" className="lm-box lm-meth__sec">
        <h2>Data sources</h2>
        <ul>
          <li>
            Ephemeris: <a href="https://naif.jpl.nasa.gov/naif/data.html">NASA NAIF SPICE kernels</a> (planetary and lunar kernels, DSN station kernels),
            evaluated in a Moon-fixed frame consistent with the LOLA terrain data.
          </li>
          <li>
            Terrain: <a href="https://pgda.gsfc.nasa.gov/">LRO LOLA digital elevation models from the Planetary Geodesy Data Archive</a> (polar products
            at 5, 10, 20, 60 and 240 m per pixel).
          </li>
          <li>
            Average illumination and Earth visibility maps: Mazarico, E., et al. (2011), <em>Icarus</em> 211, 1066–1081,{' '}
            <a href="https://doi.org/10.1016/j.icarus.2010.10.030">doi:10.1016/j.icarus.2010.10.030</a>.
          </li>
          <li>
            Site coordinates: agency and peer-reviewed sources named per site in the catalogue (for example ISRO’s{' '}
            <a href="https://www.isro.gov.in/Chandrayaan3.html">Chandrayaan-3</a> page; the{' '}
            <a href="https://astrogeology.usgs.gov/search/map/Moon/Lunar_Polar_Maps">USGS lunar polar maps</a>).
          </li>
          <li>
            Cross-checks and context: <a href="https://ssd.jpl.nasa.gov/horizons/">JPL Horizons</a>,{' '}
            <a href="https://quickmap.lroc.im-ldi.com/">LROC QuickMap</a>, <a href="https://trek.nasa.gov/moon/">NASA Moon Trek</a>.
          </li>
          <li>
            Images: Sun — {CREDITS.sun_sdo.credit} (<a href="https://sdo.gsfc.nasa.gov/data/">SDO data</a>); Earth — {CREDITS.earth_epic.credit} (
            <a href="https://epic.gsfc.nasa.gov/">EPIC</a>); Moon globe — LROC colour map (NASA SVS CGI Moon Kit); Earth globe — NASA Blue Marble; polar
            terrain picture — NASA LRO LOLA 80 m DEM; south-pole photo base — NASA/GSFC/Arizona State University (LROC). No NASA logo or insignia is used.
          </li>
        </ul>
      </section>

      <section id="m-definitions" className="lm-box lm-meth__sec">
        <h2>Definitions and frames</h2>
        <ul>
          <li>
            <strong>Sun available</strong> when at least 50% of the Sun’s disk is above the terrain horizon in its direction (editable in the full design).
          </li>
          <li>
            <strong>Earth visible</strong> when at least 50% of Earth’s disk clears the horizon and the DTE margin is at least 1°.{' '}
            <strong>Link up</strong> additionally requires at least one Deep Space Network complex (Goldstone, Canberra, Madrid) to see the Moon above 10°.
          </li>
          <li>
            <strong>Azimuth near the pole</strong> is measured from a fixed reference (toward 0°E, the mean direction to Earth) because “east” is undefined at the
            pole; elsewhere it is true azimuth.
          </li>
          <li>
            <strong>Verdict</strong>: GO if every hard requirement passes even at the conservative bound; MARGINAL if one passes only at its nominal value or is
            within 10% of its limit; NO-GO otherwise.
          </li>
          <li>
            <strong>Tiers</strong>: A = dedicated high-resolution terrain; B = snapped to a coarse 80–90°S grid; C = smooth sphere, no terrain.
          </li>
        </ul>
      </section>

      <section id="m-uncertainty" className="lm-box lm-meth__sec">
        <h2>Uncertainty (±)</h2>
        <p>
          Near the pole the Sun’s elevation changes very slowly (about 0.044° per hour at 85°S), so a small horizon error moves a sunset by hours. Each event
          time therefore carries a ± of about <em>σ ÷ |rate of change of clearance|</em>, and each percentage is computed three times (horizon lowered by σ,
          nominal, raised by σ) to give a [low, high] range. When the rate is very small or the ± exceeds about 12 h, the event is marked “grazing — timing
          poorly constrained” and a range is shown instead.
        </p>
        <p>
          <strong>Where σ comes from today:</strong> IM-2, Chandrayaan-3 and the Shackleton ridge have a <em>preliminary Monte-Carlo σ</em> (30 perturbed copies
          of the elevation model). It rests on two unverified modelling assumptions — that the published error raster is a one-σ magnitude, and a 50 m
          correlation length that has not been physically calibrated — and is marked preliminary in its own file. Sites without a σ file show no ± and say why.
          Nothing is invented to fill the gap.
        </p>
      </section>

      <section id="m-validation" className="lm-box lm-meth__sec">
        <h2>Validation</h2>
        {reportErr && <p className="lm-meth__err">The validation report could not be loaded ({reportErr}).</p>}
        {!report && !reportErr && <p className="lm-hint">Loading the validation report…</p>}
        {report && (
          <>
            <p>
              <strong>
                {counts.PASS} of {report.gates.length} gates pass
              </strong>
              {counts.PENDING ? `, ${counts.PENDING} are pending` : ''}
              {counts.BLOCKED ? `, ${counts.BLOCKED} are blocked` : ''}. Overall status: <strong>{(report.status ?? 'unknown').replace(/_/g, ' ')}</strong>. A gate is only
              marked PASS when a recorded check meets its criterion; a unit test existing is not enough.
            </p>
            <div className="lm-meth__tablewrap">
              <table className="lm-meth__table">
                <thead>
                  <tr>
                    <th>Gate</th>
                    <th>Check</th>
                    <th>Criterion</th>
                    <th>Status</th>
                    <th>Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {report.gates.map((g) => (
                    <tr key={g.id}>
                      <td className="num">{g.id}</td>
                      <td>{g.description ?? ''}</td>
                      <td>{g.criterion ?? ''}</td>
                      <td data-status={g.status}>
                        <span aria-hidden="true">{GLYPH[g.status] ?? '·'}</span> {g.status}
                      </td>
                      <td className="lm-meth__ev">{gateEvidence(g)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section id="m-limits" className="lm-box lm-meth__sec">
        <h2>Known limitations</h2>
        <ul>
          {(report?.limitations ?? []).map((l) => (
            <li key={l}>{l}</li>
          ))}
          <li>The vertical datum of the adjusted LOLA elevation model relative to the 1,737.4 km reference sphere is not formally confirmed.</li>
          <li>
            Dispersion (landing-ellipse slope statistics) and the Tier-B regional terrain grid are not produced yet, so custom points and most of the pole use a
            smooth-Moon estimate and say so.
          </li>
          <li>The catalogue coordinates for the Shackleton connecting ridge are under review (NASA’s average-illumination map shows permanent shadow there).</li>
          <li>Site coordinates and touchdown times are only as good as their cited sources; unverified rows are not shown as verified.</li>
        </ul>
      </section>

      <section id="m-ai" className="lm-box lm-meth__sec">
        <h2>AI-use disclosure</h2>
        <p>
          Parts of LUMEN’s code, tests and documentation were written with the help of an AI assistant (Anthropic’s Claude). Each team member keeps a log of
          how AI was used in <code>docs/ai_usage/</code> in the project repository. AI was not used to invent data: every number the app shows comes from
          the ephemeris and terrain files above through the calculations described here, and the explanation assistant (“Ask LUMEN”) works offline from the
          project’s own written material, with no language model.
        </p>
      </section>

      <section id="m-glossary" className="lm-box lm-meth__sec">
        <h2>Glossary</h2>
        {glossary.length === 0 && <p className="lm-hint">Loading…</p>}
        <dl className="lm-meth__gloss">
          {glossary.map((g) => (
            <div key={g.id} id={g.learn_more_anchor ?? `gloss-${g.id}`}>
              <dt>
                {g.term}
                {g.units ? <span className="lm-meth__unit"> · {g.units}</span> : null}
              </dt>
              <dd>
                {g.definition}
                {g.formula ? (
                  <>
                    {' '}
                    <span className="lm-meth__formula">{g.formula}</span>
                  </>
                ) : null}
                {g.uncertainty ? <span className="lm-meth__caveat"> {g.uncertainty}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
