"use client";

import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

interface PathStartMarkerProps {
  position: L.LatLngExpression;
}

const PathStartMarker: React.FC<PathStartMarkerProps> = ({ position }) => {
  // Custom icon for the start of the path
  const startIcon = L.divIcon({
    className: 'custom-path-start-icon',
    html: '<div class="w-3 h-3 bg-blue-700 rounded-full border-2 border-white"></div>',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

  return (
    <Marker position={position} icon={startIcon}>
      <Popup>Path Start</Popup>
    </Marker>
  );
};

export default PathStartMarker;