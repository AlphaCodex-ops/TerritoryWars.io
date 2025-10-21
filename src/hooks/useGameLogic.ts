"use client";

import { useEffect, useRef, useCallback, useState } from 'react';
import { Session, SupabaseClient } from '@supabase/supabase-js';
import L from 'leaflet';
import * as turf from '@turf/turf';
import { showError, showSuccess } from '@/utils/toast';
import { isPointInPolygon } from '@/utils/geometry';
import { MIN_CLAIM_AREA_SQ_METERS } from '@/utils/territoryUtils';
import { usePlayerDeath } from '@/hooks/usePlayerDeath';
import { RESPAWN_DELAY_SECONDS } from '@/utils/gameConstants';
import { Player } from '@/types/game'; // Import shared Player interface

interface UseGameLogicProps {
  session: Session | null;
  supabase: SupabaseClient;
  username: string | null;
  isPlayerAlive: boolean;
  playerTerritory: L.LatLngExpression[][];
  otherPlayers: Player[];
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
  setCurrentPath,
  setIsPlayerAlive,
  setRespawnTimer,
  setOtherPlayers,
  setPlayerTerritory,
  setPlayerScore,
}: UseGameLogicProps) => {
  const watchId = useRef<number | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isGpsActive, setIsGpsActive] = useState(false); // New state for GPS activity

  const stopWatchingLocation = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
      setIsGpsActive(false); // Update GPS active state
      showSuccess('GPS tracking stopped.');
    }
  }, []);

  const startWatchingLocation = useCallback(() => {
    if (navigator.geolocation) {
      watchId.current = navigator.geolocation.watchPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          const newLocation: L.LatLngExpression = [latitude, longitude];
          setCurrentLocation({ lat: latitude, lng: longitude });

          setCurrentPath(async (prevPath) => {
            const updatedPath = [...prevPath, newLocation];

            // Early exit if player is not alive
            if (!isPlayerAlive) {
              return [];
            }

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

            // Convert current path to Turf.js LineString for multiple checks
            const currentPathTurf = updatedPath.length >= 2 ? turf.lineString(updatedPath.map(coord => {
              const lat = typeof coord[0] === 'number' ? coord[0] : coord.lat;
              const lng = typeof coord[1] === 'number' ? coord[1] : coord.lng;
              return [lng, lat];
            })) : null;

            // 2. Check for intersection with own claimed territory
            if (currentPathTurf && playerTerritory.length > 0) {
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

            // 3. Check for collisions with other players' territories (current location inside)
            const currentPlayerLatLng: L.LatLngExpression = [latitude, longitude];
            let killedByPlayerTerritory: Player | null = null;

            for (const otherPlayer of otherPlayers) {
              if (otherPlayer.is_alive && otherPlayer.territory && otherPlayer.territory.length > 0) {
                for (const polygon of otherPlayer.territory) {
                  if (isPointInPolygon(currentPlayerLatLng, polygon)) {
                    killedByPlayerTerritory = otherPlayer;
                    break;
                  }
                }
              }
              if (killedByPlayerTerritory) break;
            }

            if (killedByPlayerTerritory) {
              handlePlayerDeath(`You were killed by ${killedByPlayerTerritory.username}'s territory!`);
              return [];
            }

            // NEW CHECK: 4. Check if current player's path crosses another player's territory
            if (currentPathTurf && otherPlayers.length > 0) {
              let killedByCrossingTerritory: Player | null = null;
              for (const otherPlayer of otherPlayers) {
                if (otherPlayer.is_alive && otherPlayer.territory && otherPlayer.territory.length > 0) {
                  for (const polygonCoords of otherPlayer.territory) {
                    const otherPlayerTerritoryTurfCoords = polygonCoords.map(coord => {
                      const lat = typeof coord[0] === 'number' ? coord[0] : coord.lat;
                      const lng = typeof coord[1] === 'number' ? coord[1] : coord.lng;
                      return [lng, lat];
                    });
                    if (otherPlayerTerritoryTurfCoords.length > 0 && (otherPlayerTerritoryTurfCoords[0][0] !== otherPlayerTerritoryTurfCoords[otherPlayerTerritoryTurfCoords.length - 1][0] || otherPlayerTerritoryTurfCoords[0][1] !== otherPlayerTerritoryTurfCoords[otherPlayerTerritoryTurfCoords.length - 1][1])) {
                      otherPlayerTerritoryTurfCoords.push(otherPlayerTerritoryTurfCoords[0]);
                    }
                    if (otherPlayerTerritoryTurfCoords.length >= 4) {
                      try {
                        const otherPlayerTerritoryPolygon = turf.polygon([otherPlayerTerritoryTurfCoords]);
                        if (turf.lineIntersect(currentPathTurf, otherPlayerTerritoryPolygon).features.length > 0) {
                          killedByCrossingTerritory = otherPlayer;
                          break;
                        }
                      } catch (e) {
                        console.error("Error checking path intersection with other player's territory:", e, polygonCoords);
                      }
                    }
                  }
                }
                if (killedByCrossingTerritory) break;
              }
              if (killedByCrossingTerritory) {
                handlePlayerDeath(`You crossed ${killedByCrossingTerritory.username}'s territory!`);
                return [];
              }
            }


            // NEW CHECK: 5. Check for killing other players by crossing their path
            if (currentPathTurf && updatedPath.length >= 2) {
              for (const otherPlayer of otherPlayers) {
                if (otherPlayer.is_alive && otherPlayer.current_path && otherPlayer.current_path.length >= 2) {
                  const otherPlayerPathTurf = turf.lineString(otherPlayer.current_path.map(coord => {
                    const lat = typeof coord[0] === 'number' ? coord[0] : coord.lat;
                    const lng = typeof coord[1] === 'number' ? coord[1] : coord.lng;
                    return [lng, lat];
                  }));

                  if (turf.lineIntersect(currentPathTurf, otherPlayerPathTurf).features.length > 0) {
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
          setIsGpsActive(false); // Set GPS to inactive on error
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 5000,
        }
      );
      setIsGpsActive(true); // Set GPS to active when tracking starts
      showSuccess('GPS tracking started!');
    } else {
      showError('Geolocation is not supported by your browser.');
      setIsGpsActive(false); // Set GPS to inactive if not supported
    }
  }, [session, supabase, isPlayerAlive, otherPlayers, playerTerritory, handlePlayerDeath, setCurrentPath, setIsPlayerAlive, setRespawnTimer, stopWatchingLocation]);


  const { handlePlayerDeath } = usePlayerDeath({
    session,
    supabase,
    stopWatchingLocation,
    setCurrentLocation,
    setCurrentPath,
    setIsPlayerAlive,
    setRespawnTimer,
  });

  useEffect(() => {
    if (!session) return;

    // Automatically start GPS if username exists and player is alive, and GPS is not already active
    if (username && isPlayerAlive && !isGpsActive) {
      startWatchingLocation();
    } else if ((!username || !isPlayerAlive) && isGpsActive) {
      // Automatically stop GPS if username is gone or player is dead, and GPS is active
      stopWatchingLocation();
    }

    return () => {
      stopWatchingLocation();
    };
  }, [session, username, isPlayerAlive, isGpsActive, startWatchingLocation, stopWatchingLocation]);

  return { stopWatchingLocation, startWatchingLocation, handlePlayerDeath, currentLocation, setCurrentLocation, isGpsActive };
};