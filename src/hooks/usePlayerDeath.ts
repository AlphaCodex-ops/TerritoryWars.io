"use client";

import { useCallback } from 'react';
import { Session } from '@supabase/supabase-js';
import { SupabaseClient } from '@supabase/supabase-js';
import { showError, showSuccess } from '@/utils/toast';
import L from 'leaflet';
import { RESPAWN_DELAY_SECONDS } from '@/utils/gameConstants'; // Import from new utility file

interface UsePlayerDeathProps {
  session: Session | null;
  supabase: SupabaseClient;
  stopWatchingLocation: () => void;
  setCurrentPath: React.Dispatch<React.SetStateAction<L.LatLngExpression[]>>;
  setCurrentLocation: React.Dispatch<React.SetStateAction<{ lat: number; lng: number } | null>>;
  setIsPlayerAlive: React.Dispatch<React.SetStateAction<boolean>>;
  setRespawnTimer: React.Dispatch<React.SetStateAction<number>>;
}

export const usePlayerDeath = ({
  session,
  supabase,
  stopWatchingLocation,
  setCurrentPath,
  setCurrentLocation,
  setIsPlayerAlive,
  setRespawnTimer,
}: UsePlayerDeathProps) => {
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
  }, [session, supabase, stopWatchingLocation, setCurrentPath, setCurrentLocation, setIsPlayerAlive, setRespawnTimer]);

  return { handlePlayerDeath };
};