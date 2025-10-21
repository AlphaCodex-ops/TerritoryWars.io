"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { MadeWithDyad } from '@/components/made-with-dyad';

const HomePage: React.FC = () => {
  const navigate = useNavigate();

  const handleStartPlay = () => {
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 text-white p-4">
      <div className="text-center max-w-2xl">
        <h1 className="text-5xl md:text-7xl font-extrabold mb-6 drop-shadow-lg">
          Paper.io GPS Game
        </h1>
        <p className="text-lg md:text-xl mb-10 opacity-90">
          Claim territory, outsmart opponents, and dominate the map using your real-world location!
        </p>
        <Button
          onClick={handleStartPlay}
          className="px-8 py-4 text-xl font-semibold bg-white text-blue-600 hover:bg-gray-100 transition-all duration-300 ease-in-out shadow-lg hover:shadow-xl"
        >
          Start Playing
        </Button>
      </div>
      <div className="absolute bottom-4">
        <MadeWithDyad />
      </div>
    </div>
  );
};

export default HomePage;