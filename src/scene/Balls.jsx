import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RigidBody, BallCollider } from '@react-three/rapier';
import { useFrame } from '@react-three/fiber';
import { useGame } from '../state/gameStore.js';
import { BALL_TYPES } from '../state/config.js';

/**
 * Renders one rigid-body sphere per live ball. Each ball has:
 *   - Layered emissive material for the Figma "glossy orange orb" look
 *   - A point light following it (gives the room a moving warm spot)
 *   - A trail of fading after-images (small spheres in last positions)
 *
 * When a ball drops below the slot row it's resolved against the closest
 * slot and removed from the store.
 */
export default function Balls({ geometry }) {
  const liveBalls = useGame(s => s.liveBalls);
  const slots = geometry.slots;
  return (
    <group>
      {liveBalls.map(b => (
        <Ball
          key={b.id}
          id={b.id}
          typeId={b.type}
          bet={b.bet}
          slots={slots}
          radius={geometry.ballR}
          apexY={geometry.apexY}
          slotRowY={geometry.slotRowY}
        />
      ))}
    </group>
  );
}

function Ball({ id, typeId, bet, slots, radius, apexY, slotRowY }) {
  const rbRef = useRef();
  const meshRef = useRef();
  const lightRef = useRef();
  const trailRef = useRef([]);
  const resolved = useRef(false);

  const type = BALL_TYPES[typeId] || BALL_TYPES.gold;
  const resolveLanding = useGame(s => s.resolveLanding);
  const removeBall = useGame(s => s.removeBall);

  // Trail buffer (last N positions)
  const TRAIL_LEN = 8;
  const [trail, setTrail] = useState(
    () => Array.from({ length: TRAIL_LEN }, () => new THREE.Vector3(0, apexY, 0))
  );

  useFrame((_, dt) => {
    const rb = rbRef.current;
    if (!rb) return;
    const t = rb.translation();
    const v = rb.linvel();

    // Update trail (shift left, push new)
    trail.shift();
    trail.push(new THREE.Vector3(t.x, t.y, t.z));

    if (lightRef.current) {
      lightRef.current.position.set(t.x, t.y, 0.6);
      lightRef.current.intensity = 1.4 + Math.min(Math.hypot(v.x, v.y) * 0.04, 1.5);
    }

    // Resolve landing: y has dropped well below the slot row + speed low
    if (!resolved.current && t.y < slotRowY - 0.35 && Math.abs(v.y) < 1.5) {
      resolved.current = true;
      // Find nearest slot index by x
      let idx = 0, best = Infinity;
      for (let i = 0; i < slots.length; i++) {
        const d = Math.abs(slots[i].x - t.x);
        if (d < best) { best = d; idx = i; }
      }
      const result = resolveLanding(id, type, bet, idx);
      if (window.__plinkoLanding) window.__plinkoLanding(t.x, t.y, idx, result);
      // Remove the ball after a short visual settle
      setTimeout(() => removeBall(id), 250);
    }

    // Hard kill if ball escapes physics world
    if (t.y < slotRowY - 3 || Math.abs(t.x) > 8) {
      if (!resolved.current) {
        resolved.current = true;
        removeBall(id);
      }
    }
  });

  return (
    <group>
      <RigidBody
        ref={rbRef}
        position={[ (Math.random() - 0.5) * 0.02, apexY - 0.15, 0]}
        colliders={false}
        restitution={0.45}
        friction={0.18}
        linearDamping={0.2}
        angularDamping={0.6}
        ccd
      >
        <BallCollider args={[radius]} />
        <mesh ref={meshRef} castShadow>
          <sphereGeometry args={[radius, 32, 32]} />
          <meshPhysicalMaterial
            color={type.core}
            emissive={type.glow}
            emissiveIntensity={1.6}
            metalness={0.65}
            roughness={0.22}
            clearcoat={1}
            clearcoatRoughness={0.1}
            iridescence={type.id === 'wild' ? 0.6 : 0}
            iridescenceIOR={1.6}
          />
        </mesh>
      </RigidBody>

      {/* Moving point light follows the ball through the field */}
      <pointLight
        ref={lightRef}
        color={type.glow}
        intensity={1.4}
        distance={1.8}
        decay={2}
      />

      {/* Trail (small spheres at past positions, fading out) */}
      {trail.map((p, i) => {
        const k = i / TRAIL_LEN;
        const tr = radius * (0.45 + k * 0.8);
        return (
          <mesh key={i} position={p.toArray()}>
            <sphereGeometry args={[tr, 10, 10]} />
            <meshBasicMaterial
              color={type.glow}
              transparent
              opacity={0.04 + k * 0.32}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        );
      })}
    </group>
  );
}
