import rulesJson from '../config/rules.json';
import { catalog, getGroup, getModel, rowsRange, widthM } from './catalog';
import type { Condition, Configuration, Notice, OptionStatus, RuleDef } from './types';

export const rules = (rulesJson as unknown as { rules: RuleDef[] }).rules;

export function evalCondition(c: Condition, cfg: Configuration): boolean {
  const model = getModel(cfg.model);
  if (c.tier && !c.tier.includes(model.tier)) return false;
  if (c.model && !c.model.includes(model.id)) return false;
  const w = widthM(cfg);
  if (c.widthGt !== undefined && !(w > c.widthGt + 1e-9)) return false;
  if (c.widthLte !== undefined && !(w <= c.widthLte + 1e-9)) return false;
  if (c.rowsGt !== undefined && !(cfg.rows > c.rowsGt)) return false;
  if (c.sel) {
    for (const [g, allowed] of Object.entries(c.sel)) {
      if (!allowed.includes(cfg.selections[g])) return false;
    }
  }
  return true;
}

/** Regla "dura": su condición no depende de selecciones del usuario (modelo, ancho, surcos). */
export function isHardRule(r: RuleDef): boolean {
  return !r.if.sel;
}

export function isGroupVisible(groupId: string, cfg: Configuration): boolean {
  const g = getGroup(groupId);
  if (!g) return false;
  return g.visibleIf ? evalCondition(g.visibleIf, cfg) : true;
}

function firstAllowed(groupId: string, allowed: string[], cfg: Configuration): string {
  const g = getGroup(groupId);
  if (!g) return allowed[0];
  // Preferimos el default si está permitido, si no el primero permitido que no esté bloqueado por otra regla dura.
  const candidates = [g.default, ...allowed].filter((o) => allowed.includes(o));
  for (const o of candidates) {
    const trial = { ...cfg, selections: { ...cfg.selections, [groupId]: o } };
    if (!hardViolations(trial).some((r) => r.then.group === groupId)) return o;
  }
  return candidates[0];
}

function hardViolations(cfg: Configuration): RuleDef[] {
  return rules.filter((r) => isHardRule(r) && evalCondition(r.if, cfg) && !r.then.allowed.includes(cfg.selections[r.then.group]));
}

/**
 * Lleva la configuración a un estado válido. `changedGroup` es lo último que tocó el usuario:
 * si el usuario eligió una opción que contradice una regla blanda, se revierte el disparador (la última elección gana).
 */
export function resolve(input: Configuration, changedGroup?: string): { config: Configuration; notices: Notice[] } {
  let cfg: Configuration = { ...input, selections: { ...input.selections } };
  const notices: Notice[] = [];
  // Surcos dentro de rango.
  const model = getModel(cfg.model);
  const range = rowsRange(model, cfg.spacingCm);
  if (cfg.rows < range.min || cfg.rows > range.max) {
    const to = Math.min(range.max, Math.max(range.min, cfg.rows));
    notices.push({ ruleId: 'rowsRange', group: 'rows', from: String(cfg.rows), to: String(to) });
    cfg = { ...cfg, rows: to };
  }
  for (let iter = 0; iter < 12; iter++) {
    let changed = false;
    for (const r of rules) {
      if (!evalCondition(r.if, cfg)) continue;
      const current = cfg.selections[r.then.group];
      if (r.then.allowed.includes(current)) continue;
      if (r.revert && changedGroup === r.then.group && cfg.selections[r.revert.group] !== r.revert.to) {
        notices.push({ ruleId: r.id, group: r.revert.group, from: cfg.selections[r.revert.group], to: r.revert.to });
        cfg.selections[r.revert.group] = r.revert.to;
      } else {
        const to = firstAllowed(r.then.group, r.then.allowed, cfg);
        notices.push({ ruleId: r.id, group: r.then.group, from: current, to });
        cfg.selections[r.then.group] = to;
      }
      changed = true;
    }
    if (!changed) break;
  }
  return { config: cfg, notices: dedupe(notices) };
}

function dedupe(n: Notice[]): Notice[] {
  const seen = new Map<string, Notice>();
  for (const x of n) {
    const k = x.group;
    const prev = seen.get(k);
    seen.set(k, prev ? { ...x, from: prev.from } : x);
  }
  return [...seen.values()].filter((x) => x.from !== x.to);
}

export function applySelection(cfg: Configuration, group: string, option: string) {
  return resolve({ ...cfg, selections: { ...cfg.selections, [group]: option } }, group);
}

/** Estado de una opción para la UI: ok, deshabilitada (con reglas) o "ajusta" otras elecciones. */
export function optionStatus(cfg: Configuration, group: string, option: string): OptionStatus {
  if (cfg.selections[group] === option) return { state: 'ok' };
  const trial: Configuration = { ...cfg, selections: { ...cfg.selections, [group]: option } };
  const hard = hardViolations(trial).filter((r) => r.then.group === group).map((r) => r.id);
  if (hard.length) return { state: 'disabled', ruleIds: hard };
  const { config, notices } = applySelection(cfg, group, option);
  if (config.selections[group] !== option) {
    return { state: 'disabled', ruleIds: notices.map((n) => n.ruleId) };
  }
  // Si para cumplir una regla habría que usar una opción bloqueada por una regla dura, deshabilitamos.
  const blocked = notices.filter((n) => hardViolations(config).some((r) => r.then.group === n.group));
  if (blocked.length) return { state: 'disabled', ruleIds: blocked.map((n) => n.ruleId) };
  return notices.length ? { state: 'adjusts', notices } : { state: 'ok' };
}

export function isValid(cfg: Configuration): boolean {
  return rules.every((r) => !evalCondition(r.if, cfg) || r.then.allowed.includes(cfg.selections[r.then.group]));
}

export function allGroupIds(): string[] {
  return catalog.groups.map((g) => g.id);
}
