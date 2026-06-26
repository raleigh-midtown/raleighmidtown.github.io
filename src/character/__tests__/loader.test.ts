import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';

// Mock GLTFLoader before importing loader
vi.mock('three/addons/loaders/GLTFLoader.js', () => {
  return {
    GLTFLoader: vi.fn().mockImplementation(() => ({
      load: vi.fn(),
    })),
  };
});

import { loadCharacter } from '../loader';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

describe('loadCharacter', () => {
  let scene: THREE.Scene;
  let mockLoad: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    scene = new THREE.Scene();
    mockLoad = vi.fn();
    (GLTFLoader as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      load: mockLoad,
    }));
  });

  it('returns isPlaceholder=true, mixer=null, model is Object3D on load failure', async () => {
    mockLoad.mockImplementation(
      (
        _url: string,
        _onLoad: unknown,
        _onProgress: unknown,
        onError: (err: Error) => void,
      ) => {
        onError(new Error('Failed to load GLB'));
      },
    );

    const handle = await loadCharacter(scene);

    expect(handle.isPlaceholder).toBe(true);
    expect(handle.mixer).toBeNull();
    expect(handle.model).toBeInstanceOf(THREE.Object3D);
    expect(handle.actions.idle).toBeNull();
    expect(handle.actions.walk).toBeNull();
  });

  it('returns isPlaceholder=false, mixer is AnimationMixer, both actions non-null on success', async () => {
    const clip1 = new THREE.AnimationClip('Idle', 1, []);
    const clip2 = new THREE.AnimationClip('Walk', 1, []);

    const mockGltf = {
      scene: new THREE.Group(),
      animations: [clip1, clip2],
      cameras: [],
      asset: {},
      scenes: [],
      userData: {},
      parser: {} as never,
    };

    mockLoad.mockImplementation(
      (
        _url: string,
        onLoad: (gltf: typeof mockGltf) => void,
      ) => {
        onLoad(mockGltf);
      },
    );

    const handle = await loadCharacter(scene);

    expect(handle.isPlaceholder).toBe(false);
    expect(handle.mixer).toBeInstanceOf(THREE.AnimationMixer);
    expect(handle.actions.idle).not.toBeNull();
    expect(handle.actions.walk).not.toBeNull();
  });

  it('placeholder model has children (humanoid group)', async () => {
    mockLoad.mockImplementation(
      (
        _url: string,
        _onLoad: unknown,
        _onProgress: unknown,
        onError: (err: Error) => void,
      ) => {
        onError(new Error('Failed to load GLB'));
      },
    );

    const handle = await loadCharacter(scene);

    // Placeholder is now a Group with body part meshes as children
    expect(handle.model).toBeInstanceOf(THREE.Object3D);
    expect(handle.model.children.length).toBeGreaterThan(0);
  });
});
