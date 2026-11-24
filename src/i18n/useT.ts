import { useCallback } from 'react';
import { useStore } from '../state/store';
import { translate, type TFn } from './index';

export function useT(): TFn {
  const lang = useStore((s) => s.lang);
  useStore((s) => s.langReady);
  return useCallback<TFn>((key, vars) => translate(lang, key, vars), [lang]);
}
