import * as THREE from 'three';

export class CameraRig {
  private pivot: THREE.Object3D;
  private camera: THREE.PerspectiveCamera;
  // Offset from character: back 5m, up 2m
  private readonly offset = new THREE.Vector3(0, 2, 5);
  // Lerp coefficient: frame-rate independent
  private readonly lerpCoeff = 8;

  ready = false;

  constructor(camera: THREE.PerspectiveCamera, scene: THREE.Scene) {
    this.camera = camera;
    this.pivot = new THREE.Object3D();
    scene.add(this.pivot);
  }

  update(characterPosition: THREE.Vector3, delta: number): void {
    // Copy character position to pivot each frame
    this.pivot.position.copy(characterPosition);

    // Target camera position = pivot + local offset
    const targetPos = this.pivot.position.clone().add(this.offset);

    // Frame-rate-independent lerp
    const t = 1 - Math.exp(-this.lerpCoeff * delta);
    this.camera.position.lerp(targetPos, t);

    // Look at character head height
    const lookAt = characterPosition.clone().add(new THREE.Vector3(0, 1, 0));
    this.camera.lookAt(lookAt);

    if (!this.ready) {
      this.ready = true;
    }
  }

  /**
   * Returns the camera's current yaw (Y-axis rotation) in radians.
   * Uses previous frame's camera orientation — one-frame lag is intentional
   * and imperceptible at 60fps given the fixed tick order (U5 before U6).
   */
  getCameraYaw(): number {
    const euler = new THREE.Euler().setFromQuaternion(
      this.camera.quaternion,
      'YXZ',
    );
    return euler.y;
  }
}
