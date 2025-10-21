"use client";

import { useEffect, useRef, useCallback } from 'react';
import { Session, SupabaseClient } from '@supabase/supabase-js';
import L from 'leaflet';
import * as turf from '@turf/turf';
import { showError, showSuccess } from '@/utils/toast';
import { isPointInPolygon } from '@/utils/geometry';
import { MIN_CLAIM_AREA_SQ_METERS } from '@/utils/territoryUtils';
import { usePlayerDeath } from '@/hooks/usePlayerDeath';
import { RESPAWN_DELAY_SECONDS } from '@/utils/gameConstants';

interface Player {
  id: string;
  user_id: string;
  username: string;
  current_lat: number;
  current_lng: number;
  territory: L.LatLngExpression[][];
  is_alive: boolean;
  last_killed_at: string | null;
  score: number;
  current_path: L.LatLngExpression[];
}

interface UseGameLogicProps {
  session: Session | null;
  supabase: SupabaseClient;
  username: string | null;
  isPlayerAlive: boolean;
  playerTerritory: L.LatLngExpression[][];
  otherPlayers: Player[];
  setCurrentLocation: React.Dispatch<React.SetStateAction<{ lat: number; lng: number } | null>>;
  setCurrentPath: React.Dispatch<React.SetStateAction<L.LatLngExpression[]>>;
  setIsPlayerAlive: React.Dispatch<React.SetStateAction<boolean>>;
  setRespawnTimer: React.Dispatch<React.SetStateAction<number>>;
  setOtherPlayers: React.Dispatch<React.SetStateAction<Player[]>>;
  setPlayerTerritory: React.Dispatch<React.SetStateAction<L.LatLngExpression[][]>>;
  setPlayerScore: React.Dispatch<React.SetStateAction<number>>;
}

