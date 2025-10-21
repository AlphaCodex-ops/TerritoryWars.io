"use client";

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useSupabase } from '@/components/SessionContextProvider';
import { showError, showSuccess } from '@/utils/toast';

interface SetUsernameDialogProps {
  userId: string;
  onUsernameSet: (username: string) => void;
  isOpen: boolean;
  onClose: () => void; // New prop to handle closing the dialog
  isInitialSetup?: boolean; // New prop to indicate if it's the first time setting username
}

const SetUsernameDialog: React.FC<SetUsernameDialogProps> = ({ userId, onUsernameSet, isOpen, onClose, isInitialSetup = false }) => {
  const { supabase } = useSupabase();
  const [newUsername, setNewUsername] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Reset username input when dialog opens
  useEffect(() => {
    if (isOpen) {
      setNewUsername(''); // Clear input when dialog opens
    }
  }, [isOpen]);

  const handleSaveUsername = async () => {
    if (!newUsername.trim()) {
      showError('Username cannot be empty.');
      return;
    }

    setIsSaving(true);
    const { error } = await supabase
      .from('players')
      .update({ username: newUsername.trim(), updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    if (error) {
      showError('Failed to set username: ' + error.message);
      console.error('Error setting username:', error);
    } else {
      showSuccess('Username set successfully!');
      onUsernameSet(newUsername.trim());
      onClose(); // Close the dialog after successful save
    }
    setIsSaving(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open && !isInitialSetup) {
        onClose(); // Allow closing if not in initial setup mode
      }
      // If it's initial setup and `open` is false, we do nothing,
      // as it should only close via `onUsernameSet` after a successful save.
    }}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isInitialSetup ? 'Set Your Username' : 'Change Your Username'}</DialogTitle>
          <DialogDescription>
            {isInitialSetup ? 'Please choose a username to identify yourself in the game.' : 'Enter a new username.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Input
            id="username"
            placeholder="Enter your username"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            className="col-span-3"
            disabled={isSaving}
          />
        </div>
        <DialogFooter>
          <Button type="submit" onClick={handleSaveUsername} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Username'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SetUsernameDialog;