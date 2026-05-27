import React, { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { Text } from '@react-three/drei';
import { RigidBody } from '@react-three/rapier';
import { useFrame } from '@react-three/fiber';
import { useGame } from '../state/gameStore.js';

/**
 * Multiplier slots at the base of the pyramid.
 *
 * Each slot is a small "chamber":
 *   - Coloured back panel (intensity follows the mult value)
 *   - Glossy front bevel
 *   - Vertical divider walls (also act as physics colliders so balls
 *     can't slip between cells)
 *   - Audiowide multiplier label on top
 *
 * The slot that the LAST ball landed in pulses with bright emissive.
 */
export default function Slots({ geometry }) {
  const slots = geometry.slots;
  const slotMults = useGame(s => s.slotMultipliers());
  const lastWin = useGame(s => s.lastWin);

  const lastHitAt = useRef({});
  useEffect(() => {
    if (lastWin) lastHitAt.current[lastWin.slotIndex] = performance.now();
  }, [lastWin]);

  return (
    <group>
      {slots.map((sl, i) => {
        const m = slotMults[i] ?? 0.5;
        const col = mColor(m);
        return (
          <Slot
            key={`s${i}-${m}`}
            slot={sl}
            mult={m}
            color={col.bright}
            colorDeep={col.deep}
            getPulse={() => {
              const t = lastHitAt.current[i] ?? -Infinity;
              return Math.max(0, 1 - (performance.now() - t) / 800);
            }}
          />
        );
      })}
    </group>
  );
}

function mColor(m) {
  if (m >= 50)  return { bright: '#FF2D2D', deep: '#7A0F0F' };
  if (m >= 10)  return { bright: '#FF6B1A', deep: '#8B2500' };
  if (m >= 3)   return { bright: '#FFB347', deep: '#5C3F08' };
  if (m >= 1)   return { bright: '#D4AF37', deep: '#5C3F08' };
  return            { bright: '#7A5908', deep: '#241A0F' };
}

function Slot({ slot, mult, color, colorDeep, getPulse }) {
  const bodyRef = useRef();
  const lightRef = useRef();

  useFrame(() => {
    const k = getPulse();
    if (bodyRef.current) {
      bodyRef.current.material.emissiveIntensity = 1.4 + k * 4.0;
    }
    if (lightRef.current) {
      lightRef.current.intensity = 0.4 + k * 3.0;
    }
  });

  const labelText = mult >= 100 ? `×${Math.round(mult)}`
                   : mult >= 10  ? `×${Math.round(mult)}`
                   : `×${mult.toFixed(1).replace('.0', '')}`;

  return (
    <group position={[slot.x, slot.y, 0]}>
      {/* Back-glow plate — paints colour onto the bg behind the slot */}
      <mesh position={[0, 0, -0.04]}>
        <planeGeometry args={[slot.w * 1.4, slot.h * 1.5]} />
        <meshBasicMaterial color={color} transparent opacity={0.12} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* Main body */}
      <mesh ref={bodyRef} castShadow>
        <boxGeometry args={[slot.w, slot.h, 0.18]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1.4}
          metalness={0.5}
          roughness={0.35}
        />
      </mesh>

      {/* Front glossy bevel (slightly smaller, lighter material) */}
      <mesh position={[0, 0, 0.1]}>
        <boxGeometry args={[slot.w * 0.92, slot.h * 0.82, 0.04]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive={color}
          emissiveIntensity={0.6}
          metalness={0.9}
          roughness={0.15}
          transparent
          opacity={0.18}
        />
      </mesh>

      {/* Per-slot point light pulses on landing */}
      <pointLight
        ref={lightRef}
        position={[0, 0, 0.4]}
        color={color}
        intensity={0.4}
        distance={1.6}
        decay={2}
      />

      {/* Top gold edge */}
      <mesh position={[0, slot.h / 2 - 0.005, 0.05]}>
        <boxGeometry args={[slot.w * 0.98, 0.025, 0.16]} />
        <meshStandardMaterial color="#FFE695" emissive="#FFE695" emissiveIntensity={2.0} metalness={1} roughness={0.1} />
      </mesh>

      {/* Multiplier label */}
      <Text
        position={[0, -0.005, 0.12]}
        fontSize={mult >= 100 ? 0.16 : 0.18}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        font="https://fonts.gstatic.com/s/audiowide/v20/l7gdbjpo0cum0ckerWCdlg_O.woff"
        outlineWidth={0.012}
        outlineColor="#000000"
      >
        {labelText}
      </Text>

      {/* Physics: a small invisible cuboid trigger zone above the slot
          centre. Balls collide with the bottom floor (in PlinkoBoard)
          first; this `userData.slotIndex` is read by Ball.jsx to figure
          out where the ball came to rest. */}
      <RigidBody type="fixed" colliders="cuboid" sensor>
        <mesh
          position={[0, -slot.h * 0.5 - 0.2, 0]}
          visible={false}
          userData={{ slotIndex: slot.index }}
        >
          <boxGeometry args={[slot.w * 0.95, 0.05, 0.5]} />
          <meshBasicMaterial />
        </mesh>
      </RigidBody>

      {/* Divider walls between slots (also physical) */}
      {slot.index === 0 && (
        <RigidBody type="fixed" colliders="cuboid">
          <mesh position={[-slot.w / 2 - 0.01, 0, 0]} visible={false}>
            <boxGeometry args={[0.04, slot.h, 0.4]} />
            <meshBasicMaterial />
          </mesh>
        </RigidBody>
      )}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[slot.w / 2 + 0.01, 0, 0]} visible={false}>
          <boxGeometry args={[0.04, slot.h, 0.4]} />
          <meshBasicMaterial />
        </mesh>
      </RigidBody>
    </group>
  );
}
