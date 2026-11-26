/**
 * Estado global (Zustand). `config` es un objeto plano y serializable:
 * es lo único que viaja en el link, se compara y se exporta al PDF.
 */
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { brand } from '@/core/catalog';
import { applyChange, changeType, defaultConfig } from '@/core/rules';
import type { AdjustedItem, Config, Lang, LogoConfig, Notice, TextConfig, TypeId, Units, Value } from '@/core/types';

export type EnvId = 'estudio' | 'exterior';
export type Quality = 'alta' | 'media' | 'baja';
export type PanelTab = 'config' | 'tecnico';

export interface Snapshot {
  config: Config;
  thumb: string | null;
  at: number;
}

export interface UiState {
  lang: Lang;
  moneda: 'USD' | 'ARS';
  unidades: Units;
  /** Pestaña visible del panel lateral. */
  pestana: PanelTab;
  paso: string;
  env: EnvId;
  tractor: boolean;
  hotspots: boolean;
  autoFoco: boolean;
  preciosOcultos: boolean;
  vendedor: boolean;
  embed: boolean;
  luces: boolean;
  calidad: Quality;
  /** El usuario fijó la calidad con ?calidad=...: no se ajusta sola. */
  calidadFija: boolean;
  reducedMotion: boolean;
  modal: ModalId;
  cargandoEntorno: boolean;
}

export type ModalId = null | 'resumen' | 'cotizar' | 'comparar' | 'compartir' | 'atajos' | 'tecnico';

export interface AppNotice extends Notice {
  key: number;
  /** Elecciones que cambiaron al pasar de tipo (se listan en el aviso). */
  items?: AdjustedItem[];
  /** Configuración anterior: el aviso ofrece "Deshacer". */
  undo?: Config;
}

export interface AppState {
  config: Config;
  notices: AppNotice[];
  ui: UiState;
  /** Objetivos de animación (0..1). El modelo 3D los alcanza con amortiguación. */
  anim: Record<string, number>;
  /** Último cambio de opción: dispara el acercamiento de cámara. */
  lastChange: { foco: string; nonce: number } | null;
  camera: { preset: string; nonce: number };
  activeHotspot: string | null;
  compare: { a: Snapshot | null; b: Snapshot | null };
  /** El visor ya dibujó el primer cuadro. */
  ready: boolean;
  /** Se incrementa cada vez que se reconstruye el modelo 3D. */
  modelVersion: number;
  bumpModel: () => void;

  setOption: (key: string, value: Value, foco?: string) => void;
  setTipo: (tipo: TypeId) => void;
  setColor: (part: 'chasis' | 'caja', codigo: string) => void;
  setLogo: (patch: Partial<LogoConfig>) => void;
  setTexto: (patch: Partial<TextConfig>) => void;
  loadConfig: (cfg: Config) => void;
  reset: () => void;
  dismissNotice: (key: number) => void;
  undoNotice: (key: number) => void;
  setUi: (patch: Partial<UiState>) => void;
  setAnim: (id: string, value: number) => void;
  toggleAnim: (id: string) => void;
  setPreset: (preset: string) => void;
  setHotspot: (id: string | null) => void;
  saveSnapshot: (slot: 'a' | 'b', snap: Snapshot | null) => void;
  setReady: (v: boolean) => void;
}

let noticeKey = 1;
let nonce = 1;

const initialUi: UiState = {
  lang: brand.idiomaPorDefecto,
  moneda: brand.monedaPorDefecto,
  unidades: 'metric',
  pestana: 'config',
  paso: 'tipo',
  env: 'estudio',
  tractor: false,
  hotspots: true,
  autoFoco: true,
  preciosOcultos: false,
  vendedor: false,
  embed: false,
  luces: false,
  calidad: 'alta',
  calidadFija: false,
  reducedMotion: false,
  modal: null,
  cargandoEntorno: false,
};

const initialAnim = { accion: 0, lona: 0, susp: 0, elevado: 1 };

