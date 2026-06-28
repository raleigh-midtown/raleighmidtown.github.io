import * as THREE from 'three';

export class CameraRig {
  private pivot: THREE.Object3D;
  private camera: THREE.PerspectiveCamera;
  private readonly offset = new THREE.Vector3(0, 5, 10);
  private readonly lerpCoeff = 6;
  private readonly rotatedOffset = new THREE.Vector3();
  // Scratch storage to avoid per-frame allocations in update().
  private readonly _scratchEuler   = new THREE.Euler();
  private readonly _scratchRight   = new THREE.Vector3();
  private readonly _scratchTarget  = new THREE.Vector3();
  private readonly _scratchLook    = new THREE.Vector3();
  private readonly _scratchEye     = new THREE.Vector3();
  private readonly _scratchDir     = new THREE.Vector3();
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

  // 'ground' = chase cam; 'aerial' = top-down bird's-eye following the character.
  private mode: 'ground' | 'aerial' = 'ground';
  private aerialHeight = 220;
  private readonly AERIAL_MIN = 50;
  private readonly AERIAL_MAX = 800;
  // Independent XZ pan offset added on top of character-follow in aerial mode.
  private readonly aerialPan = new THREE.Vector2(0, 0);

  setMode(mode: 'ground' | 'aerial'): void {
    this.mode = mode;
    if (mode === 'aerial') this.aerialPan.set(0, 0);
  }
  getMode(): 'ground' | 'aerial' {
    return this.mode;
  }

  constructor(camera: THREE.PerspectiveCamera, scene: THREE.Scene) {
    this.camera = camera;
    this.pivot = new THREE.Object3D();
    scene.add(this.pivot);
    this.bindPitchInput();
  }

  private pointerPrevX = 0;

  private bindPitchInput(): void {
    window.addEventListener('pointerdown', (e) => {
      // Ignore drags that start on UI buttons.
      const target = e.target as HTMLElement | null;
      if (target?.closest('button')) return;
      this.pointerActive = true;
      this.pointerPrevX = e.clientX;
      this.pointerPrevY = e.clientY;
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.pointerActive) return;
      const dx = e.clientX - this.pointerPrevX;
      const dy = e.clientY - this.pointerPrevY;

      if (this.mode === 'aerial') {
        // Pan the camera with the drag (drag right → camera moves right).
        const vh = window.innerHeight;
        const fovRad = (this.camera.fov * Math.PI) / 180;
        const worldPerPx = (2 * this.aerialHeight * Math.tan(fovRad / 2)) / vh;
        this.aerialPan.x += dx * worldPerPx;
        this.aerialPan.y += dy * worldPerPx;
      } else {
        // Ground: vertical drag controls camera pitch.
        const dyNorm = dy / window.innerHeight;
        this.pitch = THREE.MathUtils.clamp(
          this.pitch - dyNorm * 1.8,
          this.PITCH_MIN,
          this.PITCH_MAX,
        );
      }

      this.pointerPrevX = e.clientX;
      this.pointerPrevY = e.clientY;
    });

    window.addEventListener('pointerup',     () => { this.pointerActive = false; });
    window.addEventListener('pointercancel', () => { this.pointerActive = false; });

    // Wheel zoom (aerial only): scroll up = zoom in (descend).
    window.addEventListener('wheel', (e) => {
      if (this.mode !== 'aerial') return;
      e.preventDefault();
      const factor = Math.exp(e.deltaY * 0.0015);
      this.aerialHeight = THREE.MathUtils.clamp(
        this.aerialHeight * factor,
        this.AERIAL_MIN,
        this.AERIAL_MAX,
      );
    }, { passive: false });
  }

  /** Nudge camera pitch by amount (rad/s × delta). Positive = look up. */
  adjustPitch(amount: number): void {
    this.pitch = THREE.MathUtils.clamp(this.pitch + amount, this.PITCH_MIN, this.PITCH_MAX);
  }

  /** Wire in the collision system's raycast so the camera never clips through walls. */
  setRaycastFn(fn: (from: THREE.Vector3, to: THREE.Vector3) => number | null): void {
    this.raycastFn = fn;
  }

  update(characterPosition: THREE.Vector3, delta: number, characterYaw: number): void {
    this.pivot.position.copy(characterPosition);

    if (this.mode === 'aerial') {
      const cx = characterPosition.x + this.aerialPan.x;
      const cz = characterPosition.z + this.aerialPan.y;
      this._scratchTarget.set(cx, this.aerialHeight, cz + 0.01);
      const t = 1 - Math.exp(-this.lerpCoeff * delta);
      this.camera.position.lerp(this._scratchTarget, t);
      this.camera.lookAt(cx, 0, cz);
      if (!this.ready) this.ready = true;
      return;
    }

    this._scratchEuler.set(0, characterYaw, 0);
    this.rotatedOffset.copy(this.offset).applyEuler(this._scratchEuler);

    this._scratchRight.set(Math.cos(characterYaw), 0, -Math.sin(characterYaw));
    this.rotatedOffset.applyAxisAngle(this._scratchRight, this.pitch);

    this.rotatedOffset.y = Math.max(0.3, this.rotatedOffset.y);

    this._scratchTarget.copy(this.pivot.position).add(this.rotatedOffset);

    const pitchT = Math.max(0, this.pitch / this.PITCH_MAX);
    const lookHeight = 1.0 + pitchT * pitchT * 50;
    this._scratchLook.copy(characterPosition);
    this._scratchLook.y += lookHeight;

    if (this.raycastFn) {
      this._scratchEye.copy(characterPosition);
      this._scratchEye.y += 1.6;
      const hitDist = this.raycastFn(this._scratchEye, this._scratchTarget);
      if (hitDist !== null) {
        const pullback = Math.max(0.4, hitDist - 0.4);
        this._scratchDir.copy(this._scratchTarget).sub(this._scratchEye).normalize();
        this._scratchTarget.copy(this._scratchEye).addScaledVector(this._scratchDir, pullback);
        this.camera.position.copy(this._scratchTarget);
        this.camera.lookAt(this._scratchLook);
        if (!this.ready) this.ready = true;
        return;
      }
    }

    const t = 1 - Math.exp(-this.lerpCoeff * delta);
    this.camera.position.lerp(this._scratchTarget, t);
    this.camera.lookAt(this._scratchLook);
    if (!this.ready) this.ready = true;
  }

  getCameraYaw(): number {
    const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    return euler.y;
  }
}
