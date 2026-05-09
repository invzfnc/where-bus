import HomePage from './home/page';

export interface Stop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface Route {
  id: string;
  name: string;
  longName: string;
}

export type UIState = 'STANDBY' | 'SEARCHING' | 'STOP_SELECTED' | 'ROUTE_SELECTED';

export default HomePage;
