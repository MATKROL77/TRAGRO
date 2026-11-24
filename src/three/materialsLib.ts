import { createMaterials, type MaterialLibrary } from './materials';

let lib: MaterialLibrary | null = null;

/** Biblioteca única de materiales (se crea al primer uso). */
export function materialLibrary(): MaterialLibrary {
  if (!lib) lib = createMaterials();
  return lib;
}
