// ============================================================
//  Vehicles in the world (owner: models & driving): show the new body types in free parking spots.
//  Traffic composition stays with the traffic owner; pickCarType() (03_entities.js) is there for spawners.
// ============================================================
EXT.boot.push(() => {
  if (!SPOT.parking || !SPOT.parking.length) return;
  const free = SPOT.parking.filter((s) => !cars.some((c) => Math.hypot(c.x - s.x, c.z - s.z) < 3.2));
  const types = ['supercar', 'pickup', 'van', 'muscle'];
  for (let i = 0; i < free.length && i < types.length; i++) {
    const s = free[i], c = new Car(types[i]);
    c.place(s.x, s.z, s.h); c.persistent = true;
  }
});
