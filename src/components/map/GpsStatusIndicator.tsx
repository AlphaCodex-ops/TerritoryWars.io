"use client";

import React from 'react';
import { Gps, GpsOff } from 'lucide-react';

interface GpsStatusIndicatorProps {
  isGpsActive: boolean;
}

const GpsStatusIndicator: React.FC<GpsStatusIndicatorProps> = ({ isGpsActive }) => {
  return (
    <div className="absolute bottom-4 left-4 z-[1000] bg-white dark:bg-gray-800 p-2 rounded-md shadow-lg flex items-center space-x-2 text-sm">
      {isGpsActive ? (
        <Gps className="h-4 w-4 text-green-500" />
      ) : (
        <GpsOff className="h-4 w-4 text-red-500" />
      )}
      <span className={isGpsActive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
        GPS {isGpsActive ? 'Active' : 'Inactive'}
      </span>
    </div>
  );
};

export default GpsStatusIndicator;