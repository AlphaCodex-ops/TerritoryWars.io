"use client";

import React, { useEffect, useState, useRef } from 'react';
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
import * as turf from '@turf/turf'; // Import turf.js

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

  useEffect(() => {
    if (!session) return;

    const fetchPlayerProfile = async () => {
      const { data, error } = await supabase
        .from('players')
        .select('username, territory, is_alive, score, last_killed_at')
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
            setCurrentPath((prevPath) => [...prevPath, newLocation]);

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
              showError(`You were killed by ${killedByPlayer.username}!`);
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
                  updated_at: new Date().toISOString(),
                })
                .eq('user_id', session.user.id);
            } else {
              const { error } = await supabase
                .from('players')
                .update({ current_lat: latitude, current_lng: longitude, updated_at: new Date().toISOString() })
                .eq('user_id', session.user.id);

              if (error) {
                console.error('Error updating player location:', error);
              }
            }
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
  }, [session, supabase, username, isPlayerAlive, otherPlayers]);

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

  // Calculate score based on the area of all claimed polygons
  const calculateScore = (territory: L.LatLngExpression[][]): number => {
    let totalArea = 0;
    territory.forEach(polygonCoords => {
      const geoJsonCoords = polygonCoords.map(coord => {
        const lat = typeof coord[0] === 'number' ? coord[0] : coord.lat;
        const lng = typeof coord[1] === 'number' ? coord[1] : coord.lng;
        return [lng, lat]; // Turf expects [longitude, latitude]
      });

      // Ensure the polygon is closed
      if (geoJsonCoords.length > 0 && (geoJsonCoords[0][0] !== geoJsonCoords[geoJsonCoords.length - 1][0] || geoJsonCoords[0][1] !== geoJsonCoords[geoJsonCoords.length - 1][1])) {
        geoJsonCoords.push(geoJsonCoords[0]);
      }

      if (geoJsonCoords.length >= 4) { // A valid polygon needs at least 3 unique points + closing point
        try {
          const polygon = turf.polygon([geoJsonCoords]);
          totalArea += turf.area(polygon); // area in square meters
        } catch (e) {
          console.error("Error calculating area for polygon:", e, polygonCoords);
        }
      }
    });
    return Math.round(totalArea / 1000); // Return area in thousands of square meters for a more manageable score
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

    // 1. Create the new polygon for the current player
    const newPlayerPolygonCoords = currentPath.map(coord => {
      const lat = typeof coord[0] === 'number' ? coord[0] : coord.lat;
      const lng = typeof coord[1] === 'number' ? coord[1] : coord.lng;
      return [lng, lat];
    });
    // Ensure the polygon is closed
    if (newPlayerPolygonCoords.length > 0 && (newPlayerPolygonCoords[0][0] !== newPlayerPolygonCoords[newPlayerPolygonCoords.length - 1][0] || newPlayerPolygonCoords[0][1] !== newPlayerPolygonCoords[newPlayerPolygonCoords.length - 1][1])) {
      newPlayerPolygonCoords.push(newPlayerPolygonCoords[0]);
    }

    let newlyClaimedTurfPolygon: turf.Feature<turf.Polygon> | null = null;
    if (newPlayerPolygonCoords.length >= 4) {
      try {
        newlyClaimedTurfPolygon = turf.polygon([newPlayerPolygonCoords]);
      } catch (e) {
        showError('Invalid polygon formed by your path.');
        console.error('Error creating turf polygon from current path:', e);
        return;
      }
    } else {
      showError('Path is too short to form a valid polygon.');
      return;
    }

    // 2. Update other players' territories (capture logic)
    const updatedOtherPlayersState = [...otherPlayers]; // Create a mutable copy for local state update
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
                // For simplicity, we remove the entire polygon if it intersects.
                // More advanced logic would use turf.difference to subtract the intersection.
              } else {
                remainingTerritory.push(existingPolygonCoords);
              }
            } catch (e) {
              console.error("Error processing other player's territory polygon:", e, existingPolygonCoords);
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
          
          // Update the local state for this specific other player
          updatedOtherPlayersState[i] = { ...otherPlayer, territory: remainingTerritory, score: newOtherPlayerScore };
        }
      }
    }
    setOtherPlayers(updatedOtherPlayersState); // Update local state for all other players

    // 3. Update current player's territory and score
    const newTerritory = [...playerTerritory, currentPath];
    const newScore = calculateScore(newTerritory);

    const { error } = await supabase
      .from('players')
      .update({ territory: newTerritory, score: newScore, updated_at: new Date().toISOString() })
      .eq('user_id', session?.user?.id);

    if (error) {
      showError('Failed to claim territory: ' + error.message);
      console.error('Error claiming territory:', error);
    } else {
      showSuccess('Territory claimed successfully!');
      setPlayerTerritory(newTerritory);
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