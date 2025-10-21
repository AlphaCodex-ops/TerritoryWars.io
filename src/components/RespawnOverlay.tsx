"use client";

import React from 'react';
import { Button } from '@/components/ui/button';

interface RespawnOverlayProps {
  respawnTimer: number;
  isPlayerAlive: boolean;
  onRespawn: () => void;
  isRespawning: boolean;
}

const RespawnOverlay: React.FC<RespawnOverlayProps> = ({ respawnTimer, isPlayerAlive, onRespawn, isRespawning }) => {
  if (isPlayerAlive || respawnTimer === 0) {
    return null;
  }

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-75 text-white p-4 z-[1002]">
      <h1 className="text-5xl font-bold mb-4">YOU DIED!</h1>
      <p className="text-2xl mb-8">Respawning in {respawnTimer} seconds...</p>
      <Button onClick={onRespawn} disabled={respawnTimer > 0 || isRespawning} className="text-lg px-8 py-4">
        {isRespawning ? 'Respawning...' : 'Respawn Now'}
      </Button>
    </div>
  );
};

export default RespawnOverlay;