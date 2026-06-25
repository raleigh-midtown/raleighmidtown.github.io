import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { AnimationAction } from 'three';

export interface CharacterHandle {
  model: THREE.Object3D;
  mixer: THREE.AnimationMixer | null;
  actions: {
    idle: AnimationAction | null;
    walk: AnimationAction | null;
  };
  isPlaceholder: boolean;
}

export async function loadCharacter(scene: THREE.Scene): Promise<CharacterHandle> {
  return new Promise((resolve) => {
    const loader = new GLTFLoader();
    loader.load(
      '/models/character.glb',
      (gltf) => {
        const model = gltf.scene;
        model.position.set(0, 0, 0);
        scene.add(model);

        const mixer = new THREE.AnimationMixer(model);
        const clips = gltf.animations;

        // Try to find clips by name first (Mixamo names may vary)
        // then fall back to index
        const findClip = (names: string[], fallbackIndex: number): THREE.AnimationClip | null => {
          const byName = names.reduce<THREE.AnimationClip | null>(
            (found, name) => found ?? THREE.AnimationClip.findByName(clips, name),
            null,
          );
          return byName ?? clips[fallbackIndex] ?? null;
        };

        const idleClip = findClip(['Idle', 'idle', 'mixamo.com'], 0);
        const walkClipFound = findClip(['Walk', 'walk', 'Walking'], 1);
        const walkClip = walkClipFound ?? idleClip;

        const idleAction = idleClip ? mixer.clipAction(idleClip) : null;
        const walkAction = walkClip ? mixer.clipAction(walkClip) : null;

        idleAction?.play();

        resolve({
          model,
          mixer,
          actions: { idle: idleAction, walk: walkAction },
          isPlaceholder: false,
        });
      },
      undefined,
      (_err) => {
        // R19: GLB load failure → procedural capsule placeholder
        const geo = new THREE.CapsuleGeometry(0.4, 1.2);
        const mat = new THREE.MeshStandardMaterial({ color: 0x4488ff });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(0, 1.0, 0); // 1m above ground
        scene.add(mesh);

        resolve({
          model: mesh,
          mixer: null,
          actions: { idle: null, walk: null },
          isPlaceholder: true,
        });
      },
    );
  });
}
