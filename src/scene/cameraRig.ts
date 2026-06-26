import * as THREE from 'three';

export class CameraRig {
  private pivot: THREE.Object3D;
  private camera: THREE.PerspectiveCamera;
  private readonly offset = new THREE.Vector3(0, 5, 10);
  private readonly lerpCoeff = 6;
  private readonly rotatedOffset = new THREE.Vector3();
  private raycastFn: ((from: THREE.Vector3, to: THREE.Vector3) => number | null) | null = null;

  // Vertical pitch of the camera arm around the character.
  //  0   = default (5 m up / 10 m back, looking gently down at character)
  // +ve  = camera descends toward ground → see sky / building tops (look up)
  // -ve  = camera rises → bird's-eye, looking steeply down
  private pitch = 0;
  private readonly PITCH_MIN = -0.8;   // overhead
  private readonly PITCH_MAX = 0.65;   // low camera arm → look steeply upward

  private pointerActive = false;
  private pointerPrevY = 0;

  ready = false;

  constructor(camera: THREE.PerspectiveCamera, scene: THREE.Scene) {
    this.camera = camera;
    this.pivot = new THREE.Object3D();
    scene.add(this.pivot);
    this.bindPitchInput();
  }

  private bindPitchInput(): void {
    // Pointer drag (mouse OR touch) controls vertical camera tilt.
    // Drag UP   → pitch increases → camera lowers → look up at buildings.
    // Drag DOWN → pitch decreases → camera rises  → bird's-eye view.
    window.addEventListener('pointerdown', (e) => {
      this.pointerActive = true;
      this.pointerPrevY = e.clientY;
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.pointerActive) return;
      const dy = (e.clientY - this.pointerPrevY) / window.innerHeight;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch - dy * 1.8,
        this.PITCH_MIN,
        this.PITCH_MAX,
      );
      this.pointerPrevY = e.clientY;
    });

    window.addEventListener('pointerup',     () => { this.pointerActive = false; });
    window.addEventListener('pointercancel', () => { this.pointerActive = false; });
  }

  /** Wire in the collision system's raycast so the camera never clips through walls. */
  setRaycastFn(fn: (from: THREE.Vector3, to: THREE.Vector3) => number | null): void {
    this.raycastFn = fn;
  }

  update(characterPosition: THREE.Vector3, delta: number, characterYaw: number): void {
    this.pivot.position.copy(characterPosition);

    // 1. Rotate offset horizontally so camera stays behind the character.
    this.rotatedOffset
      .copy(this.offset)
      .applyEuler(new THREE.Euler(0, characterYaw, 0));

    // 2. Apply pitch: tilt the arm around the camera's local right axis.
    //    Right axis is perpendicular to the behind-direction in the XZ plane.
    const rightAxis = new THREE.Vector3(
      Math.cos(characterYaw), 0, -Math.sin(characterYaw),
    );
    this.rotatedOffset.applyAxisAngle(rightAxis, this.pitch);

    // 3. Safety floor — never clip below the ground plane.
    this.rotatedOffset.y = Math.max(0.3, this.rotatedOffset.y);

    let targetPos = this.pivot.position.clone().add(this.rotatedOffset);

    // 4. LookAt target rises with pitch: quadratic so max pitch aims ~50m up.
    const pitchT = Math.max(0, this.pitch / this.PITCH_MAX);
    const lookHeight = 1.0 + pitchT * pitchT * 50;
    const lookTarget = characterPosition.clone();
    lookTarget.y += lookHeight;

    // 5. Camera occlusion — snap in front of any wall between eye and camera.
    if (this.raycastFn) {
      const eyePos = characterPosition.clone();
      eyePos.y += 1.6;
      const hitDist = this.raycastFn(eyePos, targetPos);
      if (hitDist !== null) {
        const pullback = Math.max(0.4, hitDist - 0.4);
        const dir = targetPos.clone().sub(eyePos).normalize();
        targetPos = eyePos.clone().addScaledVector(dir, pullback);
        this.camera.position.copy(targetPos);
        this.camera.lookAt(lookTarget);
        if (!this.ready) this.ready = true;
        return;
      }
    }

    const t = 1 - Math.exp(-this.lerpCoeff * delta);
    this.camera.position.lerp(targetPos, t);
    this.camera.lookAt(lookTarget);
    if (!this.ready) this.ready = true;
  }

  getCameraYaw(): number {
    const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    return euler.y;
  }
}
