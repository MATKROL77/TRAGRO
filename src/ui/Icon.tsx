import type { SVGProps } from 'react';

const P: Record<string, string> = {
  camara: 'M4 8h3l1.5-2h7L17 8h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  estudio: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9',
  exterior: 'M3 18h18M5 18l5-8 4 6 2-3 3 5M17 7.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  play: 'M8 5.5v13l11-6.5z',
  rebobinar: 'M4 12a8 8 0 1 0 2.6-5.9M4 4.5V9h4.5',
  pantalla: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  descargar: 'M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 20h14',
  compartir: 'M16 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM6 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM16 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM8.2 10.9l5.6-3.3M8.2 13.1l5.6 3.3',
  comparar: 'M9 4H5v16h4M15 4h4v16h-4M12 2v20',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5.5M12 7.6v.2',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  alerta: 'M12 4l9 16H3zM12 10v4.5M12 17.3v.2',
  x: 'M6 6l12 12M18 6L6 18',
  chevronAbajo: 'M6 9l6 6 6-6',
  chevronArriba: 'M6 15l6-6 6 6',
  chevronDer: 'M9 6l6 6-6 6',
  chevronIzq: 'M15 6l-6 6 6 6',
  mas: 'M12 5v14M5 12h14',
  menos: 'M5 12h14',
  regla: 'M3 16.5L16.5 3 21 7.5 7.5 21zM7 12.5l2 2M10 9.5l2 2M13 6.5l2 2',
  rueda: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 3v6M12 15v6M3 12h6M15 12h6',
  herramienta: 'M14.5 6.5a4 4 0 0 0 5 5L11 20a2.1 2.1 0 0 1-3-3l8.5-8.5a4 4 0 0 0-2-2z',
  caja: 'M3 8l9-4 9 4v8l-9 4-9-4zM3 8l9 4 9-4M12 12v8',
  paleta: 'M12 3a9 9 0 0 0 0 18c1.5 0 2-1 2-2s-.6-1.5-.6-2.5S14.5 15 16 15h2a3 3 0 0 0 3-3c0-5-4-9-9-9zM7.5 12.5v.2M9 8.5v.2M13 7v.2M16.5 9.5v.2',
  luz: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.3 1 2.1h5c0-.8.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  ojo: 'M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  ojoNo: 'M4 4l16 16M9.9 5.8A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3 3.7M6.3 7.6A15.600 15.600 0 0 0 2.500 12s3.500 6.500 9.500 6.500c1.300 0 2.500-.3 3.600-.8M9.900 9.900a3 3 0 0 0 4.200 4.200',
  teclado: 'M3 7h18v10H3zM7 10.5v.2M10.5 10.5v.2M14 10.5v.2M17.500 10.500v.2M8 14h8',
  reiniciar: 'M20 12a8 8 0 1 1-2.600-5.900M20 4.500V9h-4.500',
  whatsapp: 'M4 20l1.300-4.200A8 8 0 1 1 8.300 19zM9 8.500c0 3 2.500 5.500 5.500 5.500l1-1.500-2-1-.8.800c-.8-.4-1.500-1.100-1.900-1.900l.8-.8-1-2z',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  pdf: 'M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 16.500h6',
  link: 'M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1',
  punto: 'M12 21s6.500-5.800 6.500-11A6.500 6.500 0 0 0 5.500 10c0 5.200 6.500 11 6.500 11zM12 12.500a2.500 2.500 0 1 0 0-5 2.500 2.500 0 0 0 0 5z',
  foco: 'M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM12 2v3M12 19v3M2 12h3M19 12h3',
  camion: 'M2 7h11v9H2zM13 10h4.500l3.500 3v3h-8zM6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  balanza: 'M12 4v16M6 20h12M5 8h14M5 8l-3 6a3 3 0 0 0 6 0zM19 8l-3 6a3 3 0 0 0 6 0z',
  subir: 'M12 20V9M7.500 13l4.500-4.500 4.500 4.500M5 4h14',
  lona: 'M3 9c3-3 15-3 18 0v9H3zM3 13h18M8 9v9M16 9v9',
  eje: 'M4 12h16M6 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM18 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  texto: 'M5 6h14M12 6v13M9 19h6',
  menu: 'M4 7h16M4 12h16M4 17h16',
  globo: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.500 2.500 3.800 5.500 3.800 9s-1.300 6.500-3.800 9c-2.500-2.500-3.800-5.500-3.800-9S9.500 5.500 12 3z',
  guardar: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
  intercambiar: 'M7 7h13l-3.500-3.500M17 17H4l3.500 3.500',
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 20, ...rest }: { name: string; size?: number } & SVGProps<SVGSVGElement>) {
  const fill = name === 'play';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      <path d={P[name] ?? P.info} />
    </svg>
  );
}
