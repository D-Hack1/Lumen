// Owner: Nived
// South Pole Basemap (guide 3.1). Layer stack, bottom to top:
//   L0 procedural schematic relief (always; canvas, drawn once) · graticule (rings + meridians, 0 deg E emphasised)
//   L1/L2 raster layer from layers.json when available (opacity) · L3 Artemis region outlines · L4 site pins
//   off-map edge indicators (e.g. Chandrayaan-3, 625 km from the pole) · Site Inset (Landing vs Target, 100 m bar)
// Fast Lane: the pointer readout is written to a ref (no React state, no transitions). Clicks use store actions.
import { useEffect, useMemo, useRef } from 'react';
import { fill } from '../../engine/format';
import { useCatalog, useLayers } from '../../engine/hooks';
import { colatKm, halfExtentKm, MOON_RADIUS_KM, project, unproject } from '../../engine/projection';
import type { MapExtent } from '../../engine/types';
import { loadPsr, type PsrRaster } from '../../engine/data/psr';
import { useCopyFn } from '../../state/copy';
import { getScenario, useScenario, type MapLayerId } from '../../state/scenarioStore';
import { Segmented } from '../../ui/Segmented';
import { Slider } from '../../ui/Slider';
import { insetOffsetsM } from './inset';
import { drawRelief } from './proceduralRelief';
import './map.css';

const LAT_LIMIT: Record<MapExtent, number> = { '80S': 80, '85S': 85 };
const RINGS: Record<MapExtent, number[]> = { '80S': [80, 82, 84, 86, 88], '85S': [85, 86, 87, 88, 89] };
const LAYER_IDS: MapLayerId[] = ['illumination', 'earth_visibility', 'slope_hazard', 'psr', 'psr_distance'];
const CANVAS = 480;

