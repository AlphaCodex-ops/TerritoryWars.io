"use client";

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Polygon } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useSupabase } from '@/components/SessionContextProvider';
import { showError, showSuccess } from '@/utils/toast';
import { Button } from '@/components/ui/button';
import { MadeWithDyad } from '@/components/made-with-dyad';
import SetUsernameDialog from '@/components/SetUsernameDialog';
import Leaderboard from '@/components/Leaderboard';
import { useGameLogic } from '@/hooks/useGameLogic';
import { useGameData } from '@/hooks/useGameData';
import { useGameActions } from '@/hooks/useGameActions';
import RecenterAutomatically from '@/components/map/RecenterAutomatically';
import GpsStatusIndicator from '@/components/map/GpsStatusIndicator';
import PathStartMarker from '@/components/map/PathStartMarker';
import { Player } from '@/types/game';
import RespawnOverlay from '@/components/RespawnOverlay';
import HowToPlayDialog from '@/components/HowToPlayDialog';
import GameHeader from '@/components/GameHeader'; // New import

// Fix for default Leaflet icon issues with Webpack/Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

const DEFAULT_MAP_CENTER: L.LatLngExpression = [51.505, -0.09]; // Example: London

const GamePage = () => {
  const { supabase, session } = useSupabase();
  const [showChangeUsernameDialog, setShowChangeUsernameDialog] = useState(false);

  // Use the custom hook for game data fetching and real-time updates
  const {
    username,
    isUsernameDialogOpen,
    otherPlayers,
    playerTerritory,
    isPlayerAlive,
    playerScore,
    respawnTimer,
    currentPath,
    setIsUsernameDialogOpen,
    setOtherPlayers,
    setPlayerTerritory,
    setIsPlayerAlive,
    setPlayerScore,
    setRespawnTimer,
    setCurrentPath,
    handleUsernameSet,
  } = useGameData({ supabase, session });

  // Use the custom hook for game logic (GPS tracking, collision detection)
  const { currentLocation, setCurrentLocation, stopWatchingLocation, startWatchingLocation, handlePlayerDeath, isGpsActive } = useGameLogic({
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
  });

  // Use the custom hook for game actions (claiming territory, respawning)
  const { handleClaimTerritory, handleRespawn, isClaiming, isRespawning } = useGameActions({
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
    setCurrentLocation,
  });

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      showError('Logout failed: ' + error.message);
    } else {
      showSuccess('Logged out successfully!');
    }
  };

  const toggleGpsTracking = () => {
    if (isGpsActive) {
      stopWatchingLocation();
    } else {
      startWatchingLocation();
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <GameHeader
        username={username}
        isPlayerAlive={isPlayerAlive}
        playerScore={playerScore}
        currentPathLength={currentPath.length}
        isClaiming={isClaiming}
        respawnTimer={respawnTimer}
        isRespawning={isRespawning}
        isGpsActive={isGpsActive}
        onClaimTerritory={handleClaimTerritory}
        onRespawn={handleRespawn}
        onToggleGpsTracking={toggleGpsTracking}
        onShowChangeUsernameDialog={() => setShowChangeUsernameDialog(true)}
        onLogout={handleLogout}
      />

      <div className="flex-grow relative">
        {!currentLocation && isPlayerAlive && isGpsActive ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white p-4 z-[1001]">
            <h1 className="text-3xl font-bold mb-4">Waiting for GPS location...</h1>
            <p className="text-lg text-center">Please ensure location services are enabled and grant permission.</p>
          </div>
        ) : (
          <MapContainer
            center={currentLocation ? [currentLocation.lat, currentLocation.lng] : DEFAULT_MAP_CENTER}
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
              <>
                <Polyline positions={currentPath} pathOptions={{ color: 'blue', weight: 5 }} />
                <PathStartMarker position={currentPath[0]} />
              </>
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
            <GpsStatusIndicator isGpsActive={isGpsActive} />
          </MapContainer>
        )}
        <Leaderboard />
        <RespawnOverlay
          respawnTimer={respawnTimer}
          isPlayerAlive={isPlayerAlive}
          onRespawn={handleRespawn}
          isRespawning={isRespawning}
        />
      </div>
      {session?.user?.id && (isUsernameDialogOpen || showChangeUsernameDialog) && (
        <SetUsernameDialog
          userId={session.user.id}
          onUsernameSet={handleUsernameSet}
          isOpen={isUsernameDialogOpen || showChangeUsernameDialog}
          onClose={() => setShowChangeUsernameDialog(false)}
          isInitialSetup={isUsernameDialogOpen}
        />
      )}
      <MadeWithDyad />
    </div>
  );
};

export default GamePage;