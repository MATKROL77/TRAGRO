/** Utilidades puras de los links compartibles. */

/** URL de la ruta /embed con la misma configuración (para pegar en un iframe). */
export function embedUrl(href: string, code: string): string {
  const u = new URL(href);
  const base = u.pathname.replace(/\/embed\/?$/, '/').replace(/[^/]*$/, '');
  const out = new URL(`${base}embed`, u.origin);
  if (code) out.searchParams.set('c', code);
  return out.toString();
}

/** Código listo para pegar en la web del fabricante. */
export function embedSnippet(href: string, code: string, title: string): string {
  const safeTitle = title.replace(/"/g, '&quot;');
  return `<iframe src="${embedUrl(href, code)}" title="${safeTitle}" style="width:100%;height:720px;border:0" allow="fullscreen" loading="lazy"></iframe>`;
}
