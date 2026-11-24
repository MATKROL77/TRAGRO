import { create } from 'zustand';
import { createDefaultConfig, getGroup, getModel, rowsRange } from '../domain/catalog';
import { applySelection, resolve } from '../domain/rules';
import { defaultFieldParams, getCrop, type FieldParams } from '../domain/agronomy';
import type { Destination } from '../domain/pricing';
import type { Configuration, Lang, Notice, UnitSystem } from '../domain/types';
import { transportDef } from '../domain/transport';
import brand from '../config/brand.json';

export type SceneId = 'studio' | 'field' | 'road';
export type CamPreset = 'front34' | 'side' | 'rear' | 'top' | 'rowUnit' | 'hoppers' | 'ground';
export type ModalId = null | 'summary' | 'quote' | 'compare';
export type Quality = 'high' | 'medium' | 'low';

export interface NoticeEvent { id: number; items: Notice[] }

export interface AppState {
  config: Configuration;
  notice: NoticeEvent | null;
  lang: Lang;
  langReady: boolean;
  units: UnitSystem;
  destination: Destination;
  transportProfile: string;
  field: FieldParams;
  logoUrl: string | null;
  step: number;
  scene: SceneId;
  pose: 'work' | 'transport';
  sowing: boolean;
  detail: boolean;
  exploded: boolean;
  camRequest: { preset: CamPreset; n: number; instant?: boolean } | null;
  focusRequest: { zone: string; n: number } | null;
  autoFocus: boolean;
  showTractor: boolean;
  showHotspots: boolean;
  stubble: 'soy' | 'maize';
  quality: Quality;
  modal: ModalId;
  slots: { A?: Configuration; B?: Configuration };
  feria: boolean;
  embed: boolean;
  hidePrices: boolean;
  demo: boolean;
  viewerReady: boolean;
  webgl: boolean;
  hotspot: string | null;
  panelTab: 'config' | 'perf';
  setPanelTab: (t: 'config' | 'perf') => void;

  setLang: (l: Lang) => void;
  setLangReady: (b: boolean) => void;
  setUnits: (u: UnitSystem) => void;
  setDestination: (d: Destination) => void;
  setTransportProfile: (p: string) => void;
  setField: (p: Partial<FieldParams>) => void;
  setCrop: (id: string) => void;
  setModel: (id: string) => void;
  setRows: (n: number) => void;
  setSpacing: (cm: number) => void;
  select: (group: string, option: string) => void;
  setColors: (c: Partial<Configuration['colors']>) => void;
  setText: (t: string) => void;
  setLogo: (url: string | null) => void;
  loadConfig: (c: Configuration) => void;
  reset: () => void;
  setStep: (n: number) => void;
  setScene: (s: SceneId) => void;
  setPose: (p: 'work' | 'transport') => void;
  setSowing: (b: boolean) => void;
  setDetail: (b: boolean) => void;
  setExploded: (b: boolean) => void;
  requestCam: (p: CamPreset, instant?: boolean) => void;
  focus: (zone: string) => void;
  toggle: (k: 'autoFocus' | 'showTractor' | 'showHotspots' | 'hidePrices') => void;
  setStubble: (s: 'soy' | 'maize') => void;
  setQuality: (q: Quality) => void;
  openModal: (m: ModalId) => void;
  saveSlot: (s: 'A' | 'B') => void;
  dismissNotice: () => void;
  setMode: (p: { feria?: boolean; embed?: boolean }) => void;
  setDemo: (b: boolean) => void;
  setViewerReady: (b: boolean) => void;
  setWebgl: (b: boolean) => void;
  setHotspot: (id: string | null) => void;
}

let noticeId = 0;
let camN = 0;

function withNotices(set: (p: Partial<AppState>) => void, r: { config: Configuration; notices: Notice[] }) {
  set({ config: r.config, notice: r.notices.length ? { id: ++noticeId, items: r.notices } : null });
}

