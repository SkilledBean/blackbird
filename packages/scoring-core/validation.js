/**
 * Legal dart check shared by the reducer and the Prodigy parser.
 * The miss form is deliberately permissive (0,0 or 0,1) until board
 * capture pins the firmware's actual representation (guide §9.2).
 */
export function isLegalDart(dart) {
  if (!dart || !Number.isInteger(dart.n) || !Number.isInteger(dart.mult)) return false;
  if (dart.n === 0) return dart.mult === 0 || dart.mult === 1;
  if (dart.n === 25) return dart.mult === 1 || dart.mult === 2;
  return dart.n >= 1 && dart.n <= 20 && dart.mult >= 1 && dart.mult <= 3;
}
