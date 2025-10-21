"use client";

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline, Polygon } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useSupabase } from '@/components/SessionContextProvider';
import { showError, showSuccess } from '@/utils/toast';
import { Button } from '@/components/ui/button';
import { MadeWithDyad } from '@/components/made-with-dyad';
import SetUsernameDialog from '@/components/SetUsernameDialog';
import { isPointInPolygon } from '@/utils/geometry';
import Leaderboard from '@/components/Leaderboard';
import * as turf from '@turf/turf';
import { turfFeatureToLatLngExpression, calculateScore, MIN_CLAIM_AREA_SQ_METERS } from '@/utils/territoryUtils'; // Import from new utility file

// Fix for default Leaflet icon issues with Webpack/Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// Define a type for player data
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
  current_path: L.LatLngExpression[]; // Added current_path
}

// Component to update map view to current location
const RecenterAutomatically = ({ lat, lng }: { lat: number; lng: number }) => {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) {
      map.setView([lat, lng], map.getZoom());
    }
  }, [lat, lng, map]);
  return null;
};

const RESPAWN_DELAY_SECONDS = 10; // 10-second respawn delay

const GamePage = () => {
  const { supabase, session } = useSupabase();
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isUsernameDialogOpen, setIsUsernameDialogOpen] = useState(false);
  const [otherPlayers, setOtherPlayers] = useState<Player[]>([]);
  const [currentPath, setCurrentPath] = useState<L.LatLngExpression[]>([]);
  const [playerTerritory, setPlayerTerritory] = useState<L.LatLngExpression[][]>([]);
  const [isPlayerAlive, setIsPlayerAlive] = useState(true);
  const [playerScore, setPlayerScore] = useState(0);
  const [respawnTimer, setRespawnTimer] = useState(0);
  const watchId = useRef<number | null>(null);
  const respawnIntervalRef = useRef<number | null>(null);

  // Function to stop GPS tracking
  const stopWatchingLocation = () => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
      showSuccess('GPS tracking stopped.');
    }
  };

  // Helper function for player death logic
  const handlePlayerDeath = useCallback(async (reason: string) => {
    if (!session?.user?.id) return;
    showError(reason);
    setIsPlayerAlive(false);
    setCurrentPath([]);
    setCurrentLocation(null);
    stopWatchingLocation();
    setRespawnTimer(RESPAWN_DELAY_SECONDS);

    await supabase
      .from('players')
      .update({
        is_alive: false,
        current_lat: null,
        current_lng: null,
        last_killed_at: new Date().toISOString(),
        current_path: [], // Clear current path on death
        territory: [], // Clear territory on death
        score: 0, // Reset score on death
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', session.user.id);
  }, [session, supabase]); // Dependencies for useCallback

  useEffect(() => {
    if (!session) return;

    const fetchPlayerProfile = async () => {
      const { data, error } = await supabase
        .from('players')
        .select('username, territory, is_alive, score, last_killed_at, current_path') // Select current_path
        .eq('user_id', session.user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        showError('Failed to fetch player profile: ' + error.message);
        console.error('Error fetching player profile:', error);
        setIsUsernameDialogOpen(true);
      } else if (data) {
        setUsername(data.username);
        setPlayerTerritory(data.territory || []);
        setIsPlayerAlive(data.is_alive);
        setPlayerScore(data.score || 0);
        setCurrentPath(data.current_path || []); // Set current path from DB
        setIsUsernameDialogOpen(false);

        if (!data.is_alive && data.last_killed_at) {
          const killedTime = new Date(data.last_killed_at).getTime();
          const currentTime = new Date().getTime();
          const timeElapsed = (currentTime - killedTime) / 1000;
          const remainingTime = Math.max(0, RESPAWN_DELAY_SECONDS - timeElapsed);
          setRespawnTimer(Math.ceil(remainingTime));
        } else {
          setRespawnTimer(0);
        }
      } else {
        setIsUsernameDialogOpen(true);
      }
    };

    const fetchOtherPlayers = async () => {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .neq('user_id', session.user.id);

      if (error) {
        console.error('Error fetching other players:', error);
      } else {
        setOtherPlayers(data || []);
      }
    };

    fetchPlayerProfile();
    fetchOtherPlayers();

    const playersSubscription = supabase
      .channel('public:players')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, (payload) => {
        const newPlayer = payload.new as Player;
        const oldPlayer = payload.old as Player;

        if (newPlayer?.user_id === session.user.id || oldPlayer?.user_id === session.user.id) {
          if (payload.eventType === 'UPDATE' && newPlayer?.user_id === session.user.id) {
            setPlayerTerritory(newPlayer.territory || []);
            setIsPlayerAlive(newPlayer.is_alive);
            setPlayerScore(newPlayer.score || 0);
            setCurrentPath(newPlayer.current_path || []); // Update current player's path from DB
            if (!newPlayer.is_alive && newPlayer.last_killed_at) {
              const killedTime = new Date(newPlayer.last_killed_at).getTime();
              const currentTime = new Date().getTime();
              const timeElapsed = (currentTime - killedTime) / 1000;
              const remainingTime = Math.max(0, RESPAWN_DELAY_SECONDS - timeElapsed);
              setRespawnTimer(Math.ceil(remainingTime));
            } else {
              setRespawnTimer(0);
            }
          }
          return;
        }

        setOtherPlayers((prevPlayers) => {
          let updatedPlayers = [...prevPlayers];
          if (payload.eventType === 'INSERT') {
            updatedPlayers.push(newPlayer);
          } else if (payload.eventType === 'UPDATE') {
            updatedPlayers = updatedPlayers.map((player) =>
              player.user_id === newPlayer.user_id ? newPlayer : player
            );
          } else if (payload.eventType === 'DELETE') {
            updatedPlayers = updatedPlayers.filter((player) => player.user_id !== oldPlayer.user_id);
          }
          return updatedPlayers.sort((a, b) => b.score - a.score); // Keep sorted for leaderboard
        });
      })
      .subscribe();

    const startWatchingLocation = () => {
      if (navigator.geolocation) {
        watchId.current = navigator.geolocation.watchPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;
            const newLocation: L.LatLngExpression = [latitude, longitude];
            setCurrentLocation({ lat: latitude, lng: longitude });

            setCurrentPath(async (prevPath) => { // Made this async to allow DB updates
              const updatedPath = [...prevPath, newLocation];

              // 1. Check for self-intersection of the current path
              if (updatedPath.length >= 3) {
                const newSegmentStart = updatedPath[updatedPath.length - 2];
                const newSegmentEnd = updatedPath[updatedPath.length - 1];

                const newSegmentTurf = turf.lineString([
                  [typeof newSegmentStart[1] === 'number' ? newSegmentStart[1] : newSegmentStart.lng, typeof newSegmentStart[0] === 'number' ? newSegmentStart[0] : newSegmentStart.lat],
                  [typeof newSegmentEnd[1] === 'number' ? newSegmentEnd[1] : newSegmentEnd.lng, typeof newSegmentEnd[0] === 'number' ? newSegmentEnd[0] : newSegmentEnd.lat],
                ]);

                // Check against all previous segments except the immediate predecessor
                for (let i = 0; i < updatedPath.length - 3; i++) {
                  const existingSegmentStart = updatedPath[i];
                  const existingSegmentEnd = updatedPath[i + 1];

                  const existingSegmentTurf = turf.lineString([
                    [typeof existingSegmentStart[1] === 'number' ? existingSegmentStart[1] : existingSegmentStart.lng, typeof existingSegmentStart[0] === 'number' ? existingSegmentStart[0] : existingSegmentStart.lat],
                    [typeof existingSegmentEnd[1] === 'number' ? existingSegmentEnd[1] : existingSegmentEnd.lng, typeof existingSegmentEnd[0] === 'number' ? existingSegmentEnd[0] : existingSegmentEnd.lat],
                  ]);

                  if (turf.lineIntersect(newSegmentTurf, existingSegmentTurf).features.length > 0) {
                    handlePlayerDeath('You crossed your own path!');
                    return []; // Clear path on death
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
                  // Ensure the polygon is closed for turf operations
                  if (ownTerritoryTurfCoords.length > 0 && (ownTerritoryTurfCoords[0][0] !== ownTerritoryTurfCoords[ownTerritoryTurfCoords.length - 1][0] || ownTerritoryTurfCoords[0][1] !== ownTerritoryTurfCoords[ownTerritoryTurfCoords.length - 1][1])) {
                    ownTerritoryTurfCoords.push(ownTerritoryTurfCoords[0]);
                  }
                  if (ownTerritoryTurfCoords.length >= 4) { // A valid turf polygon needs at least 3 unique points + closing point
                    try {
                      const ownTerritoryPolygon = turf.polygon([ownTerritoryTurfCoords]);
                      if (turf.lineIntersect(currentPathTurf, ownTerritoryPolygon).features.length > 0) {
                        handlePlayerDeath('You crossed your own territory!');
                        return []; // Clear path on death
                      }
                    } catch (e) {
                      console.error("Error checking intersection with own territory:", e, polygonCoords);
                    }
                  }
                }
              }

              // 3. Check for collisions with other players' territories (existing logic)
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
                return []; // Clear path on death
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
                      // Kill the other player
                      showSuccess(`You killed ${otherPlayer.username} by crossing their path!`);
                      await supabase
                        .from('players')
                        .update({
                          is_alive: false,
                          current_lat: null,
                          current_lng: null,
                          last_killed_at: new Date().toISOString(),
                          current_path: [], // Clear other player's path on death
                          territory: [], // Clear other player's territory on death
                          score: 0, // Reset other player's score on death
                          updated_at: new Date().toISOString(),
                        })
                        .eq('user_id', otherPlayer.user_id);
                      // No need to return [] here, as it's the current player's path.
                      // The other player's state will be updated via subscription.
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
                  current_path: updatedPath, // Update current path in DB
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
      playersSubscription.unsubscribe();
    };
  }, [session, supabase, username, isPlayerAlive, otherPlayers, handlePlayerDeath, playerTerritory]);

  useEffect(() => {
    if (respawnTimer > 0 && !isPlayerAlive) {
      respawnIntervalRef.current = window.setInterval(() => {
        setRespawnTimer((prev) => {
          if (prev <= 1) {
            clearInterval(respawnIntervalRef.current!);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (respawnTimer === 0 && !isPlayerAlive) {
      // Timer hit 0, player can respawn
    } else {
      if (respawnIntervalRef.current) {
        clearInterval(respawnIntervalRef.current);
        respawnIntervalRef.current = null;
      }
    }

    return () => {
      if (respawnIntervalRef.current) {
        clearInterval(respawnIntervalRef.current);
      }
    };
  }, [respawnTimer, isPlayerAlive]);


  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      showError('Logout failed: ' + error.message);
    } else {
      showSuccess('Logged out successfully!');
    }
  };

  const handleUsernameSet = (newUsername: string) => {
    setUsername(newUsername);
    setIsUsernameDialogOpen(false);
  };

  const handleClaimTerritory = async () => {
    if (currentPath.length < 3) {
      showError('Path is too short to claim territory.');
      return;
    }
    if (!isPlayerAlive) {
      showError('You cannot claim territory while not alive.');
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
      if (otherPlayer.is_alive && otherPlayer.user_id !== session?.user?.id) {
        let otherPlayerTerritory = otherPlayer.territory || [];
        let changed = false;
        const remainingTerritory: L.LatLngExpression[][] = [];

        for (const existingPolygonCoords of otherPlayerTerritory) {
          const otherPlayerTurfPolygonCoords = existingPolygonCoords.map(coord => {
            const lat = typeof coord[0] === 'number' ? coord[0] : coord.lat;
            const lng = typeof coord[1] === 'number' ? coord[1] : coord.lng;
            return [lng, lat];
          });
          // Ensure the polygon is closed
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
              remainingTerritory.push(existingPolygonCoords); // Keep if error
            }
          } else {
            remainingTerritory.push(existingPolygonCoords); // Keep invalid polygons
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
        current_path: [], // Clear current path after claiming territory
        updated_at: new Date().toISOString()
      })
      .eq('user_id', session?.user?.id);

    if (error) {
      showError('Failed to claim territory: ' + error.message);
      console.error('Error claiming territory:', error);
    } else {
      showSuccess('Territory claimed successfully!');
      setPlayerTerritory(newPlayerTerritory);
      setPlayerScore(newScore);
      setCurrentPath([]);
    }
  };

  const handleRespawn = async () => {
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
        current_path: [], // Clear current path on respawn
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
      setCurrentLocation(null);
      setRespawnTimer(0);
    }
  };

  if (!currentLocation && isPlayerAlive) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white p-4">
        <h1 className="text-3xl font-bold mb-4">Waiting for GPS location...</h1>
        <p className="text-lg text-center">Please ensure location services are enabled and grant permission.</p>
        {session?.user?.id && (
          <SetUsernameDialog
            userId={session.user.id}
            onUsernameSet={handleUsernameSet}
            isOpen={isUsernameDialogOpen}
          />
        )}
        <MadeWithDyad />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-primary text-primary-foreground p-4 flex justify-between items-center shadow-md">
        <h1 className="text-xl font-bold">Paper.io GPS Game</h1>
        <div className="flex items-center space-x-4">
          {username && <span className="text-lg">Player: {username} {isPlayerAlive ? '(Alive)' : '(Dead)'}</span>}
          {username && <span className="text-lg">Score: {playerScore}</span>}
          {isPlayerAlive ? (
            <Button onClick={handleClaimTerritory} variant="secondary" disabled={currentPath.length < 3}>
              Claim Territory
            </Button>
          ) : (
            <Button onClick={handleRespawn} variant="secondary" disabled={respawnTimer > 0}>
              {respawnTimer > 0 ? `Respawn in ${respawnTimer}s` : 'Respawn'}
            </Button>
          )}
          <Button onClick={handleLogout} variant="secondary">Logout</Button>
        </div>
      </header>
      <div className="flex-grow relative">
        <MapContainer
          center={[currentLocation?.lat || 0, currentLocation?.lng || 0]}
          zoom={18}
          scrollWheelZoom={true}
          className="h-full w-full"
          style={{ height: '100vh', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {currentLocation && isPlayerAlive && (
            <>
              <Marker position={[currentLocation.lat, currentLocation.lng]}>
                <Popup>
                  You are here! <br /> Lat: {currentLocation.lat.toFixed(4)}, Lng: {currentLocation.lng.toFixed(4)}
                </Popup>
              </Marker>
              <RecenterAutomatically lat={currentLocation.lat} lng={currentLocation.lng} />
            </>
          )}

          {playerTerritory.map((polygon, index) => (
            <Polygon key={`player-territory-${index}`} positions={polygon} pathOptions={{ color: 'blue', fillColor: 'lightblue', fillOpacity: 0.5 }} />
          ))}

          {isPlayerAlive && currentPath.length > 1 && (
            <Polyline positions={currentPath} pathOptions={{ color: 'blue', weight: 5 }} />
          )}

          {otherPlayers.filter(p => p.is_alive).map((player) => (
            <React.Fragment key={player.user_id}>
              {player.current_lat && player.current_lng && (
                <Marker position={[player.current_lat, player.current_lng]}>
                  <Popup>
                    Player: {player.username} <br /> Lat: {player.current_lat.toFixed(4)}, Lng: {player.current_lng.toFixed(4)}
                  </Popup>
                </Marker>
              )}
              {player.territory && player.territory.map((polygon, index) => (
                <Polygon key={`other-player-${player.user_id}-territory-${index}`} positions={polygon} pathOptions={{ color: 'red', fillColor: 'pink', fillOpacity: 0.3 }} />
              ))}
              {player.current_path && player.current_path.length > 1 && (
                <Polyline positions={player.current_path} pathOptions={{ color: 'red', weight: 5, dashArray: '10, 10' }} />
              )}
            </React.Fragment>
          ))}
        </MapContainer>
        <Leaderboard />
      </div>
      {session?.user?.id && (
        <SetUsernameDialog
          userId={session.user.id}
          onUsernameSet={handleUsernameSet}
          isOpen={isUsernameDialogOpen}
        />
      )}
      <MadeWithDyad />
    </div>
  );
};

export default GamePage;