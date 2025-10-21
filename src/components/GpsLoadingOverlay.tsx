"use client";

import React from 'react';
import { Session } from '@supabase/supabase-js';
import SetUsernameDialog from '@/components/SetUsernameDialog';
import { MadeWithDyad } from '@/components/made-with-dyad';

interface GpsLoadingOverlayProps {
  session: Session | null;
  isUsernameDialogOpen: boolean;
  handleUsernameSet: (username: string) => void;
}

const GpsLoadingOverlay: React.FC<GpsLoadingOverlayProps> = ({
  session,
  isUsernameDialogOpen,
  handleUsernameSet,
}) => {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white p-4 z-[1001]">
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
};

export default GpsLoadingOverlay;