import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { AnimationAction } from 'three';
import { toonMat, addOutline } from '../scene/toon';

export interface CharacterHandle {
  model: THREE.Object3D;
  mixer: THREE.AnimationMixer | null;
  actions: {
    idle: AnimationAction | null;
    walk: AnimationAction | null;
    run:  AnimationAction | null;
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

        // Normalize GLB to ~1.8 m tall regardless of export units.
        const box = new THREE.Box3().setFromObject(model);
        const modelHeight = box.max.y - box.min.y;
        if (modelHeight > 0) model.scale.setScalar(1.8 / modelHeight);

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

        const idleClip = findClip(['Idle', 'idle', 'TPose', 'mixamo.com'], 0);
        const walkClip = findClip(['Walk', 'walk', 'Walking'], 1) ?? idleClip;
        const runClip  = findClip(['Run', 'run', 'Running', 'running', 'Jog', 'jog', 'Sprint', 'sprint'], 2) ?? walkClip;

        const idleAction = idleClip ? mixer.clipAction(idleClip) : null;
        const walkAction = walkClip ? mixer.clipAction(walkClip) : null;
        const runAction  = runClip  ? mixer.clipAction(runClip)  : null;

        idleAction?.play();

        resolve({
          model,
          mixer,
          actions: { idle: idleAction, walk: walkAction, run: runAction },
          isPlaceholder: false,
        });
      },
      undefined,
      (_err) => {
        // R19: GLB load failure → procedural humanoid placeholder
        const root = new THREE.Group();

        const skin = toonMat(0xf5c9a0);  // warm skin
        const shirt = toonMat(0xf0f0ee); // white shirt like reference
        const pants = toonMat(0x7a8c6a); // olive green shorts like reference

        // Head
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), skin);
        head.position.y = 1.62;
        root.add(head);

        // Torso
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.5, 0.2), shirt);
        torso.position.y = 1.15;
        root.add(torso);

        // Left arm
        const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.44, 0.12), shirt);
        lArm.position.set(-0.27, 1.12, 0);
        root.add(lArm);

        // Right arm
        const rArm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.44, 0.12), shirt);
        rArm.position.set(0.27, 1.12, 0);
        root.add(rArm);

        // Left leg
        const lLeg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), pants);
        lLeg.position.set(-0.11, 0.65, 0);
        root.add(lLeg);

        // Right leg
        const rLeg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), pants);
        rLeg.position.set(0.11, 0.65, 0);
        root.add(rLeg);

        // Anime outline on each body part
        for (const child of root.children) {
          if (child instanceof THREE.Mesh) addOutline(child, 0.06, 0x1a1a2e);
        }

        scene.add(root);

        resolve({
          model: root,
          mixer: null,
          actions: { idle: null, walk: null, run: null },
          isPlaceholder: true,
        });
      },
    );
  });
}
