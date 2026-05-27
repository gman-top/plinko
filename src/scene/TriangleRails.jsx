import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { RigidBody } from '@react-three/rapier';

/**
 * The two diagonal "rails" that visually frame the pyramid + act as
 * angled walls so balls leaving the bottom corners get redirected into
 * the right slots instead of bouncing out.
 *
 * Each rail is a thin extruded gold bar from apex → base corner, with
 * an emissive material and a slim "comet" mesh that travels down the
 * rail on a 3s loop for the cinematic gold sweep.
 */
export default function TriangleRails({ geometry }) {
  const { apexY, slotRowY, halfBaseW } = geometry;
  const apex = useMemo(() => new THREE.Vector3(0, apexY, 0), [apexY]);
  const baseL = useMemo(() => new THREE.Vector3(-halfBaseW, slotRowY, 0), [halfBaseW, slotRowY]);
  const baseR = useMemo(() => new THREE.Vector3( halfBaseW, slotRowY, 0), [halfBaseW, slotRowY]);

  return (
    <group>
      <Rail from={apex} to={baseL} side="left" />
      <Rail from={apex} to={baseR} side="right" />
      {/* Apex jewel — anchors the top of the V */}
      <mesh position={[0, apexY, 0]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshStandardMaterial
          color="#FFF6D8"
          emissive="#FFE695"
          emissiveIntensity={2.2}
          metalness={1}
          roughness={0.1}
        />
      </mesh>
      {/* Base jewels */}
      {[baseL, baseR].map((p, i) => (
        <mesh key={i} position={p.toArray()}>
          <sphereGeometry args={[0.07, 16, 16]} />
          <meshStandardMaterial
            color="#FFF6D8"
            emissive="#FFB347"
            emissiveIntensity={1.6}
            metalness={1}
            roughness={0.2}
          />
        </mesh>
      ))}
    </group>
  );
}

function Rail({ from, to, side }) {
  // Compute length + rotation to align a slim cylinder from `from` to `to`
  const dir = useMemo(() => new THREE.Vector3().subVectors(to, from), [from, to]);
  const len = dir.length();
  const mid = useMemo(() => new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5), [from, to]);

  // Cylinder orientation: align its Y axis to the direction vector
  const quaternion = useMemo(() => {
    const up = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
    return q;
  }, [dir]);

  const cometRef = useRef();

  // Travel a small bright sphere down the rail on a 3s loop
  useFrame(({ clock }) => {
    if (!cometRef.current) return;
    const t = ((clock.getElapsedTime() + (side === 'right' ? 1.5 : 0)) / 3.0) % 1;
    const p = new THREE.Vector3().lerpVectors(from, to, t);
    cometRef.current.position.copy(p);
    // Fade in/out at edges
    const fade = Math.min(1, t * 6, (1 - t) * 6);
    cometRef.current.material.opacity = fade;
    cometRef.current.material.emissiveIntensity = 2.5 * fade;
  });

  return (
    <group>
      {/* The rail bar itself — thin metallic gold tube */}
      <group position={mid.toArray()} quaternion={quaternion.toArray()}>
        <mesh castShadow>
          <cylinderGeometry args={[0.028, 0.028, len, 12]} />
          <meshStandardMaterial
            color="#D4AF37"
            emissive="#FFE695"
            emissiveIntensity={1.4}
            metalness={1}
            roughness={0.2}
          />
        </mesh>
      </group>

      {/* Animated comet — small bright sphere that runs the rail */}
      <mesh ref={cometRef} position={from.toArray()}>
        <sphereGeometry args={[0.09, 16, 16]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#FFE695"
          emissiveIntensity={2.5}
          transparent
          opacity={0}
        />
      </mesh>
    </group>
  );
}
