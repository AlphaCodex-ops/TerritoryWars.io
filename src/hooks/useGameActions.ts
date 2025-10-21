"use client";

import { useCallback } from 'react';
import { Session, SupabaseClient } from '@supabase/supabase-js';
import L from 'leaflet';
import * as turf from '@turf/turf';
import { showError, showSuccess } from '@/utils/toast';
import { turfFeatureToLatLngExpression, calculateScore, MIN_CLAIM_AREA_SQ_METERS } from '@/utils/territoryUtils';
import { Player } from '@/types/game'; // Import shared Player interface

interface UseGameActionsProps {
  session: Session | null;
  supabase: SupabaseClient;
  currentPath: L.LatLngExpression[];
  isPlayerAlive: boolean;
  playerTerritory: L.LatLngExpression[][];
  otherPlayers: Player[];
  respawnTimer: number;
  setCurrentPath: React.Dispatch<React.SetStateAction<L.LatLngExpression[]>>;
  setPlayerTerritory: React.Dispatch<React.SetStateAction<L.LatLngExpression[][]>>;
  setPlayerScore: React.Dispatch<React.SetStateAction<number>>;
  setIsPlayerAlive: React.Dispatch<React.SetStateAction<boolean>>;
  setRespawnTimer: React.Dispatch<React.SetStateAction<number>>;
  setOtherPlayers: React.Dispatch<React.SetStateAction<Player[]>>;
  setCurrentLocation: React.Dispatch<React.SetStateAction<{ lat: number; lng: number } | null>>; // Corrected type
}

