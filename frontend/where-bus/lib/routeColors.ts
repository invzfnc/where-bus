export const ROUTE_COLORS = {
  mrtFeeder: {
    light: '#5e6673',
    dark: '#F0F2F3',
  },
  rapidKl: {
    light: '#880808',
    dark: '#9CAF88',
  },
} as const;

interface TransitColorInput {
  category?: string;
  id?: string;
  name?: string;
  shortName?: string;
}

export function isMrtFeederRoute(route: TransitColorInput): boolean {
  if (route.category) return route.category === 'rapid-bus-mrtfeeder';
  const routeName = route.name ?? route.shortName ?? route.id ?? '';
  return /^\d+$/.test(routeName);
}

export function isMrtFeederStop(stop: TransitColorInput): boolean {
  return stop.category === 'rapid-bus-mrtfeeder';
}

function colorFor(isMrtFeeder: boolean, isDarkMode: boolean): string {
  const palette = isMrtFeeder ? ROUTE_COLORS.mrtFeeder : ROUTE_COLORS.rapidKl;
  return isDarkMode ? palette.dark : palette.light;
}

export function getRouteColor(route: TransitColorInput, isDarkMode = false): string {
  return colorFor(isMrtFeederRoute(route), isDarkMode);
}

export function getStopColor(stop: TransitColorInput, isDarkMode = false): string {
  return colorFor(isMrtFeederStop(stop), isDarkMode);
}
