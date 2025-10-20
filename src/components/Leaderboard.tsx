"use client";

import React, { useEffect, useState } from 'react';
import { useSupabase } from '@/components/SessionContextProvider';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

interface PlayerScore {
  user_id: string;
  username: string;
  score: number;
  is_alive: boolean;
}

const Leaderboard: React.FC = () => {
  const { supabase } = useSupabase();
  const [players, setPlayers] = useState<PlayerScore[]>([]);

  useEffect(() => {
    const fetchPlayers = async () => {
      const { data, error } = await supabase
        .from('players')
        .select('user_id, username, score, is_alive')
        .order('score', { ascending: false });

      if (error) {
        console.error('Error fetching leaderboard:', error);
      } else {
        setPlayers(data || []);
      }
    };

    fetchPlayers();

    const playersSubscription = supabase
      .channel('public:players_leaderboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, (payload) => {
        const newPlayer = payload.new as PlayerScore;
        const oldPlayer = payload.old as PlayerScore;

        setPlayers((prevPlayers) => {
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
  }, [supabase]);

  return (
    <Card className="w-full max-w-xs absolute top-4 right-4 z-[1000] bg-white dark:bg-gray-800 shadow-lg">
      <CardHeader>
        <CardTitle className="text-lg">Leaderboard</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[200px]">
          {players.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No players yet.</p>
          ) : (
            <ul className="space-y-2">
              {players.map((player, index) => (
                <li key={player.user_id} className="flex justify-between items-center text-sm">
                  <span className="font-medium">
                    {index + 1}. {player.username} {player.is_alive ? '' : '(Dead)'}
                  </span>
                  <span className="text-gray-600 dark:text-gray-300">{player.score} pts</span>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default Leaderboard;