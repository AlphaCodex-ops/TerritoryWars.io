"use client";

import { useEffect, useState } from 'react';
import { Session, SupabaseClient } from '@supabase/supabase-js';
import L from 'leaflet';
import { showError } from '@/utils/toast';
import { RESPAWN_DELAY_SECONDS } from '@/utils/gameConstants';

// Define a type for player data, consistent across hooks and components
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

interface UseGameDataProps {
  supabase: SupabaseClient;
  session: Session | null;
}

export const useGameData = ({ supabase, session }: UseGameDataProps) => {
  const [username, setUsername] = useState<string | null>(null);
  const [isUsernameDialogOpen, setIsUsernameDialogOpen] = useState(false);
  const [otherPlayers, setOtherPlayers] = useState<Player[]>([]);
  const [playerTerritory, setPlayerTerritory] = useState<L.LatLngExpression[][]>([]);
  const [isPlayerAlive, setIsPlayerAlive] = useState(true);
  const [playerScore, setPlayerScore] = useState(0);
  const [respawnTimer, setRespawnTimer] = useState(0);
  const [currentPath, setCurrentPath] = useState<L.LatLngExpression[]>([]);

  useEffect(() => {
    if (!session) return;

    const fetchPlayerProfile = async () => {
      const { data, error } = await supabase
        .from('players')
        .select('username, territory, is_alive, score, last_killed_at, current_path')
        .eq('user_id', session.user.id)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 means "no rows found"
        showError('Failed to fetch player profile: ' + error.message);
        console.error('Error fetching player profile:', error);
        setIsUsernameDialogOpen(true);
      } else if (data) {
        setUsername(data.username);
        setPlayerTerritory(data.territory || []);
        setIsPlayerAlive(data.is_alive);
        setPlayerScore(data.score || 0);
        setCurrentPath(data.current_path || []);
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
        // No player profile found, prompt for username
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
            setCurrentPath(newPlayer.current_path || []);
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
          return updatedPlayers.sort((a, b) => b.score - a.score);
        });
      })
      .subscribe();

    return () => {
      playersSubscription.unsubscribe();
    };
  }, [session, supabase]);

  const handleUsernameSet = (newUsername: string) => {
    setUsername(newUsername);
    setIsUsernameDialogOpen(false);
  };

  return {
    username,
    setUsername,
    isUsernameDialogOpen,
    setIsUsernameDialogOpen,
    otherPlayers,
    setOtherPlayers,
    playerTerritory,
    setPlayerTerritory,
    isPlayerAlive,
    setIsPlayerAlive,
    playerScore,
    setPlayerScore,
    respawnTimer,
    setRespawnTimer,
    currentPath,
    setCurrentPath,
    handleUsernameSet,
  };
};