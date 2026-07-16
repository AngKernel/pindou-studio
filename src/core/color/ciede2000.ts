import { assertLabColor, type LabColor } from './types';

const POW_25_TO_7 = 25 ** 7;
const DEGREES_PER_RADIAN = 180 / Math.PI;
const RADIANS_PER_DEGREE = Math.PI / 180;

function hueDegrees(a: number, b: number): number {
  const angle = Math.atan2(b, a) * DEGREES_PER_RADIAN;
  return angle >= 0 ? angle : angle + 360;
}

export function deltaE2000(first: LabColor, second: LabColor): number {
  assertLabColor(first);
  assertLabColor(second);

  const c1 = Math.hypot(first.a, first.b);
  const c2 = Math.hypot(second.a, second.b);
  const meanC = (c1 + c2) / 2;
  const meanCPow7 = meanC ** 7;
  const g = 0.5 * (1 - Math.sqrt(meanCPow7 / (meanCPow7 + POW_25_TO_7)));

  const a1Prime = (1 + g) * first.a;
  const a2Prime = (1 + g) * second.a;
  const c1Prime = Math.hypot(a1Prime, first.b);
  const c2Prime = Math.hypot(a2Prime, second.b);
  const h1Prime = hueDegrees(a1Prime, first.b);
  const h2Prime = hueDegrees(a2Prime, second.b);

  const deltaLPrime = second.l - first.l;
  const deltaCPrime = c2Prime - c1Prime;

  let deltaHuePrime = h2Prime - h1Prime;
  if (c1Prime * c2Prime === 0) {
    deltaHuePrime = 0;
  } else if (deltaHuePrime > 180) {
    deltaHuePrime -= 360;
  } else if (deltaHuePrime < -180) {
    deltaHuePrime += 360;
  }

  const deltaHPrime =
    2 * Math.sqrt(c1Prime * c2Prime) *
    Math.sin((deltaHuePrime / 2) * RADIANS_PER_DEGREE);

  const meanLPrime = (first.l + second.l) / 2;
  const meanCPrime = (c1Prime + c2Prime) / 2;

  let meanHuePrime = h1Prime + h2Prime;
  if (c1Prime * c2Prime === 0) {
    meanHuePrime = h1Prime + h2Prime;
  } else if (Math.abs(h1Prime - h2Prime) <= 180) {
    meanHuePrime /= 2;
  } else if (meanHuePrime < 360) {
    meanHuePrime = (meanHuePrime + 360) / 2;
  } else {
    meanHuePrime = (meanHuePrime - 360) / 2;
  }

  const t =
    1 -
    0.17 * Math.cos((meanHuePrime - 30) * RADIANS_PER_DEGREE) +
    0.24 * Math.cos(2 * meanHuePrime * RADIANS_PER_DEGREE) +
    0.32 * Math.cos((3 * meanHuePrime + 6) * RADIANS_PER_DEGREE) -
    0.2 * Math.cos((4 * meanHuePrime - 63) * RADIANS_PER_DEGREE);

  const deltaTheta =
    30 * Math.exp(-(((meanHuePrime - 275) / 25) ** 2));
  const meanCPrimePow7 = meanCPrime ** 7;
  const rotationC =
    2 * Math.sqrt(meanCPrimePow7 / (meanCPrimePow7 + POW_25_TO_7));
  const lightnessScale =
    1 +
    (0.015 * (meanLPrime - 50) ** 2) /
      Math.sqrt(20 + (meanLPrime - 50) ** 2);
  const chromaScale = 1 + 0.045 * meanCPrime;
  const hueScale = 1 + 0.015 * meanCPrime * t;
  const rotationTerm =
    -Math.sin(2 * deltaTheta * RADIANS_PER_DEGREE) * rotationC;

  const lightnessTerm = deltaLPrime / lightnessScale;
  const chromaTerm = deltaCPrime / chromaScale;
  const hueTerm = deltaHPrime / hueScale;

  return Math.sqrt(
    lightnessTerm ** 2 +
      chromaTerm ** 2 +
      hueTerm ** 2 +
      rotationTerm * chromaTerm * hueTerm,
  );
}
