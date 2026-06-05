type MarkerKind = 'customer' | 'fundi' | 'nearby';

const COLORS: Record<MarkerKind, { fill: string; ring: string }> = {
  customer: { fill: '#2563eb', ring: 'rgba(37,99,235,0.35)' },
  fundi: { fill: '#10b981', ring: 'rgba(16,185,129,0.35)' },
  nearby: { fill: '#6366f1', ring: 'rgba(99,102,241,0.35)' },
};

function markerSvg(kind: MarkerKind, label?: string): string {
  const { fill, ring } = COLORS[kind];
  const size = kind === 'nearby' ? 28 : 42;
  const labelSvg = label
    ? `<text x="21" y="52" text-anchor="middle" font-family="system-ui,sans-serif" font-size="10" font-weight="700" fill="#0f172a">${label.slice(0, 8)}</text>`
    : '';
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="42" height="${label ? 58 : 42}" viewBox="0 0 42 ${label ? 58 : 42}">
      <circle cx="21" cy="21" r="18" fill="${ring}" />
      <circle cx="21" cy="21" r="${size / 2}" fill="${fill}" stroke="#fff" stroke-width="3" />
      <circle cx="21" cy="21" r="6" fill="#fff" opacity="0.9" />
      ${labelSvg}
    </svg>
  `.trim();
}

export function createGoogleMarkerIcon(
  kind: MarkerKind,
  label?: string,
): google.maps.Icon | undefined {
  if (typeof google === 'undefined') return undefined;
  const svg = markerSvg(kind, label);
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(42, label ? 58 : 42),
    anchor: new google.maps.Point(21, 21),
  };
}
