// src/types/game.ts
import L from 'leaflet';

export interface Player {
  id: string;
  user_id: string;
  username: string;
  current_lat: number | null;
  current_lng: number | null;
  territory: L.LatLngExpression[][];
  is_alive: boolean;
  last_killed_at: string | null;
  score: number;
  current_path: L.LatLngExpression[];
}