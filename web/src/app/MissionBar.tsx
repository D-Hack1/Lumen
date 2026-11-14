// Owner: Abhinav
// Persistent Top Mission Bar (PLAN §8.2) — Phase 1 skeleton.
// Built: brand + site + tier, view tabs, landing UTC + duration + MET readout, jump buttons S/E/X/T (instant
// scrub, no tween), verdict chip, persona switch, Share URL + toast.
// Phase 2: dynamic E label (Next Earthrise/Earthset from answer.earth.visible), jump tooltips with target time ±.
// Phase 5: Quick Answer, Quick-Start, Help buttons; full keyboard map (1/2/3, S/E/X/T, Q).
import { useEffect, useRef, useState } from 'react';
import { jumpTo, useCatalog, useResult } from '../engine/hooks';
import type { EventType, Verdict } from '../engine/types';
import { crosshairBus } from '../state/buses';
import { useCopyFn } from '../state/copy';
import { crosshair } from '../state/crosshairStore';
import { getScenario, useScenario, type DurationDays, type Persona, type ViewId } from '../state/scenarioStore';
import { scenarioUrl } from '../state/urlSync';
import { Badge, type BadgeTone } from '../ui/Badge';
import { Segmented } from '../ui/Segmented';
import { toast } from '../ui/Toast';
import { useFixture } from './layout/fixture';
import { formatMet, formatUtc, parseUtc } from './time';

const VIEWS: ViewId[] = ['cockpit', 'compare', 'methodology'];
const DURATIONS: DurationDays[] = [7, 14, 30, 60];
const VERDICT_TONE: Record<Verdict, BadgeTone> = {
  GO: 'go',
  MARGINAL: 'marginal',
  'NO-GO': 'nogo',
  PENDING: 'pending',
};

type JumpId = Extract<EventType, 'sunset' | 'earthset' | 'shadowExit'> | 'touchdown';
const JUMPS: { id: JumpId; key: string }[] = [
  { id: 'sunset', key: 'S' },
  { id: 'earthset', key: 'E' }, // Phase 2: 'earthrise' when Earth is down (D-14)
  { id: 'shadowExit', key: 'X' },
  { id: 'touchdown', key: 'T' },
];

// ---------- pieces ----------

function LandingInput() {
  const landingUtc = useScenario((s) => s.landingUtc);
  const setLandingUtc = useScenario((s) => s.setLandingUtc);
  const t = useCopyFn();
  const [draft, setDraft] = useState(formatUtc(landingUtc));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setDraft(formatUtc(landingUtc));
    setInvalid(false);
  }, [landingUtc]);

  const commit = () => {
    const v = parseUtc(draft);
    if (v == null) return setInvalid(true);
    setInvalid(false);
    if (v !== landingUtc) setLandingUtc(v);
    else setDraft(formatUtc(v));
  };
  return (
    <label className="mb-field" title={t('mb.landing.long')}>
      <span className="mb-field__label mb-long">{t('mb.landing')}</span>
      <input
        className="mb-input num"
        value={draft}
        spellCheck={false}
        inputMode="numeric"
        aria-label={t('mb.landing.long')}
        aria-invalid={invalid || undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(formatUtc(landingUtc));
            setInvalid(false);
          }
        }}
      />
      <span className="mb-field__unit">UTC</span>
    </label>
  );
}

/** MET of the live scrub time — Fast Lane: bus subscriber writes textContent, never React state. */
function MetReadout() {
  const t = useCopyFn();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const draw = () => {
      if (ref.current) ref.current.textContent = formatMet(crosshairBus.get().tScrub, getScenario().landingUtc);
    };
    draw();
    const a = crosshairBus.subscribe(draw);
    const b = useScenario.subscribe((s, p) => s.landingUtc !== p.landingUtc && draw());
    return () => {
      a();
      b();
    };
  }, []);
  return (
    <span className="mb-met" title={t('mb.met')}>
      <span className="mb-field__label mb-long">{t('mb.met')}</span>
      <span ref={ref} className="mb-met__value num" data-hotpath="" aria-live="off" />
    </span>
  );
}