export const useStore = create<AppState>((set, get) => ({
  config: createDefaultConfig(),
  notice: null,
  lang: brand.defaultLanguage as Lang,
  langReady: true,
  units: 'metric',
  destination: 'export',
  transportProfile: transportDef.defaultProfile,
  field: defaultFieldParams(),
  logoUrl: null,
  step: 0,
  scene: 'studio',
  pose: 'work',
  sowing: false,
  detail: false,
  exploded: false,
  camRequest: null,
  focusRequest: null,
  autoFocus: true,
  showTractor: true,
  showHotspots: true,
  stubble: 'soy',
  quality: 'high',
  modal: null,
  slots: {},
  feria: false,
  embed: false,
  hidePrices: false,
  demo: false,
  viewerReady: false,
  webgl: true,
  hotspot: null,
  panelTab: 'config',
  setPanelTab: (panelTab) => set({ panelTab }),

  setLang: (lang) => set({ lang }),
  setLangReady: (langReady) => set({ langReady }),
  setUnits: (units) => set({ units }),
  setDestination: (destination) => set({ destination }),
  setTransportProfile: (transportProfile) => set({ transportProfile }),
  setField: (p) => set({ field: { ...get().field, ...p } }),
  setCrop: (id) => {
    const c = getCrop(id);
    set({ field: { ...get().field, crop: c.id, seedsPerM: c.seedsPerM } });
  },
  setModel: (id) => {
    const m = getModel(id);
    const cfg = get().config;
    const r = resolve({ ...cfg, model: m.id, rows: m.defaultRows, spacingCm: cfg.spacingCm });
    withNotices(set, { config: r.config, notices: r.notices.filter((n) => n.ruleId !== 'rowsRange') });
    get().focus('overview');
  },
  setRows: (n) => {
    const cfg = get().config;
    const range = rowsRange(getModel(cfg.model), cfg.spacingCm);
    const rows = Math.min(range.max, Math.max(range.min, Math.round(n)));
    if (rows === cfg.rows) return;
    withNotices(set, resolve({ ...cfg, rows }));
  },
  setSpacing: (spacingCm) => {
    const cfg = get().config;
    withNotices(set, resolve({ ...cfg, spacingCm }));
  },
  select: (group, option) => {
    const cfg = get().config;
    if (cfg.selections[group] === option) return;
    withNotices(set, applySelection(cfg, group, option));
    const g = getGroup(group);
    if (g?.focus) get().focus(g.focus);
  },
  setColors: (c) => set({ config: { ...get().config, colors: { ...get().config.colors, ...c } } }),
  setText: (text) => set({ config: { ...get().config, text: text.slice(0, 28) } }),
  setLogo: (logoUrl) => set({ logoUrl }),
  loadConfig: (c) => set({ config: resolve(c).config, notice: null }),
  reset: () => set({ config: createDefaultConfig(), notice: null, step: 0, pose: 'work', sowing: false, detail: false, exploded: false, scene: 'studio' }),
  setStep: (step) => set({ step }),
  setScene: (scene) => {
    const s: Partial<AppState> = { scene, detail: false, exploded: false };
    if (scene === 'road') {
      s.pose = 'transport';
      s.sowing = true; // en ruta, "sowing" = andando
    }
    if (scene === 'field') {
      s.pose = 'work';
      s.sowing = true;
    } else if (scene !== 'road') s.sowing = false;
    set(s);
    get().requestCam(scene === 'field' ? 'ground' : 'front34');
  },
  setPose: (pose) => set({ pose, sowing: get().scene === 'road' ? pose === 'transport' && get().sowing : pose === 'transport' ? false : get().sowing }),
  setSowing: (sowing) => {
    if (sowing && get().scene === 'studio') {
      get().setScene('field');
      return;
    }
    set({ sowing });
  },
  setDetail: (detail) => {
    if (detail) set({ scene: 'studio', pose: 'work', sowing: false, hotspot: null });
    set({ detail, exploded: false });
    get().requestCam(detail ? 'rowUnit' : 'front34');
  },
  setExploded: (exploded) => set({ exploded }),
  requestCam: (preset, instant) => set({ camRequest: { preset, n: ++camN, instant } }),
  focus: (zone) => {
    if (!get().autoFocus) return;
    set({ focusRequest: { zone, n: ++camN } });
  },
  toggle: (k) => set({ [k]: !get()[k] } as Partial<AppState>),
  setStubble: (stubble) => set({ stubble }),
  setQuality: (quality) => set({ quality }),
  openModal: (modal) => set({ modal }),
  saveSlot: (s) => set({ slots: { ...get().slots, [s]: structuredClone(get().config) } }),
  dismissNotice: () => set({ notice: null }),
  setMode: (p) => set({ feria: p.feria ?? get().feria, embed: p.embed ?? get().embed }),
  setDemo: (demo) => set({ demo }),
  setViewerReady: (viewerReady) => set({ viewerReady }),
  setWebgl: (webgl) => set({ webgl }),
  setHotspot: (hotspot) => set({ hotspot }),
}));
