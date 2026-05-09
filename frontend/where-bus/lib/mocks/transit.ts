// TODO: replace with API call — all exports here are static mock data for UI development

export interface Route {
  routeId: string;
  from: string;
  to: string;
  stopCount: number;
  durationMin: number;
  status: string;
}

export interface Stop {
  stopId: string;
  name: string;
  routeCount: number;
  distanceMeters?: number;
}

export interface Bus {
  busId: string;
  routeId: string;
  eta: number;
  arrivalTime: string;
  stopsAway: number;
  status: 'approaching' | 'on route' | 'departing depot';
}

export interface RouteStop {
  stopId: string;
  name: string;
  sequence: number;
  lat: number;
  lng: number;
}

// TODO: replace with API call to GET /api/transit/search?q=...
export const MOCK_ROUTES: Route[] = [
  { routeId: 'T789', from: 'UM', to: 'Mid Valley', stopCount: 15, durationMin: 22, status: 'runs 6am–11pm' },
  { routeId: 'S1040', from: 'KL Sentral', to: 'Subang Jaya', stopCount: 23, durationMin: 35, status: 'every 20m' },
  { routeId: 'PJ06', from: 'SS15', to: 'Sunway Pyramid', stopCount: 18, durationMin: 28, status: 'express' },
  { routeId: 'U301', from: 'UM', to: 'Bangsar', stopCount: 12, durationMin: 18, status: 'every 15m' },
];

// TODO: replace with API call to GET /api/transit/search?q=...
export const MOCK_STOPS: Stop[] = [
  { stopId: '1005840', name: 'UM Main Gate', routeCount: 4, distanceMeters: 120 },
  { stopId: '1005841', name: 'UM Library', routeCount: 3 },
  { stopId: '1005842', name: 'Mid Valley Megamall', routeCount: 6 },
  { stopId: '1005843', name: 'KL Sentral Station', routeCount: 8 },
  { stopId: '1005844', name: 'Bangsar LRT', routeCount: 5 },
];

// TODO: replace with API call to GET /api/eta?routeId=...&stopId=...
export const MOCK_BUSES: Bus[] = [
  { busId: 'T789-04', routeId: 'T789', eta: 4, arrivalTime: '14:32', stopsAway: 2, status: 'approaching' },
  { busId: 'T789-07', routeId: 'T789', eta: 12, arrivalTime: '14:40', stopsAway: 6, status: 'on route' },
  { busId: 'T789-11', routeId: 'T789', eta: 24, arrivalTime: '14:52', stopsAway: 0, status: 'departing depot' },
];

// TODO: replace with API call to GET /api/transit/routes/{routeId}/path
export const MOCK_ROUTE_STOPS: RouteStop[] = [
  { stopId: '1005840', name: 'UM Main Gate', sequence: 1, lat: 3.1209, lng: 101.6559 },
  { stopId: '1005841', name: 'UM Library', sequence: 2, lat: 3.1180, lng: 101.6530 },
  { stopId: '1005845', name: 'Bangsar Village', sequence: 3, lat: 3.1295, lng: 101.6744 },
  { stopId: '1005842', name: 'Mid Valley Megamall', sequence: 4, lat: 3.1190, lng: 101.6774 },
];

export const NEAREST_STOP: Stop = MOCK_STOPS[0];
