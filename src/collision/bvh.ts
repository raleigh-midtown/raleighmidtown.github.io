import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast, INTERSECTED, NOT_INTERSECTED } from 'three-mesh-bvh';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

THREE.Mesh.prototype.raycast = acceleratedRaycast;

export class CollisionSystem {
  private bvh: MeshBVH | null = null;
  // Scratch storage so raycast helpers don't allocate per frame.
  private readonly _scratchDown = new THREE.Vector3(0, -1, 0);
  private readonly _scratchUp   = new THREE.Vector3(0,  1, 0);
  private readonly _scratchRay  = new THREE.Ray();

  /** Accept one or more meshes — merges their geometries into a single BVH in world space. */
  build(...meshes: THREE.Mesh[]): void {
    // Force world matrices to be current (meshes may not have been rendered yet).
    meshes.forEach(m => m.updateWorldMatrix(true, false));
    // Clone each geometry and bake the mesh's world transform into vertex positions
    // so the BVH operates in world space and collision queries against world-space
    // character positions are correct.
    const geos = meshes.map(m => {
      const geo = (m.geometry as THREE.BufferGeometry).clone();
      geo.applyMatrix4(m.matrixWorld);
      return geo;
    });
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (merged) this.bvh = new MeshBVH(merged);
  }

  /**
   * Cast a ray from `from` toward `to` and return the hit distance, or null if clear.
   * Used by the camera rig to pull back when a wall is between character and camera.
   */
  raycastTo(from: THREE.Vector3, to: THREE.Vector3): number | null {
    if (!this.bvh) return null;
    const dir = new THREE.Vector3().subVectors(to, from);
    const maxDist = dir.length();
    if (maxDist < 0.01) return null;
    dir.divideScalar(maxDist);
    const ray = new THREE.Ray(from, dir);
    const hit = this.bvh.raycastFirst(ray, THREE.DoubleSide);
    if (hit && hit.distance <= maxDist) return hit.distance;
    return null;
  }

  /**
   * Distance from `origin` to nearest surface beneath it, within `maxDist` metres.
   * Combines the buildings BVH with an implicit flat ground plane at y=0
   * (sidewalks / roads / stage decor aren't in the BVH today).
   * Returns null when nothing is in range.
   */
  raycastDown(origin: THREE.Vector3, maxDist: number): number | null {
    let bvhHit: number | null = null;
    if (this.bvh) {
      this._scratchRay.origin.copy(origin);
      this._scratchRay.direction.copy(this._scratchDown);
      const hit = this.bvh.raycastFirst(this._scratchRay, THREE.DoubleSide);
      if (hit && hit.distance <= maxDist) bvhHit = hit.distance;
    }
    // Implicit ground plane at y=0
    let planeHit: number | null = null;
    if (origin.y >= 0 && origin.y <= maxDist) planeHit = origin.y;
    if (bvhHit === null) return planeHit;
    if (planeHit === null) return bvhHit;
    return Math.min(bvhHit, planeHit);
  }

  /**
   * Distance from `origin` to nearest surface above it, within `maxDist` metres.
   * BVH only — there's no overhead implicit ground plane.
   */
  raycastUp(origin: THREE.Vector3, maxDist: number): number | null {
    if (!this.bvh) return null;
    this._scratchRay.origin.copy(origin);
    this._scratchRay.direction.copy(this._scratchUp);
    const hit = this.bvh.raycastFirst(this._scratchRay, THREE.DoubleSide);
    if (hit && hit.distance <= maxDist) return hit.distance;
    return null;
  }

  /**
   * Resolve a vertical capsule out of building geometry.
   * Up to 5 iterations — each finds the single deepest penetration and pushes out.
   * Only horizontal (XZ) correction is applied so the character stays grounded.
   */
  resolveCollision(
    characterPosition: THREE.Vector3,
    capsuleRadius: number,
    capsuleHalfHeight: number,
  ): THREE.Vector3 {
    if (!this.bvh) return new THREE.Vector3();

    const totalCorrection = new THREE.Vector3();
    // Test sphere at mid-capsule height
    const sphereCenter = new THREE.Vector3(
      characterPosition.x,
      characterPosition.y + capsuleHalfHeight,
      characterPosition.z,
    );
    const testRadius = capsuleRadius + 0.05; // small margin

    for (let pass = 0; pass < 5; pass++) {
      let maxDepth = 0;
      const maxNormal = new THREE.Vector3();

      this.bvh.shapecast({
        intersectsBounds: (box) => {
          const closest = new THREE.Vector3();
          box.clampPoint(sphereCenter, closest);
          return closest.distanceToSquared(sphereCenter) <= testRadius * testRadius
            ? INTERSECTED
            : NOT_INTERSECTED;
        },
        intersectsTriangle: (tri) => {
          const closest = new THREE.Vector3();
          tri.closestPointToPoint(sphereCenter, closest);
          const toCenter = new THREE.Vector3().subVectors(sphereCenter, closest);
          const dist = toCenter.length();

          if (dist < testRadius && dist > 1e-6) {
            const depth = testRadius - dist;
            if (depth > maxDepth) {
              maxDepth = depth;
              maxNormal.copy(toCenter).normalize();
            }
          }
          return false; // continue traversal
        },
      });

      if (maxDepth < 1e-5) break; // no more penetration

      // Push out along deepest triangle normal; zero Y to stay on ground
      const push = maxNormal.clone().multiplyScalar(maxDepth);
      push.y = 0;

      sphereCenter.add(push);
      totalCorrection.add(push);
    }

    return totalCorrection;
  }
}
