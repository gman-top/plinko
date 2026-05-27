import React from 'react';

/**
 * Casino spotlight setup:
 * - Soft warm ambient so nothing goes pitch black
 * - Strong key light from the upper-right (gold-tinted) for the
 *   metallic sheen on pegs and balls
 * - Cool rim light from the lower-left for separation against the bg
 * - One tight point light hovering above the dispenser to anchor the apex
 */
export default function Lighting() {
  return (
    <>
      <ambientLight intensity={0.35} color="#3a2d18" />
      <directionalLight
        position={[6, 8, 8]}
        intensity={1.6}
        color="#FFE695"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight
        position={[-6, -3, 5]}
        intensity={0.45}
        color="#6080a0"
      />
      <pointLight
        position={[0, 4.4, 1.5]}
        intensity={1.2}
        distance={6}
        decay={2}
        color="#FFB347"
      />
      <pointLight
        position={[0, -3.6, 1.5]}
        intensity={0.6}
        distance={5}
        decay={2}
        color="#FFE695"
      />
    </>
  );
}
