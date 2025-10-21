"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import HowToPlayDialog from '@/components/HowToPlayDialog';
import { Player } from '@/types/game'; // Import Player type

interface GameHeaderProps {
  username: string | null;
  isPlayerAlive: boolean;
  playerScore: number;
  currentPathLength: number;
  isClaiming: boolean;
  respawnTimer: number;
  isRespawning: boolean;
  isGpsActive: boolean;
  onClaimTerritory: () => void;
  onRespawn: () => void;
  onToggleGpsTracking: () => void;
  onShowChangeUsernameDialog: () => void;
  onLogout: () => void;
}

const GameHeader: React.FC<GameHeaderProps> = ({
  username,
  isPlayerAlive,
  playerScore,
  currentPathLength,
  isClaiming,
  respawnTimer,
  isRespawning,
  isGpsActive,
  onClaimTerritory,
  onRespawn,
  onToggleGpsTracking,
  onShowChangeUsernameDialog,
  onLogout,
}) => {
  return (
    <header className="bg-primary text-primary-foreground p-4 flex flex-wrap justify-between items-center shadow-md gap-2">
      <h1 className="text-xl font-bold">Paper.io GPS Game</h1>
      <div className="flex flex-wrap items-center space-x-2 sm:space-x-4 gap-y-2">
        {username && <span className="text-lg">Player: {username} {isPlayerAlive ? '(Alive)' : '(Dead)'}</span>}
        {username && <span className="text-lg">Score: {playerScore}</span>}
        {isPlayerAlive ? (
          <Button onClick={onClaimTerritory} variant="secondary" disabled={currentPathLength < 3 || isClaiming || !isGpsActive}>
            {isClaiming ? 'Claiming...' : 'Claim Territory'}
          </Button>
        ) : (
          <Button onClick={onRespawn} variant="secondary" disabled={respawnTimer > 0 || isRespawning}>
            {isRespawning ? 'Respawning...' : (respawnTimer > 0 ? `Respawn in ${respawnTimer}s` : 'Respawn')}
          </Button>
        )}
        {username && (
          <Button onClick={onToggleGpsTracking} variant="outline">
            {isGpsActive ? 'Stop GPS' : 'Start GPS'}
          </Button>
        )}
        {username && (
          <Button onClick={onShowChangeUsernameDialog} variant="outline">
            Change Username
          </Button>
        )}
        <HowToPlayDialog />
        <Button onClick={onLogout} variant="secondary">Logout</Button>
      </div>
    </header>
  );
};

export default GameHeader;