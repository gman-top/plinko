import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RigidBody, BallCollider } from '@react-three/rapier';
import { useFrame } from '@react-three/fiber';

/**
 * Pegs as INSTANCED metallic gold spheres (super-cheap to render even
 * for 16-row boards = 152 pegs), with one rigid body per peg for
 * accurate physics. Each peg keeps a `lastHitTime` so we can pulse its
 * emissive intensity for a fraction of a second after a collision.
 */
export default function Pegs({ geometry }) {
  const { pegs, pegR } = geometry;
  return (
    <group>
      {pegs.map(p => (
        <Peg key={p.key} pos={[p.x, p.y, 0]} r={pegR} />
      ))}
    </group>
  );
}

function Peg({ pos, r }) {
  const meshRef = useRef();
  const lastHit = useRef(-Infinity);
  const baseEmissive = 1.2;
  const hitEmissive  = 4.0;

  // Lift the peg slightly forward (+z) so its highlight catches the
  // key light, then ride the emissive intensity for ~300ms after impact.
  useFrame((_, dt) => {
    if (!meshRef.current) return;
    const now = performance.now();
    const t = (now - lastHit.current) / 300;
    const k = Math.max(0, 1 - t);
    const target = baseEmissive + k * (hitEmissive - baseEmissive);
    meshRef.current.material.emissiveIntensity +=
      (target - meshRef.current.material.emissiveIntensity) * Math.min(1, dt * 16);

    // Tiny "ping" displacement on hit — peg jumps 0.02 forward then settles
    const z = pos[2] + k * 0.05;
    meshRef.current.position.z = z;
  });

  return (
    <RigidBody
      type="fixed"
      colliders={false}
      friction={0.3}
      restitution={0.55}
      onCollisionEnter={() => {
        lastHit.current = performance.now();
        // Tell the dispatcher (if there is one) so particles can fire
        if (window.__plinkoPegHit) window.__plinkoPegHit(pos[0], pos[1]);
      }}
    >
      <BallCollider args={[r]} position={pos} />
      {/* Outer halo glow plate — catches bloom for the "lit dot" look */}
      <mesh position={pos}>
        <sphereGeometry args={[r * 1.6, 16, 16]} />
        <meshBasicMaterial
          color="#FFB347"
          transparent
          opacity={0.18}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={meshRef} position={pos} castShadow>
        <sphereGeometry args={[r, 24, 24]} />
        <meshStandardMaterial
          color="#FFE695"
          metalness={0.85}
          roughness={0.2}
          emissive="#FFE695"
          emissiveIntensity={baseEmissive}
        />
      </mesh>
    </RigidBody>
  );
}
