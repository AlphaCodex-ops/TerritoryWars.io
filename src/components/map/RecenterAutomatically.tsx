"use client";

import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

interface RecenterAutomaticallyProps {
  lat: number;
  lng: number;
}

const RecenterAutomatically: React.FC<RecenterAutomaticallyProps> = ({ lat, lng }) => {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) {
      map.setView([lat, lng], map.getZoom());
    }
  }, [lat, lng, map]);
  return null;
};

export default RecenterAutomatically;