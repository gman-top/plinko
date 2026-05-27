import React, { Suspense, useMemo, useRef, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useGame } from '../state/gameStore.js';

import PlinkoBoard from './PlinkoBoard.jsx';
import Pegs from './Pegs.jsx';
import Slots from './Slots.jsx';
import Dispenser from './Dispenser.jsx';
import TriangleRails from './TriangleRails.jsx';
import Balls from './Balls.jsx';
import Lighting from './Lighting.jsx';
import { boardGeometry } from './geometry.js';

/**
 * Drives a slow camera breathing animation when idle, and pulls in
 * tighter on cinematic ball drops. Camera is stable so peg/ball motion
 * reads cleanly — we don't want it wobbling all the time.
 */
function CameraRig() {
  const { camera } = useThree();
  const target = useRef(new THREE.Vector3(0, 0, 0));
  const cinematic = useGame(s => s.cinematic);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    // Subtle breathing: ±0.04 z, ±0.02 y
    const baseZ = cinematic ? 10.8 : 12;
    const baseY = cinematic ? -0.4 : 0;
    const z = baseZ + Math.sin(t * 0.6) * 0.04;
    const y = baseY + Math.sin(t * 0.4) * 0.02;
    camera.position.lerp(new THREE.Vector3(0, y, z), 0.06);
    camera.lookAt(target.current);
  });
  return null;
}

export default function Scene() {
  const G = useMemo(() => boardGeometry(12), []);   // initial 12-row geometry
  const rows = useGame(s => s.rows);
  const liveG = useMemo(() => boardGeometry(rows), [rows]);

  return (
    <div className="scene-container">
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ position: [0, 0, 12], fov: 35, near: 0.1, far: 100 }}
        shadows
      >
        <color attach="background" args={[0, 0, 0]} />

        <Lighting />
        <CameraRig />

        <Suspense fallback={null}>
          <Physics gravity={[0, -28, 0]} timeStep={1 / 120}>
            {/* The static plinko board: backplate, rails, pegs as physics colliders */}
            <PlinkoBoard geometry={liveG} />
            <TriangleRails geometry={liveG} />
            <Pegs geometry={liveG} />
            <Slots geometry={liveG} />
            <Dispenser geometry={liveG} />
            {/* Active falling balls (one rigid body each, removed on landing) */}
            <Balls geometry={liveG} />
          </Physics>
        </Suspense>

        <EffectComposer multisampling={4}>
          <Bloom
            intensity={0.8}
            luminanceThreshold={0.25}
            luminanceSmoothing={0.35}
            mipmapBlur
          />
          <Vignette eskil={false} offset={0.18} darkness={0.55} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
