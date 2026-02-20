'use client';

import { useEffect, useRef, useState } from 'react';

interface MapViewProps {
  coordinates: Array<[number, number]>;
  propertyId: string;
}

export default function MapView({ coordinates, propertyId }: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'satellite' | 'streets'>('satellite');

  // Calculate center from coordinates
  const center = coordinates.reduce(
    (acc, coord) => {
      return [acc[0] + coord[0] / coordinates.length, acc[1] + coord[1] / coordinates.length] as [
        number,
        number,
      ];
    },
    [0, 0] as [number, number]
  );

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      setMapError(
        'Mapbox token not configured. Set NEXT_PUBLIC_MAPBOX_TOKEN in your environment.'
      );
      return;
    }

    let map: mapboxgl.Map | null = null;

    async function initMap() {
      try {
        const mapboxgl = (await import('mapbox-gl')).default;
        await import('mapbox-gl/dist/mapbox-gl.css');

        mapboxgl.accessToken = token!;

        map = new mapboxgl.Map({
          container: mapContainerRef.current!,
          style:
            viewMode === 'satellite'
              ? 'mapbox://styles/mapbox/satellite-streets-v12'
              : 'mapbox://styles/mapbox/streets-v12',
          center: center,
          zoom: 17,
        });

        map.addControl(new mapboxgl.NavigationControl(), 'top-right');
        map.addControl(new mapboxgl.ScaleControl(), 'bottom-left');

        map.on('load', () => {
          if (!map) return;

          // Add property boundary polygon
          map.addSource('property-boundary', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {
                id: propertyId,
              },
              geometry: {
                type: 'Polygon',
                coordinates: [coordinates],
              },
            },
          });

          // Fill layer
          map.addLayer({
            id: 'property-fill',
            type: 'fill',
            source: 'property-boundary',
            paint: {
              'fill-color': '#F97316',
              'fill-opacity': 0.2,
            },
          });

          // Border layer
          map.addLayer({
            id: 'property-border',
            type: 'line',
            source: 'property-boundary',
            paint: {
              'line-color': '#F97316',
              'line-width': 3,
              'line-dasharray': [2, 1],
            },
          });

          setMapLoaded(true);
        });

        mapRef.current = map;
      } catch {
        setMapError('Failed to load map. Please check your internet connection.');
      }
    }

    initMap();

    return () => {
      if (map) {
        map.remove();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  // Fallback when Mapbox is not configured
  if (mapError) {
    return (
      <div>
        {/* Map placeholder with coordinate visualization */}
        <div className="relative bg-gray-100 rounded-lg overflow-hidden" style={{ height: '400px' }}>
          {/* Grid background */}
          <div className="absolute inset-0 opacity-10">
            <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="gray" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
          </div>

          {/* Center content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {/* Property outline visualization */}
            <div className="relative w-48 h-48 mb-4">
              <svg
                viewBox="0 0 200 200"
                className="w-full h-full"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Normalize coordinates to SVG viewport */}
                {coordinates.length > 0 && (() => {
                  const lngs = coordinates.map((c) => c[0]);
                  const lats = coordinates.map((c) => c[1]);
                  const minLng = Math.min(...lngs);
                  const maxLng = Math.max(...lngs);
                  const minLat = Math.min(...lats);
                  const maxLat = Math.max(...lats);
                  const padding = 20;
                  const width = 200 - padding * 2;
                  const height = 200 - padding * 2;
                  const rangeLng = maxLng - minLng || 0.001;
                  const rangeLat = maxLat - minLat || 0.001;

                  const points = coordinates
                    .map((coord) => {
                      const x = padding + ((coord[0] - minLng) / rangeLng) * width;
                      const y = padding + (1 - (coord[1] - minLat) / rangeLat) * height;
                      return `${x},${y}`;
                    })
                    .join(' ');

                  return (
                    <>
                      <polygon
                        points={points}
                        fill="rgba(249, 115, 22, 0.15)"
                        stroke="#F97316"
                        strokeWidth="2.5"
                        strokeDasharray="8,4"
                      />
                      {coordinates.map((coord, i) => {
                        const x = padding + ((coord[0] - minLng) / rangeLng) * width;
                        const y = padding + (1 - (coord[1] - minLat) / rangeLat) * height;
                        return (
                          <circle
                            key={i}
                            cx={x}
                            cy={y}
                            r="4"
                            fill="#F97316"
                            stroke="white"
                            strokeWidth="2"
                          />
                        );
                      })}
                    </>
                  );
                })()}
              </svg>
            </div>

            <div className="text-center px-4">
              <p className="text-sm font-medium text-gray-700 mb-1">
                Property Boundary - {propertyId}
              </p>
              <p className="text-xs text-gray-500">
                Center: {center[1].toFixed(4)}N, {center[0].toFixed(4)}E
              </p>
              <p className="text-xs text-yellow-600 mt-2">
                {mapError}
              </p>
            </div>
          </div>
        </div>

        {/* Coordinate table */}
        <div className="mt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">
            Boundary Coordinates
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 pr-4 text-gray-500 font-medium">
                    Point
                  </th>
                  <th className="text-left py-2 pr-4 text-gray-500 font-medium">
                    Latitude
                  </th>
                  <th className="text-left py-2 text-gray-500 font-medium">
                    Longitude
                  </th>
                </tr>
              </thead>
              <tbody>
                {coordinates.map((coord, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2 pr-4 font-medium text-gray-700">
                      {i + 1}
                    </td>
                    <td className="py-2 pr-4 font-mono text-gray-600">
                      {coord[1].toFixed(6)}
                    </td>
                    <td className="py-2 font-mono text-gray-600">
                      {coord[0].toFixed(6)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* View mode toggle */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setViewMode('satellite')}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
            viewMode === 'satellite'
              ? 'bg-bhulekh-saffron-500 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Satellite
        </button>
        <button
          onClick={() => setViewMode('streets')}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
            viewMode === 'streets'
              ? 'bg-bhulekh-saffron-500 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Streets
        </button>
      </div>

      {/* Map container */}
      <div
        ref={mapContainerRef}
        className="w-full rounded-lg overflow-hidden"
        style={{ height: '400px' }}
      />

      {/* Loading indicator */}
      {!mapLoaded && !mapError && (
        <div className="flex items-center justify-center gap-2 mt-4 text-sm text-gray-500">
          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading map...
        </div>
      )}

      {/* Coordinates */}
      <div className="mt-4 text-xs text-gray-500">
        <span>
          Center: {center[1].toFixed(4)}N, {center[0].toFixed(4)}E |{' '}
          {coordinates.length} boundary points
        </span>
      </div>
    </div>
  );
}