function JumpButtons() {
  const t = useCopyFn();
  const onJump = (id: JumpId) => {
    const target = id === 'touchdown' ? getScenario().landingUtc : jumpTo(id);
    if (target == null) return toast(t('mb.jump.none'));
    crosshair.commitScrub(target); // instant — no tween of t_scrub (§1.4)
  };
  return (
    <div className="mb-jumps" role="group" aria-label="Jump to event">
      {JUMPS.map((j) => (
        <button
          key={j.id}
          type="button"
          className="mb-btn mb-jump"
          title={`${t(`mb.jump.${j.id}.long`)} (${j.key})`}
          aria-label={t(`mb.jump.${j.id}.long`)}
          aria-keyshortcuts={j.key}
          onClick={() => onJump(j.id)}
        >
          <kbd className="mb-kbd">{j.key}</kbd>
          <span className="mb-jump__label mb-mid">{t(`mb.jump.${j.id}`)}</span>
        </button>
      ))}
    </div>
  );
}

function VerdictChip({ verdict }: { verdict: Verdict }) {
  const t = useCopyFn();
  return (
    <span className="mb-verdict" title={t('mb.verdict')}>
      {/* key → remount → 120 ms opacity crossfade on change */}
      <Badge key={verdict} tone={VERDICT_TONE[verdict]} size="md" className="mb-verdict__chip">
        {t(`verdict.${verdict}`)}
      </Badge>
    </span>
  );
}

// ---------- bar ----------

export function MissionBar() {
  const t = useCopyFn();
  const view = useScenario((s) => s.view);
  const setView = useScenario((s) => s.setView);
  const persona = useScenario((s) => s.persona);
  const setPersona = useScenario((s) => s.setPersona);
  const duration = useScenario((s) => s.durationDays);
  const setDuration = useScenario((s) => s.setDuration);
  const site = useScenario((s) => s.site);
  const { sites } = useCatalog();
  const result = useResult();
  const fx = useFixture()?.missionBar;

  const rec = site.kind === 'site' ? sites.find((s) => s.id === site.id) : undefined;
  const siteLabel =
    fx?.siteLabel ??
    (site.kind === 'point' ? `${site.lat.toFixed(3)}°, ${site.lon.toFixed(3)}°` : (rec?.name ?? site.id));
  const tier = fx?.tierLabel ?? (rec ? `Tier ${rec.tier}` : site.kind === 'point' ? 'Tier B/C' : 'Tier –');
  const verdict = fx?.verdict ?? result.verdict;

  const share = async () => {
    const url = scenarioUrl();
    try {
      await navigator.clipboard.writeText(url);
      toast(t('mb.share.toast'), { tone: 'success' });
    } catch {
      window.history.replaceState(null, '', url);
      toast(t('mb.share.failed'));
    }
  };

  return (
    <header className="mission-bar" data-region="mission-bar">
      <div className="mb-brand">
        <span className="mb-logo" title={t('app.tagline')}>
          {t('app.name')}
        </span>
        <span className="mb-site truncate" title={siteLabel}>
          {siteLabel}
        </span>
        <Badge tone="tier" glyph={null}>
          {tier}
        </Badge>
      </div>

      <Segmented<ViewId>
        as="tabs"
        ariaLabel="Views"
        value={view}
        onChange={setView}
        options={VIEWS.map((v) => ({ value: v, label: t(`view.${v}`), title: t(`view.${v}.long`) }))}
      />

      <div className="mb-time">
        <LandingInput />
        <Segmented<DurationDays>
          size="sm"
          ariaLabel={t('mb.duration')}
          value={duration}
          onChange={setDuration}
          options={DURATIONS.map((d) => ({ value: d, label: `${d}d`, title: `${d} days` }))}
        />
        <MetReadout />
      </div>

      <JumpButtons />

      <div className="mb-end">
        <VerdictChip verdict={verdict} />
        <Segmented<Persona>
          size="sm"
          ariaLabel={t('mb.persona')}
          value={persona}
          onChange={setPersona}
          options={(['planner', 'educator'] as const).map((p) => ({
            value: p,
            label: t(`persona.${p}`),
            title: t(`persona.${p}.long`),
          }))}
        />
        <button type="button" className="mb-btn mb-share" onClick={share} title={t('mb.share.long')}>
          <span aria-hidden="true">⤴</span>
          <span className="mb-mid">{t('mb.share')}</span>
        </button>
      </div>
    </header>
  );
}