export const useGameLogic = ({
  session,
  supabase,
  username,
  isPlayerAlive,
  playerTerritory,
  otherPlayers,
  setCurrentLocation,
  setCurrentPath,
  setIsPlayerAlive,
  setRespawnTimer,
  setOtherPlayers,
  setPlayerTerritory,
  setPlayerScore,
}: UseGameLogicProps) => {
  const watchId = useRef<number | null>(null);

  const stopWatchingLocation = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
      showSuccess('GPS tracking stopped.');
    }
  }, []);

  const { handlePlayerDeath } = usePlayerDeath({
    session,
    supabase,
    stopWatchingLocation,
    setCurrentPath,
    setCurrentLocation,
    setIsPlayerAlive,
    setRespawnTimer,
  });

  useEffect(() => {
    if (!session) return;

    const startWatchingLocation = () => {
      if (navigator.geolocation) {
        watchId.current = navigator.geolocation.watchPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;
            const newLocation: L.LatLngExpression = [latitude, longitude];
            setCurrentLocation({ lat: latitude, lng: longitude });

            setCurrentPath(async (prevPath) => {
              const updatedPath = [...prevPath, newLocation];

              // 1. Check for self-intersection of the current path
              if (updatedPath.length >= 3) {
                const newSegmentStart = updatedPath[updatedPath.length - 2];
                const newSegmentEnd = updatedPath[updatedPath.length - 1];

                const newSegmentTurf = turf.lineString([
                  [typeof newSegmentStart[1] === 'number' ? newSegmentStart[1] : newSegmentStart.lng, typeof newSegmentStart[0] === 'number' ? newSegmentStart[0] : newSegmentStart.lat],
                  [typeof newSegmentEnd[1] === 'number' ? newSegmentEnd[1] : newSegmentEnd.lng, typeof newSegmentEnd[0] === 'number' ? newSegmentEnd[0] : newSegmentEnd.lat],
                ]);

                for (let i = 0; i < updatedPath.length - 3; i++) {
                  const existingSegmentStart = updatedPath[i];
                  const existingSegmentEnd = updatedPath[i + 1];

                  const existingSegmentTurf = turf.lineString([
                    [typeof existingSegmentStart[1] === 'number' ? existingSegmentStart[1] : existingSegmentStart.lng, typeof existingSegmentStart[0] === 'number' ? existingSegmentStart[0] : existingSegmentStart.lat],
                    [typeof existingSegmentEnd[1] === 'number' ? existingSegmentEnd[1] : existingSegmentEnd.lng, typeof existingSegmentEnd[0] === 'number' ? existingSegmentEnd[0] : existingSegmentEnd.lat],
                  ]);

                  if (turf.lineIntersect(newSegmentTurf, existingSegmentTurf).features.length > 0) {
                    handlePlayerDeath('You crossed your own path!');
                    return [];
                  }
                }
              }

              // 2. Check for intersection with own claimed territory
              if (updatedPath.length >= 2 && playerTerritory.length > 0) {
                const currentPathTurf = turf.lineString(updatedPath.map(coord => {
                  const lat = typeof coord[0] === 'number' ? coord[0] : coord.lat;
                  const lng = typeof coord[1] === 'number' ? coord[1] : coord.lng;
                  return [lng, lat];
                }));

                for (const polygonCoords of playerTerritory) {
                  const ownTerritoryTurfCoords = polygonCoords.map(coord => {
                    const lat = typeof coord[0] === 'number' ? coord[0] : coord.lat;
                    const lng = typeof coord[1] === 'number' ? coord[1] : coord.lng;
                    return [lng, lat];
                  });
                  if (ownTerritoryTurfCoords.length > 0 && (ownTerritoryTurfCoords[0][0] !== ownTerritoryTurfCoords[ownTerritoryTurfCoords.length - 1][0] || ownTerritoryTurfCoords[0][1] !== ownTerritoryTurfCoords[ownTerritoryTurfCoords.length - 1][1])) {
                    ownTerritoryTurfCoords.push(ownTerritoryTurfCoords[0]);
                  }
                  if (ownTerritoryTurfCoords.length >= 4) {
                    try {
                      const ownTerritoryPolygon = turf.polygon([ownTerritoryTurfCoords]);
                      if (turf.lineIntersect(currentPathTurf, ownTerritoryPolygon).features.length > 0) {
                        handlePlayerDeath('You crossed your own territory!');
                        return [];
                      }
                    } catch (e) {
                      console.error("Error checking intersection with own territory:", e, polygonCoords);
                    }
                  }
                }
              }

              // 3. Check for collisions with other players' territories
              const currentPlayerLatLng: L.LatLngExpression = [latitude, longitude];
              let killedByPlayer: Player | null = null;

              for (const otherPlayer of otherPlayers) {
                if (otherPlayer.is_alive && otherPlayer.territory && otherPlayer.territory.length > 0) {
                  for (const polygon of otherPlayer.territory) {
                    if (isPointInPolygon(currentPlayerLatLng, polygon)) {
                      killedByPlayer = otherPlayer;
                      break;
                    }
                  }
                }
                if (killedByPlayer) break;
              }

              if (killedByPlayer) {
                handlePlayerDeath(`You were killed by ${killedByPlayer.username}!`);
                return [];
              }

              // 4. Check for killing other players by crossing their path
              if (updatedPath.length >= 2) {
                const currentPlayerPathTurf = turf.lineString(updatedPath.map(coord => {
                  const lat = typeof coord[0] === 'number' ? coord[0] : coord.lat;
                  const lng = typeof coord[1] === 'number' ? coord[1] : coord.lng;
                  return [lng, lat];
                }));

                for (const otherPlayer of otherPlayers) {
                  if (otherPlayer.is_alive && otherPlayer.current_path && otherPlayer.current_path.length >= 2) {
                    const otherPlayerPathTurf = turf.lineString(otherPlayer.current_path.map(coord => {
                      const lat = typeof coord[0] === 'number' ? coord[0] : coord.lat;
                      const lng = typeof coord[1] === 'number' ? coord[1] : coord.lng;
                      return [lng, lat];
                    }));

                    if (turf.lineIntersect(currentPlayerPathTurf, otherPlayerPathTurf).features.length > 0) {
                      showSuccess(`You killed ${otherPlayer.username} by crossing their path!`);
                      await supabase
                        .from('players')
                        .update({
                          is_alive: false,
                          current_lat: null,
                          current_lng: null,
                          last_killed_at: new Date().toISOString(),
                          current_path: [],
                          territory: [],
                          score: 0,
                          updated_at: new Date().toISOString(),
                        })
                        .eq('user_id', otherPlayer.user_id);
                    }
                  }
                }
              }

              // If no death, update current player's location and path in Supabase
              const { error } = await supabase
                .from('players')
                .update({
                  current_lat: latitude,
                  current_lng: longitude,
                  current_path: updatedPath,
                  updated_at: new Date().toISOString()
                })
                .eq('user_id', session.user.id);

              if (error) {
                console.error('Error updating player location or path:', error);
              }

              return updatedPath;
            });
          },
          (error) => {
            showError('Error getting location: ' + error.message);
            console.error('Geolocation error:', error);
          },
          {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 5000,
          }
        );
        showSuccess('GPS tracking started!');
      } else {
        showError('Geolocation is not supported by your browser.');
      }
    };

    if (username && isPlayerAlive) {
      startWatchingLocation();
    } else if (!isPlayerAlive) {
      stopWatchingLocation();
    }

    return () => {
      stopWatchingLocation();
    };
  }, [session, supabase, username, isPlayerAlive, otherPlayers, playerTerritory, handlePlayerDeath, setCurrentLocation, setCurrentPath, setIsPlayerAlive, setRespawnTimer, stopWatchingLocation]);

  return { stopWatchingLocation, handlePlayerDeath };
};