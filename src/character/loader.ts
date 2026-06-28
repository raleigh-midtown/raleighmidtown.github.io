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

const ANIMATIONS_URL = '/models/animations.glb';

function loadGltf(url: string): Promise<THREE.AnimationClip[]> {
  return new Promise((resolve) => {
    new GLTFLoader().load(
      url,
      (gltf) => resolve(gltf.animations ?? []),
      undefined,
      () => resolve([]),
    );
  });
}

// Mixamo locomotion clips include Hips position keyframes (root motion). The character
// controller already moves the root Object3D, so the in-skeleton hip translation
// double-counts and slides the mesh off-camera. Strip those tracks before binding.
function stripRootMotion(clips: THREE.AnimationClip[]): THREE.AnimationClip[] {
  return clips.map(clip => {
    const cleaned = clip.clone();
    // Drop Hips position (root motion, controller handles XZ) AND Hips quaternion
    // (Soldier's bind pose orients hips differently than Michelle's — applying
    // Soldier's hip rotation flips Michelle upside down).
    cleaned.tracks = cleaned.tracks.filter(
      t => !/Hips\.(position|quaternion)$/i.test(t.name),
    );
    return cleaned;
  });
}

export async function loadCharacter(scene: THREE.Scene): Promise<CharacterHandle> {
  return new Promise((resolve) => {
    const loader = new GLTFLoader();
    loader.load(
      '/models/character.glb',
      async (gltf) => {
        const mesh = gltf.scene;

        // Normalize GLB to ~1.8 m tall regardless of export units.
        const box = new THREE.Box3().setFromObject(mesh);
        const meshHeight = box.max.y - box.min.y;
        if (meshHeight > 0) mesh.scale.setScalar(1.8 / meshHeight);

        // Mixamo characters export facing +Z, but the character controller treats
        // -Z as "forward" (W key). Wrap in a Group whose interior is rotated 180°
        // so the controller's yaw convention stays unchanged.
        const model = new THREE.Group();
        mesh.rotation.y = Math.PI;
        model.add(mesh);
        model.position.set(0, 0, 0);
        scene.add(model);

        // Pool of clips: the character's own + an external animation pack (e.g., Soldier
        // for Mixamo-compatible idle/walk/run when the character ships none of its own).
        const USABLE = /(idle|walk|run|jog|sprint|stand)/i;
        const ownClips = (gltf.animations ?? []).filter(c => USABLE.test(c.name));
        const externalClipsRaw = ownClips.length === 0 ? await loadGltf(ANIMATIONS_URL) : [];
        const externalClips = stripRootMotion(externalClipsRaw.filter(c => USABLE.test(c.name)));
        const clips = ownClips.length > 0 ? ownClips : externalClips;

        const hasAnimations = clips.length > 0;
        // Bind mixer to the inner skinned mesh (skeleton lives there), not the wrapper Group.
        const mixer = hasAnimations ? new THREE.AnimationMixer(mesh) : null;

        const findClip = (names: string[], fallbackIndex: number): THREE.AnimationClip | null => {
          const byName = names.reduce<THREE.AnimationClip | null>(
            (found, name) => found ?? THREE.AnimationClip.findByName(clips, name),
            null,
          );
          return byName ?? clips[fallbackIndex] ?? null;
        };

        const idleClip = hasAnimations ? findClip(['Idle', 'idle', 'mixamo.com'], 0) : null;
        const walkClip = hasAnimations ? (findClip(['Walk', 'walk', 'Walking'], 1) ?? idleClip) : null;
        const runClip  = hasAnimations ? (findClip(['Run', 'run', 'Running', 'running', 'Jog', 'jog', 'Sprint', 'sprint'], 2) ?? walkClip) : null;

        const idleAction = mixer && idleClip ? mixer.clipAction(idleClip) : null;
        const walkAction = mixer && walkClip ? mixer.clipAction(walkClip) : null;
        const runAction  = mixer && runClip  ? mixer.clipAction(runClip)  : null;

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
