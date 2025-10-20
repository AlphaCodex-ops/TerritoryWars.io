"use client";

import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline, Polygon } from 'react-leaflet'; // Added Polyline, Polygon
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useSupabase } from '@/components/SessionContextProvider';
import { showError, showSuccess } from '@/utils/toast';
import { Button } from '@/components/ui/button';
import { MadeWithDyad } from '@/components/made-with-dyad';
import SetUsernameDialog from '@/components/SetUsernameDialog';

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
  territory: L.LatLngExpression[][]; // Added territory
  is_alive: boolean;
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
  const [currentPath, setCurrentPath] = useState<L.LatLngExpression[]>([]); // State for current path
  const [playerTerritory, setPlayerTerritory] = useState<L.LatLngExpression[][]>([]); // State for claimed territory
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    if (!session) return;

    const fetchPlayerProfile = async () => {
      const { data, error } = await supabase
        .from('players')
        .select('username, territory') // Fetch territory as well
        .eq('user_id', session.user.id)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found
        showError('Failed to fetch player profile: ' + error.message);
        console.error('Error fetching player profile:', error);
        setIsUsernameDialogOpen(true);
      } else if (data) {
        setUsername(data.username);
        setPlayerTerritory(data.territory || []); // Initialize player territory
        setIsUsernameDialogOpen(false);
      } else {
        setIsUsernameDialogOpen(true);
      }
    };

    const fetchOtherPlayers = async () => {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .neq('user_id', session.user.id); // Exclude current user

      if (error) {
        console.error('Error fetching other players:', error);
      } else {
        setOtherPlayers(data || []);
      }
    };

    fetchPlayerProfile();
    fetchOtherPlayers();

    // Set up real-time subscription for other players
    const playersSubscription = supabase
      .channel('public:players')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, (payload) => {
        const newPlayer = payload.new as Player;
        const oldPlayer = payload.old as Player;

        if (newPlayer?.user_id === session.user.id || oldPlayer?.user_id === session.user.id) {
          // If the change is for the current user, update their territory if it's an update event
          if (payload.eventType === 'UPDATE' && newPlayer?.user_id === session.user.id) {
            setPlayerTerritory(newPlayer.territory || []);
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
            setCurrentPath((prevPath) => [...prevPath, newLocation]); // Add to current path

            // Update player's location in Supabase
            const { error } = await supabase
              .from('players')
              .update({ current_lat: latitude, current_lng: longitude, updated_at: new Date().toISOString() })
              .eq('user_id', session.user.id);

            if (error) {
              console.error('Error updating player location:', error);
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

    // Only start watching location if username is set
    if (username) {
      startWatchingLocation();
    }

    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        showSuccess('GPS tracking stopped.');
      }
      playersSubscription.unsubscribe(); // Unsubscribe from real-time updates
    };
  }, [session, supabase, username]);

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

    // For simplicity, we'll just add the current path as a new polygon.
    // A real Paper.io game would involve complex geometric calculations
    // to determine the enclosed area and merge with existing territory.
    const newTerritory = [...playerTerritory, currentPath];

    const { error } = await supabase
      .from('players')
      .update({ territory: newTerritory, updated_at: new Date().toISOString() })
      .eq('user_id', session?.user?.id);

    if (error) {
      showError('Failed to claim territory: ' + error.message);
      console.error('Error claiming territory:', error);
    } else {
      showSuccess('Territory claimed successfully!');
      setPlayerTerritory(newTerritory);
      setCurrentPath([]); // Clear the current path after claiming
    }
  };

  if (!currentLocation) {
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
          {username && <span className="text-lg">Player: {username}</span>}
          <Button onClick={handleClaimTerritory} variant="secondary" disabled={currentPath.length < 3}>
            Claim Territory
          </Button>
          <Button onClick={handleLogout} variant="secondary">Logout</Button>
        </div>
      </header>
      <div className="flex-grow relative">
        <MapContainer
          center={[currentLocation.lat, currentLocation.lng]}
          zoom={18}
          scrollWheelZoom={true}
          className="h-full w-full"
          style={{ height: '100vh', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {currentLocation && (
            <>
              <Marker position={[currentLocation.lat, currentLocation.lng]}>
                <Popup>
                  You are here! <br /> Lat: {currentLocation.lat.toFixed(4)}, Lng: {currentLocation.lng.toFixed(4)}
                </Popup>
              </Marker>
              <RecenterAutomatically lat={currentLocation.lat} lng={currentLocation.lng} />
            </>
          )}

          {/* Render current player's claimed territory */}
          {playerTerritory.map((polygon, index) => (
            <Polygon key={`player-territory-${index}`} positions={polygon} pathOptions={{ color: 'blue', fillColor: 'lightblue', fillOpacity: 0.5 }} />
          ))}

          {/* Render current player's path */}
          {currentPath.length > 1 && (
            <Polyline positions={currentPath} pathOptions={{ color: 'blue', weight: 5 }} />
          )}

          {/* Render other players' markers and territories */}
          {otherPlayers.map((player) => (
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