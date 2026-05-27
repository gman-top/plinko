import React from 'react';
import * as THREE from 'three';
import { RigidBody } from '@react-three/rapier';

/**
 * The "machine" the pyramid sits inside.
 *
 * Previously this drew an extruded triangle backplate + a big orange
 * glow circle behind the pegs. Both ended up dominating the frame in
 * a washed-out bronze tone, hiding the pegs and crashing into the
 * play button. They're gone now — the Plinko board is invisible
 * structurally, the visible content is just dispenser + rails + pegs
 * + slots + balls floating against the Figma gold-spheres bg.
 *
 * What's left here is purely physics: bottom floor + two side walls
 * that catch any ball that escapes the cells.
 */
export default function PlinkoBoard({ geometry }) {
  const { apexY, slotRowY, halfBaseW } = geometry;
  const totalH = apexY - slotRowY + 0.8;

  return (
    <group>
      {/* Invisible physics floor under the slot row */}
      <RigidBody type="fixed" colliders="cuboid" friction={0.4} restitution={0.05}>
        <mesh position={[0, slotRowY - 0.45, 0]} visible={false}>
          <boxGeometry args={[halfBaseW * 2 + 4, 0.2, 1]} />
          <meshBasicMaterial />
        </mesh>
      </RigidBody>

      {/* Side walls — ball doesn't escape laterally */}
      <RigidBody type="fixed" colliders="cuboid" friction={0.2} restitution={0.3}>
        <mesh position={[-halfBaseW - 0.25, 0, 0]} visible={false}>
          <boxGeometry args={[0.3, totalH + 1, 1]} />
          <meshBasicMaterial />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" colliders="cuboid" friction={0.2} restitution={0.3}>
        <mesh position={[halfBaseW + 0.25, 0, 0]} visible={false}>
          <boxGeometry args={[0.3, totalH + 1, 1]} />
          <meshBasicMaterial />
        </mesh>
      </RigidBody>
    </group>
  );
}
