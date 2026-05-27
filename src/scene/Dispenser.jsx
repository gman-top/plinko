import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

/**
 * Top dispenser:
 *   - Outer gold ring (torus)
 *   - Inner dark glass disc
 *   - 11 small orange ball spheres clustered inside, rotating slowly
 *     to give the "balls jiggling in the bowl" effect
 *   - A spotlight pointing down to highlight the area where balls drop
 */
export default function Dispenser({ geometry }) {
  const apexY = geometry.apexY;
  const groupRef = useRef();
  const ballsRef = useRef();

  // Position dispenser just above the apex
  const cy = apexY + 0.65;

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ballsRef.current) {
      // Gentle jiggle: slow rotation around z plus tiny lateral shake
      ballsRef.current.rotation.z = Math.sin(t * 0.35) * 0.18;
      ballsRef.current.position.x = Math.sin(t * 0.9) * 0.012;
      ballsRef.current.position.y = cy + Math.sin(t * 1.2) * 0.008;
    }
    if (groupRef.current) {
      // Subtle breathing scale on the ring
      const k = 1 + Math.sin(t * 1.5) * 0.012;
      groupRef.current.scale.set(k, k, 1);
    }
  });

  const ballOffsets = useMemo(() => {
    // 11 small balls arranged in a clustered hexagon-ish pattern
    return [
      [-0.18,  0.04], [-0.08, -0.05], [ 0.06,  0.05], [ 0.18, -0.03],
      [-0.12,  0.16], [ 0.04,  0.16], [ 0.16,  0.12],
      [-0.20, -0.12], [-0.05, -0.16], [ 0.10, -0.14], [ 0.22,  0.02],
    ];
  }, []);

  return (
    <group position={[0, 0, 0]}>
      <group ref={groupRef} position={[0, cy, 0]}>
        {/* Outer gold ring */}
        <mesh>
          <torusGeometry args={[0.5, 0.04, 16, 64]} />
          <meshStandardMaterial
            color="#FFE695"
            emissive="#FFB347"
            emissiveIntensity={1.5}
            metalness={1}
            roughness={0.15}
          />
        </mesh>
        {/* Subtle outer halo */}
        <mesh position={[0, 0, -0.02]}>
          <circleGeometry args={[0.7, 48]} />
          <meshBasicMaterial color="#FFB347" transparent opacity={0.18} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        {/* Inner dark disc (the "bowl") */}
        <mesh position={[0, 0, -0.04]}>
          <circleGeometry args={[0.46, 48]} />
          <meshStandardMaterial color="#0a0805" metalness={0.5} roughness={0.65} />
        </mesh>

        {/* Drop slot below the ring */}
        <mesh position={[0, -0.55, 0]}>
          <boxGeometry args={[0.24, 0.05, 0.06]} />
          <meshStandardMaterial
            color="#0a0805"
            emissive="#D4AF37"
            emissiveIntensity={0.4}
            metalness={0.7}
            roughness={0.3}
          />
        </mesh>
      </group>

      {/* The cluster of orange balls inside the bowl */}
      <group ref={ballsRef} position={[0, cy, 0.02]}>
        {ballOffsets.map((o, i) => (
          <mesh key={i} position={[o[0], o[1], 0]} castShadow>
            <sphereGeometry args={[0.085, 16, 16]} />
            <meshStandardMaterial
              color="#FFB347"
              emissive="#FA7909"
              emissiveIntensity={0.7}
              metalness={0.55}
              roughness={0.3}
            />
          </mesh>
        ))}
      </group>

      {/* A small downward spot that lights the dispenser opening */}
      <spotLight
        position={[0, cy + 0.6, 0.8]}
        target-position={[0, cy - 0.5, 0]}
        angle={0.45}
        penumbra={0.7}
        distance={3}
        intensity={2.4}
        color="#FFE695"
      />
    </group>
  );
}
