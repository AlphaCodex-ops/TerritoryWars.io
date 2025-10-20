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

const GamePage = () => {
  const { supabase, session } = useSupabase();
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isUsernameDialogOpen, setIsUsernameDialogOpen] = useState(false);
  const [otherPlayers, setOtherPlayers] = useState<Player[]>([]);
  const [currentPath, setCurrentPath] = useState<L.LatLngExpression[]>([]);
  const [playerTerritory, setPlayerTerritory] = useState<L.LatLngExpression[][]>([]);
  const [isPlayerAlive, setIsPlayerAlive] = useState(true);
  const [playerScore, setPlayerScore] = useState(0); // New state for current player's score
  const watchId = useRef<number | null>(null);

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
        .select('username, territory, is_alive, score') // Fetch score
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
        setPlayerScore(data.score || 0); // Set player's score
        setIsUsernameDialogOpen(false);
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
            setPlayerScore(newPlayer.score || 0); // Update current player's score
          }
          return;
        }

        setOtherPlayers((prevPlayers) => {
          if (payload.eventType === 'INSERT') {
            return [...prevPlayers, newPlayer];
          } else if (payload.eventType === 'UPDATE') {
            return prevPlayers.map((player) =>
              player.user_id === newPlayer.user_id ? newPlayer : player
            );
          } else if (payload.eventType === 'DELETE') {
            return prevPlayers.filter((player) => player.user_id !== oldPlayer.user_id);
          }
          return prevPlayers;
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
          {username && <span className="text-lg">Score: {playerScore}</span>} {/* Display player's score */}
          {isPlayerAlive ? (
            <Button onClick={handleClaimTerritory} variant="secondary" disabled={currentPath.length < 3}>
              Claim Territory
            </Button>
          ) : (
            <Button onClick={handleRespawn} variant="secondary">
              Respawn
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
        <Leaderboard /> {/* Add the Leaderboard component */}
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