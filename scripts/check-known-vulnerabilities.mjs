import { readFile } from 'node:fs/promises';

const lockPath = new URL('../package-lock.json', import.meta.url);
const lock = JSON.parse(await readFile(lockPath, 'utf8'));

function packageNameFromPath(packagePath) {
  return packagePath.split('node_modules/').at(-1);
}

function compareVersions(left, right) {
  const leftParts = left.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

const atMost = (maximum) => (version) => compareVersions(version, maximum) <= 0;
const before = (minimum) => (version) => compareVersions(version, minimum) < 0;
const between = (minimum, maximum) => (version) =>
  compareVersions(version, minimum) >= 0 && compareVersions(version, maximum) <= 0;

const vulnerable = {
  '@babel/core': atMost('7.29.0'),
  '@babel/plugin-transform-modules-systemjs': atMost('7.29.3'),
  ajv: (version) =>
    compareVersions(version, '7.0.0') >= 0 && compareVersions(version, '8.17.1') <= 0,
  'brace-expansion': (version) =>
    (version.startsWith('1.') && atMost('1.1.12')(version)) ||
    (version.startsWith('2.') && atMost('2.0.2')(version)),
  'fast-uri': atMost('3.1.1'),
  lodash: atMost('4.17.23'),
  minimatch: (version) =>
    (version.startsWith('3.') && atMost('3.1.3')(version)) ||
    (version.startsWith('5.') && atMost('5.1.7')(version)) ||
    (version.startsWith('9.') && atMost('9.0.6')(version)),
  next: before('15.5.20'),
  picomatch: (version) =>
    (version.startsWith('2.') && atMost('2.3.1')(version)) ||
    (version.startsWith('4.') && atMost('4.0.3')(version)),
  postcss: before('8.5.10'),
  rollup: before('2.80.0'),
  'serialize-javascript': atMost('7.0.4'),
  webpack: between('5.49.0', '5.104.0'),
};

const findings = Object.entries(lock.packages)
  .filter(([packagePath]) => packagePath !== '')
  .map(([packagePath, metadata]) => ({
    name: packageNameFromPath(packagePath),
    path: packagePath,
    version: metadata.version ?? '0.0.0',
  }))
  .filter(({ name, version }) => vulnerable[name]?.(version));

if (findings.length > 0) {
  console.error('锁文件包含阶段 0 已知漏洞版本：');
  for (const finding of findings) {
    console.error(`- ${finding.name}@${finding.version} (${finding.path})`);
  }
  process.exit(1);
}

console.log('阶段 0 已知漏洞版本离线检查通过。');
