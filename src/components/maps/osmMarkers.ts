import L from 'leaflet';

export function createOsmMarkerIcon(kind: 'customer' | 'fundi' | 'nearby', label?: string): L.DivIcon {
  const colors: Record<typeof kind, string> = {
    customer: '#2563eb',
    fundi: '#10b981',
    nearby: '#f59e0b',
  };
  const text = label ? `<span class="pf-osm-marker__label">${label}</span>` : '';
  return L.divIcon({
    className: 'pf-osm-marker-wrap',
    html: `<div class="pf-osm-marker pf-osm-marker--${kind}" style="--marker-color:${colors[kind]}">${text}</div>`,
    iconSize: [42, label ? 58 : 42],
    iconAnchor: [21, label ? 50 : 21],
  });
}

export const OSM_TILES = {
  light: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
} as const;
