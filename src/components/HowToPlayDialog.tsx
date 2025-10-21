"use client";

import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { HelpCircle } from 'lucide-react';

interface HowToPlayDialogProps {
  children?: React.ReactNode;
}

const HowToPlayDialog: React.FC<HowToPlayDialogProps> = ({ children }) => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="icon" className="h-8 w-8">
            <HelpCircle className="h-4 w-4" />
            <span className="sr-only">How to Play</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>How to Play Paper.io GPS</DialogTitle>
          <DialogDescription>
            Conquer territory using your real-world location!
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
          <p>
            **Objective:** Claim as much territory as possible by drawing paths and enclosing areas.
          </p>
          <h3 className="font-semibold text-md">Gameplay:</h3>
          <ul className="list-disc list-inside space-y-2">
            <li>
              **Movement:** Your player moves based on your real-world GPS location. Keep moving to draw a path!
            </li>
            <li>
              **Claiming Territory:** To claim territory, you must draw a path that connects back to your existing territory or forms a closed loop. Once a loop is closed, the enclosed area becomes yours.
            </li>
            <li>
              **Killing Opponents:**
              <ul className="list-disc list-inside ml-4">
                <li>If you cross another player's path, they die.</li>
                <li>If you enclose another player within your newly claimed territory, they die.</li>
              </ul>
            </li>
            <li>
              **Being Killed:**
              <ul className="list-disc list-inside ml-4">
                <li>If you cross your own path, you die.</li>
                <li>If you cross your own claimed territory while drawing a path, you die.</li>
                <li>If another player crosses your path, you die.</li>
                <li>If you enter another player's claimed territory, you die.</li>
              </ul>
            </li>
            <li>
              **Respawn:** If you die, you will respawn after a short delay, losing all your claimed territory and score.
            </li>
            <li>
              **Score:** Your score is based on the total area of the territory you control.
            </li>
          </ul>
          <p className="italic">
            Keep an eye on the leaderboard to see who's dominating the map!
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default HowToPlayDialog;