import React from 'react';

/**
 * Restrained casino lighting — the bloom postprocessing does most of
 * the heavy lifting on emissive materials, so the actual lights stay
 * gentle so we don't wash everything out into bronze.
 */
export default function Lighting() {
  return (
    <>
      {/* Very dim ambient so nothing goes pitch black */}
      <ambientLight intensity={0.18} color="#2a1f10" />
      {/* Main key light — gold tinted, from upper-right */}
      <directionalLight
        position={[5, 7, 6]}
        intensity={0.85}
        color="#FFE695"
      />
      {/* Cold rim from below-left for separation */}
      <directionalLight
        position={[-5, -4, 4]}
        intensity={0.25}
        color="#6080a0"
      />
    </>
  );
}
