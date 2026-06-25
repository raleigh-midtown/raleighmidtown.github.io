import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast, INTERSECTED, NOT_INTERSECTED } from 'three-mesh-bvh';

// Patch THREE.Mesh.prototype.raycast at module load for accelerated raycasting
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export class CollisionSystem {
  private bvh: MeshBVH | null = null;

  /**
   * Call once after building scene geometry is ready.
   */
  build(buildingMesh: THREE.Mesh): void {
    this.bvh = new MeshBVH(buildingMesh.geometry);
  }

  /**
   * Resolve character capsule out of buildings.
   * Runs 3 iterative shapecast passes.
   * Returns the resolved position delta that should be added to the character.
   */
  resolveCollision(
    characterPosition: THREE.Vector3,
    capsuleRadius: number,
    capsuleHalfHeight: number,
  ): THREE.Vector3 {
    if (this.bvh === null) {
      return new THREE.Vector3();
    }

    const totalCorrection = new THREE.Vector3();
    const currentPosition = characterPosition.clone();

    // 3 iterative passes for stable collision resolution
    for (let pass = 0; pass < 3; pass++) {
      // Approximate capsule with a sphere at the top of the capsule
      const sphereCenter = new THREE.Vector3(
        currentPosition.x,
        currentPosition.y + capsuleHalfHeight,
        currentPosition.z,
      );
      const sphere = new THREE.Sphere(sphereCenter, capsuleRadius);

      const passCorrection = new THREE.Vector3();

      this.bvh.shapecast({
        intersectsBounds: (box) => {
          // Broad phase: check if sphere intersects the BVH node's bounding box
          const closestPoint = new THREE.Vector3();
          box.clampPoint(sphereCenter, closestPoint);
          const distSq = closestPoint.distanceToSquared(sphereCenter);
          return distSq <= capsuleRadius * capsuleRadius ? INTERSECTED : NOT_INTERSECTED;
        },
        intersectsTriangle: (tri) => {
          // Narrow phase: compute penetration and accumulate correction
          const closestPoint = new THREE.Vector3();
          tri.closestPointToPoint(sphereCenter, closestPoint);
          const dist = closestPoint.distanceTo(sphereCenter);

          if (dist < capsuleRadius && dist > 0) {
            // Push out along the normal from triangle surface to sphere center
            const penetrationDepth = capsuleRadius - dist;
            const correction = sphereCenter.clone().sub(closestPoint).normalize().multiplyScalar(penetrationDepth);
            passCorrection.add(correction);
          }

          // Return false to continue traversal (don't early-exit)
          return false;
        },
      });

      if (passCorrection.lengthSq() > 0) {
        totalCorrection.add(passCorrection);
        currentPosition.add(passCorrection);
        sphere.center.copy(currentPosition).y += capsuleHalfHeight;
      }

      // Unused variable fix: sphere is used in intersectsBounds via closure
      void sphere;
    }

    return totalCorrection;
  }
}
