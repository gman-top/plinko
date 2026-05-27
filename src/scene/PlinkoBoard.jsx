import React, { useMemo } from 'react';
import * as THREE from 'three';
import { RigidBody } from '@react-three/rapier';

/**
 * The "machine" the pyramid sits inside.
 *
 * - A dark glass back-plate (catches the bloom but stays subtle)
 * - Side walls (invisible physics colliders) that keep balls inside
 *   the triangle even on weird bounces
 *
 * Everything else (pegs, rails, slots, dispenser) is composed on top
 * in dedicated components so each can manage its own state cleanly.
 */
export default function PlinkoBoard({ geometry }) {
  const { apexY, slotRowY, halfBaseW } = geometry;
  const totalH = apexY - slotRowY + 0.8;
  const totalW = halfBaseW * 2 + 0.5;

  // Build a triangle-clipped backplate geometry so the dark glass only
  // fills the pyramid silhouette (looks 100x cleaner than a rectangle)
  const triShape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, apexY);
    s.lineTo(halfBaseW + 0.18, slotRowY + 0.1);
    s.lineTo(-halfBaseW - 0.18, slotRowY + 0.1);
    s.closePath();
    return s;
  }, [apexY, slotRowY, halfBaseW]);

  return (
    <group>
      {/* Dark glass triangle backplate (slight inward bevel via extrude depth) */}
      <mesh position={[0, 0, -0.05]} receiveShadow>
        <extrudeGeometry
          args={[triShape, { depth: 0.08, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.04, bevelThickness: 0.04 }]}
        />
        <meshStandardMaterial
          color="#0a0805"
          metalness={0.4}
          roughness={0.85}
          emissive="#1f140a"
          emissiveIntensity={0.15}
        />
      </mesh>

      {/* Inner glow plane behind the pegs — paints a warm radial halo */}
      <mesh position={[0, 0, -0.02]}>
        <circleGeometry args={[Math.min(halfBaseW, (apexY - slotRowY) / 2) * 1.15, 64]} />
        <meshBasicMaterial
          color="#D47B37"
          transparent
          opacity={0.18}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Invisible physics floor under the slot row — catches any escapees */}
      <RigidBody type="fixed" colliders="cuboid" friction={0.4} restitution={0.1}>
        <mesh position={[0, slotRowY - 0.45, 0]} visible={false}>
          <boxGeometry args={[totalW + 4, 0.2, 1]} />
          <meshBasicMaterial />
        </mesh>
      </RigidBody>

      {/* Side walls so balls don't fly out laterally on aggressive bounces */}
      <RigidBody type="fixed" colliders="cuboid" friction={0.2} restitution={0.4}>
        <mesh position={[-halfBaseW - 0.25, 0, 0]} visible={false}>
          <boxGeometry args={[0.3, totalH + 1, 1]} />
          <meshBasicMaterial />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" colliders="cuboid" friction={0.2} restitution={0.4}>
        <mesh position={[halfBaseW + 0.25, 0, 0]} visible={false}>
          <boxGeometry args={[0.3, totalH + 1, 1]} />
          <meshBasicMaterial />
        </mesh>
      </RigidBody>
    </group>
  );
}
