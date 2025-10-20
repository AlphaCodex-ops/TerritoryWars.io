"use client";

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useSupabase } from '@/components/SessionContextProvider';
import { showError, showSuccess } from '@/utils/toast';

interface SetUsernameDialogProps {
  userId: string;
  onUsernameSet: (username: string) => void;
  isOpen: boolean;
}

const SetUsernameDialog: React.FC<SetUsernameDialogProps> = ({ userId, onUsernameSet, isOpen }) => {
  const { supabase } = useSupabase();
  const [newUsername, setNewUsername] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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
    }
    setIsSaving(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => { /* Prevent closing without setting username */ }}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Set Your Username</DialogTitle>
          <DialogDescription>
            Please choose a username to identify yourself in the game.
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