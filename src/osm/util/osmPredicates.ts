/** Returns true for unnamed multi-storey parking garages (building=parking). */
export function isUnnamedParkingGarage(props: Record<string, unknown>): boolean {
  return (
    String(props['amenity']  ?? '') === 'parking'      &&
    String(props['parking']  ?? '') === 'multi-storey' &&
    !props['name']                                     &&
    String(props['building'] ?? '') === 'parking'
  );
}
