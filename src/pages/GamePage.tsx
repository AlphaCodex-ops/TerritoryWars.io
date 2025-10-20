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
import Leaderboard from '@/components/Leaderboard'; // Import Leaderboard

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
  score: number; // Added score
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
  const [respawnTimer, setRespawnTimer] = useState(0); // New state for respawn timer
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
        .select('username, territory, is_alive, score, last_killed_at') // Fetch last_killed_at
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

        // Initialize respawn timer if player is dead
        if (!data.is_alive && data.last_killed_at) {
          const killedTime = new Date(data.last_killed_at).getTime();
          const currentTime = new Date().getTime();
          const timeElapsed = (currentTime - killedTime) / 1000; // in seconds
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
            // Update respawn timer if player status changes
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
          return updatedPlayers;
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

            // Check for collisions with other players' territories
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
              // Player was killed
              showError(`You were killed by ${killedByPlayer.username}!`);
              setIsPlayerAlive(false);
              setCurrentPath([]);
              setCurrentLocation(null); // Clear location on death
              stopWatchingLocation(); // Stop GPS tracking
              setRespawnTimer(RESPAWN_DELAY_SECONDS); // Start respawn timer

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
              // No collision, update player's location in Supabase
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
      stopWatchingLocation(); // Ensure GPS is stopped if player is not alive
    }

    return () => {
      stopWatchingLocation(); // Cleanup on unmount or dependency change
      playersSubscription.unsubscribe();
    };
  }, [session, supabase, username, isPlayerAlive, otherPlayers]);

  // Effect for respawn timer countdown
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
      // If timer hits 0 and player is still dead, allow respawn
      // No action needed here, just ensures button is enabled
    } else {
      // Clear interval if player is alive or timer is not active
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

  const calculateScore = (territory: L.LatLngExpression[][]): number => {
    let totalPoints = 0;
    territory.forEach(polygon => {
      totalPoints += polygon.length;
    });
    return totalPoints;
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
      setPlayerScore(newScore); // Update local score state
      setCurrentPath([]);
    }
  };

  const handleRespawn = async () => {
    if (!session?.user?.id) return;
    if (respawnTimer > 0) { // Prevent respawn if timer is still active
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
        score: 0, // Reset score on respawn
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
      setPlayerScore(0); // Reset local score state
      setCurrentLocation(null);
      setRespawnTimer(0); // Reset timer on successful respawn
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