export const useGameActions = ({
  session,
  supabase,
  currentPath,
  isPlayerAlive,
  playerTerritory,
  otherPlayers,
  respawnTimer,
  setCurrentPath,
  setPlayerTerritory,
  setPlayerScore,
  setIsPlayerAlive,
  setRespawnTimer,
  setOtherPlayers,
  setCurrentLocation, // Destructure the setter
}: UseGameActionsProps) => {

  const handleClaimTerritory = useCallback(async () => {
    if (currentPath.length < 3) {
      showError('Path is too short to claim territory.');
      return;
    }
    if (!isPlayerAlive) {
      showError('You cannot claim territory while not alive.');
      return;
    }
    if (!session?.user?.id) {
      showError('User not authenticated.');
      return;
    }

    // 1. Create the new polygon from the current path
    const newClaimCoords = currentPath.map(coord => {
      const lat = typeof coord[0] === 'number' ? coord[0] : coord.lat;
      const lng = typeof coord[1] === 'number' ? coord[1] : coord.lng;
      return [lng, lat];
    });
    // Ensure the polygon is closed
    if (newClaimCoords.length > 0 && (newClaimCoords[0][0] !== newClaimCoords[newClaimCoords.length - 1][0] || newClaimCoords[0][1] !== newClaimCoords[newClaimCoords.length - 1][1])) {
      newClaimCoords.push(newClaimCoords[0]);
    }

    let newlyClaimedTurfPolygon: turf.Feature<turf.Polygon> | null = null;
    if (newClaimCoords.length >= 4) {
      try {
        newlyClaimedTurfPolygon = turf.polygon([newClaimCoords]);
      } catch (e) {
        showError('Invalid polygon formed by your path.');
        console.error('Error creating turf polygon from current path:', e);
        return;
      }
    } else {
      showError('Path is too short to form a valid polygon.');
      return;
    }

    // Check if the newly claimed area is significant enough
    if (newlyClaimedTurfPolygon && turf.area(newlyClaimedTurfPolygon) < MIN_CLAIM_AREA_SQ_METERS) {
      showError(`Claimed area is too small. Minimum required area is ${MIN_CLAIM_AREA_SQ_METERS} sq meters.`);
      return;
    }

    // 2. Update other players' territories (capture logic)
    const updatedOtherPlayersState = [...otherPlayers];
    for (let i = 0; i < updatedOtherPlayersState.length; i++) {
      const otherPlayer = updatedOtherPlayersState[i];
      if (otherPlayer.is_alive && otherPlayer.user_id !== session.user.id) {
        let otherPlayerTerritory = otherPlayer.territory || [];
        let changed = false;
        const remainingTerritory: L.LatLngExpression[][] = [];

        for (const existingPolygonCoords of otherPlayerTerritory) {
          const otherPlayerTurfPolygonCoords = existingPolygonCoords.map(coord => {
            const lat = typeof coord[0] === 'number' ? coord[0] : coord.lat;
            const lng = typeof coord[1] === 'number' ? coord[1] : coord.lng;
            return [lng, lat];
          });
          if (otherPlayerTurfPolygonCoords.length > 0 && (otherPlayerTurfPolygonCoords[0][0] !== otherPlayerTurfPolygonCoords[otherPlayerTurfPolygonCoords.length - 1][0] || otherPlayerTurfPolygonCoords[0][1] !== otherPlayerTurfPolygonCoords[otherPlayerTurfPolygonCoords.length - 1][1])) {
            otherPlayerTurfPolygonCoords.push(otherPlayerTurfPolygonCoords[0]);
          }

          if (otherPlayerTurfPolygonCoords.length >= 4) {
            try {
              const existingTurfPolygon = turf.polygon([otherPlayerTurfPolygonCoords]);
              if (newlyClaimedTurfPolygon && turf.booleanIntersects(newlyClaimedTurfPolygon, existingTurfPolygon)) {
                changed = true;
                showSuccess(`You captured a piece of ${otherPlayer.username}'s territory!`);
                
                const remainingTurf = turf.difference(existingTurfPolygon, newlyClaimedTurfPolygon);
                remainingTerritory.push(...turfFeatureToLatLngExpression(remainingTurf));
              } else {
                remainingTerritory.push(existingPolygonCoords);
              }
            } catch (e) {
              console.error("Error processing other player's territory polygon with turf.difference:", e, existingPolygonCoords);
              remainingTerritory.push(existingPolygonCoords);
            }
          } else {
            remainingTerritory.push(existingPolygonCoords);
          }
        }

        if (changed) {
          const newOtherPlayerScore = calculateScore(remainingTerritory);
          await supabase
            .from('players')
            .update({ territory: remainingTerritory, score: newOtherPlayerScore, updated_at: new Date().toISOString() })
            .eq('user_id', otherPlayer.user_id);
          
          updatedOtherPlayersState[i] = { ...otherPlayer, territory: remainingTerritory, score: newOtherPlayerScore };
        }
      }
    }
    setOtherPlayers(updatedOtherPlayersState);

    // 3. Update current player's territory and score
    let currentPlayersCombinedTurf: turf.Feature<turf.Polygon | turf.MultiPolygon> | null = newlyClaimedTurfPolygon;

    for (const existingPolygonCoords of playerTerritory) {
      const existingTurfPolygonCoords = existingPolygonCoords.map(coord => {
        const lat = typeof coord[0] === 'number' ? coord[0] : coord.lat;
        const lng = typeof coord[1] === 'number' ? coord[1] : coord.lng;
        return [lng, lat];
      });
      if (existingTurfPolygonCoords.length > 0 && (existingTurfPolygonCoords[0][0] !== existingTurfPolygonCoords[existingTurfPolygonCoords.length - 1][0] || existingTurfPolygonCoords[0][1] !== existingTurfPolygonCoords[existingTurfPolygonCoords.length - 1][1])) {
        existingTurfPolygonCoords.push(existingTurfPolygonCoords[0]);
      }

      if (existingTurfPolygonCoords.length >= 4) {
        try {
          const existingTurfPolygon = turf.polygon([existingTurfPolygonCoords]);
          if (currentPlayersCombinedTurf) {
            currentPlayersCombinedTurf = turf.union(currentPlayersCombinedTurf, existingTurfPolygon);
          } else {
            currentPlayersCombinedTurf = existingTurfPolygon;
          }
        } catch (e) {
          console.error("Error uniting with existing player territory:", e, existingPolygonCoords);
        }
      }
    }

    const newPlayerTerritory = turfFeatureToLatLngExpression(currentPlayersCombinedTurf);
    const newScore = calculateScore(newPlayerTerritory);

    const { error } = await supabase
      .from('players')
      .update({
        territory: newPlayerTerritory,
        score: newScore,
        current_path: [],
        updated_at: new Date().toISOString()
      })
      .eq('user_id', session.user.id);

    if (error) {
      showError('Failed to claim territory: ' + error.message);
      console.error('Error claiming territory:', error);
    } else {
      showSuccess('Territory claimed successfully!');
      setPlayerTerritory(newPlayerTerritory);
      setPlayerScore(newScore);
      setCurrentPath([]);
    }
  }, [session, supabase, currentPath, isPlayerAlive, playerTerritory, otherPlayers, setCurrentPath, setPlayerTerritory, setPlayerScore, setOtherPlayers]);

  const handleRespawn = useCallback(async () => {
    if (!session?.user?.id) return;
    if (respawnTimer > 0) {
      showError(`Cannot respawn yet. Please wait ${respawnTimer} seconds.`);
      return;
    }

    const { error } = await supabase
      .from('players')
      .update({
        is_alive: true,
        current_lat: null,
        current_lng: null,
        territory: [],
        last_killed_at: null,
        score: 0,
        current_path: [],
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', session.user.id);

    if (error) {
      showError('Failed to respawn: ' + error.message);
      console.error('Error respawning:', error);
    } else {
      showSuccess('Respawned successfully!');
      setIsPlayerAlive(true);
      setCurrentPath([]);
      setPlayerTerritory([]);
      setPlayerScore(0);
      setCurrentLocation(null); // Correctly reset currentLocation
      setRespawnTimer(0);
    }
  }, [session, supabase, respawnTimer, setIsPlayerAlive, setCurrentPath, setPlayerTerritory, setPlayerScore, setCurrentLocation, setRespawnTimer]);

  return { handleClaimTerritory, handleRespawn };
};