export const useStore = create<AppState>()(
  subscribeWithSelector((set, get) => ({
    config: defaultConfig('tolva'),
    notices: [],
    ui: initialUi,
    anim: { ...initialAnim },
    lastChange: null,
    camera: { preset: 'tresCuartos', nonce: 0 },
    activeHotspot: null,
    compare: { a: null, b: null },
    ready: false,
    modelVersion: 0,
    bumpModel: () => set((s) => ({ modelVersion: s.modelVersion + 1 })),

    setOption: (key, value, foco) => {
      const { config, notices } = applyChange(get().config, key, value);
      if (config === get().config) return;
      const added = notices.map((n) => ({ ...n, key: noticeKey++ }));
      set((s) => ({
        config,
        notices: [...s.notices.filter((n) => !added.some((a) => a.id === n.id)), ...added].slice(-3),
        lastChange: foco ? { foco, nonce: nonce++ } : s.lastChange,
        activeHotspot: null,
      }));
    },

    setTipo: (tipo) => {
      if (tipo === get().config.tipo) return;
      const prev = get().config;
      const { config, notices, adjusted } = changeType(prev, tipo);
      const list: AppNotice[] = notices.map((n) => ({ ...n, key: noticeKey++ }));
      if (adjusted.length) list.unshift({ id: 'cambio-tipo', text: { es: '' }, items: adjusted, undo: prev, key: noticeKey++ });
      set({
        config,
        notices: list.slice(0, 3),
        anim: { ...initialAnim },
        activeHotspot: null,
        camera: { preset: 'tresCuartos', nonce: nonce++ },
      });
    },

    setColor: (part, codigo) => set((s) => ({ config: { ...s.config, colores: { ...s.config.colores, [part]: codigo } } })),
    setLogo: (patch) => set((s) => ({ config: { ...s.config, logo: { ...s.config.logo, ...patch } } })),
    setTexto: (patch) => set((s) => ({ config: { ...s.config, texto: { ...s.config.texto, ...patch } } })),
    loadConfig: (cfg) => set({ config: cfg, notices: [], anim: { ...initialAnim }, activeHotspot: null }),
    reset: () =>
      set((s) => ({
        config: defaultConfig('tolva'),
        notices: [],
        anim: { ...initialAnim },
        activeHotspot: null,
        compare: { a: null, b: null },
        camera: { preset: 'tresCuartos', nonce: nonce++ },
        ui: { ...s.ui, paso: 'tipo', pestana: 'config', env: 'estudio', tractor: false, luces: false },
      })),
    dismissNotice: (key) => set((s) => ({ notices: s.notices.filter((n) => n.key !== key) })),
    undoNotice: (key) => {
      const n = get().notices.find((x) => x.key === key);
      if (!n?.undo) return;
      set({ config: n.undo, notices: [], anim: { ...initialAnim }, activeHotspot: null, camera: { preset: 'tresCuartos', nonce: nonce++ } });
    },
    setUi: (patch) =>
      set((s) => {
        const ui = { ...s.ui, ...patch };
        // En "Tu marca" se cierra todo (lona, compuertas, puertas) con la animación inversa: el lateral tiene que verse.
        if (patch.paso === 'personalizacion' && s.ui.paso !== 'personalizacion' && ((s.anim.accion ?? 0) > 0 || (s.anim.lona ?? 0) > 0)) {
          return { ui, anim: { ...s.anim, accion: 0, lona: 0 } };
        }
        return { ui };
      }),
    setAnim: (id, value) => set((s) => ({ anim: { ...s.anim, [id]: value } })),
    toggleAnim: (id) => set((s) => ({ anim: { ...s.anim, [id]: (s.anim[id] ?? 0) > 0.5 ? 0 : 1 } })),
    // La vista interior destapa la lona para que se vea adentro.
    setPreset: (preset) => set((s) => ({ camera: { preset, nonce: nonce++ }, anim: preset === 'interior' ? { ...s.anim, lona: 1 } : s.anim })),
    setHotspot: (id) => set({ activeHotspot: id }),
    saveSnapshot: (slot, snap) => set((s) => ({ compare: { ...s.compare, [slot]: snap } })),
    setReady: (v) => set({ ready: v }),
  })),
);