export function Basemap() {
  const t = useCopyFn();
  const { sites } = useCatalog();
  const layersRes = useLayers();
  const layers = useScenario((s) => s.layers);
  const siteRef = useScenario((s) => s.site);
  const extent = layers.extent;
  const half = layersRes.extents?.[extent]?.halfExtentKm ?? halfExtentKm(LAT_LIMIT[extent]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const square = useRef<HTMLDivElement>(null);
  const readout = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const psr = useRef<PsrRaster | null>(null);

  // L0: draw the procedural relief once per extent change (human speed).
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (c && ctx) drawRelief(ctx, CANVAS, extent === '80S' ? 80 : 85);
  }, [extent]);
  useEffect(() => {
    let live = true;
    loadPsr().then((r) => live && (psr.current = r), () => undefined);
    return () => {
      live = false;
    };
  }, []);

  const layer = layersRes.layers.find((l) => l.id === layers.layer && l.extent === extent);
  const selectedId = siteRef.kind === 'site' ? siteRef.id : null;
  const selected = sites.find((s) => s.id === selectedId) ?? null;
  const pins = useMemo(
    () =>
      sites.map((s) => {
        const p = project(s.landingCoords.lat, s.landingCoords.lon);
        return { s, x: p.x, y: -p.y, inside: Math.hypot(p.x, p.y) <= half };
      }),
    [sites, half],
  );
  const offMap = pins.filter((p) => !p.inside).sort((a, b) => a.s.lat - b.s.lat).slice(0, 3);
  const inset = selected ? insetOffsetsM(selected) : null;

  // Fast Lane readout: write textContent by ref on pointer move.
  const toKm = (e: React.PointerEvent | React.MouseEvent) => {
    const r = square.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width - 0.5) * 2 * half, y: -((e.clientY - r.top) / r.height - 0.5) * 2 * half };
  };
  const onMove = (e: React.PointerEvent) => {
    const el = readout.current;
    if (!el) return;
    const { x, y } = toKm(e);
    if (Math.hypot(x, y) > half) return void (el.textContent = t('map.cursor'));
    const g = unproject(x, y);
    const d = psr.current?.distanceKm(x, y);
    el.textContent = `${Math.abs(g.lat).toFixed(2)}°S ${g.lon.toFixed(1)}°E` + (d != null && !Number.isNaN(d) ? ` · PSR ${d.toFixed(1)} km` : '');
  };
  const onTerrainClick = (e: React.MouseEvent) => {
    const { x, y } = toKm(e);
    if (Math.hypot(x, y) > half) return;
    const g = unproject(x, y);
    getScenario().setCustomPoint(Math.round(g.lat * 1000) / 1000, Math.round(g.lon * 1000) / 1000);
  };

  const pinR = half * 0.022;
  return (
    <div className="basemap" data-extent={extent}>
      <div className="basemap__bar">
        <Segmented
          size="sm"
          ariaLabel="Map extent"
          value={extent}
          onChange={(v) => getScenario().setLayers({ extent: v })}
          options={[{ value: '80S', label: t('map.extent.80S') }, { value: '85S', label: t('map.extent.85S') }]}
        />
        <select
          className="basemap__layer"
          aria-label="Map layer"
          value={layers.layer ?? ''}
          onChange={(e) => getScenario().setLayers({ layer: (e.target.value || null) as MapLayerId | null })}
        >
          <option value="">{t('map.layer.none')}</option>
          {LAYER_IDS.map((id) => (
            <option key={id} value={id}>
              {t(`map.layer.${id}`)}
            </option>
          ))}
        </select>
        <Slider
          className="basemap__opacity"
          ariaLabel={t('map.opacity')}
          min={0}
          max={1}
          step={0.05}
          value={layers.opacity}
          onLive={(v) => img.current && (img.current.style.opacity = String(v))}
          onCommit={(v) => getScenario().setLayers({ opacity: v })}
        />
      </div>
      <div className="basemap__stage">
        <div ref={square} className="basemap__square" onPointerMove={onMove} onClick={onTerrainClick} role="img" aria-label={t('slot.map')}>
          <canvas ref={canvas} width={CANVAS} height={CANVAS} aria-hidden="true" />
          {layer && <img ref={img} src={layer.url} alt="" style={{ opacity: layers.opacity }} data-layer={layer.id} />}
          <svg viewBox={`${-half} ${-half} ${2 * half} ${2 * half}`} aria-hidden="false">
            {RINGS[extent].map((lat) => (
              <circle key={lat} className="basemap__ring" cx={0} cy={0} r={2 * MOON_RADIUS_KM * Math.tan(((90 - lat) * Math.PI) / 360)} />
            ))}
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i * 30 * Math.PI) / 180;
              return <line key={i} className={i === 0 ? 'basemap__meridian basemap__meridian--zero' : 'basemap__meridian'} x1={0} y1={0} x2={Math.sin(a) * half} y2={-Math.cos(a) * half} />;
            })}
            {layersRes.regions.map((g) => (
              <path key={g.id} className="basemap__region" d={g.svgPath}>
                <title>{g.name}</title>
              </path>
            ))}
            {pins.filter((p) => p.inside).map(({ s, x, y }) => (
              <circle
                key={s.id}
                className={s.id === selectedId ? 'basemap__pin is-selected' : 'basemap__pin'}
                cx={x}
                cy={y}
                r={pinR}
                onClick={(e) => {
                  e.stopPropagation();
                  if (e.shiftKey) getScenario().addCompareRow({ site: { kind: 'site', id: s.id } });
                  else getScenario().selectSite(s.id);
                }}
              >
                <title>{s.name}</title>
              </circle>
            ))}
          </svg>
          <span className="basemap__tag">{t('map.schematic')}</span>
          {inset && selected && (
            <div className="basemap__inset" data-testid="site-inset">
              <svg viewBox="-1000 -1000 2000 2000" role="img" aria-label={selected.name}>
                <line x1={inset.landing[0]} y1={-inset.landing[1]} x2={inset.target[0]} y2={-inset.target[1]} stroke="currentColor" strokeWidth={6} opacity={0.6} />
                <circle cx={inset.landing[0]} cy={-inset.landing[1]} r={40} fill="var(--c-sun)" />
                <circle cx={inset.target[0]} cy={-inset.target[1]} r={40} fill="none" stroke="var(--c-earth)" strokeWidth={14} />
                <text x={60} y={-60} fontSize={90}>{t('map.inset.landing')}</text>
                <text x={inset.target[0] + 60} y={-inset.target[1] - 60} fontSize={90}>{t('map.inset.target')}</text>
                <line x1={-900} y1={900} x2={-800} y2={900} stroke="currentColor" strokeWidth={14} />
                <text x={-780} y={930} fontSize={90}>{t('map.inset.scale')}</text>
              </svg>
            </div>
          )}
        </div>
      </div>
      <div ref={readout} className="basemap__readout" aria-live="off">
        {t('map.cursor')}
      </div>
      {offMap.length > 0 && (
        <div className="basemap__off">
          {offMap.map(({ s }) => (
            <span key={s.id} className="truncate" data-offmap={s.id}>
              {fill(t('map.offMap'), { name: s.name.split(' ')[0], lat: `${Math.abs(s.lat).toFixed(1)}°${s.lat < 0 ? 'S' : 'N'}`, lon: `${s.lon.toFixed(1)}°E`, km: Math.round(colatKm(s.lat)) })}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
