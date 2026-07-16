import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

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

const ignoredDirectories = new Set(['.git', '.next', 'node_modules', 'coverage', 'test-results', 'playwright-report', 'docs']);
const textExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.yml', '.yaml', '.md', '.example']);
async function textFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    if (ignoredDirectories.has(entry.name) || entry.name === 'PROJECT_BRIEF.md') return [];
    if (entry.name.startsWith('.env') && entry.name !== '.env.example') return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return textFiles(path);
    return textExtensions.has(extname(entry.name)) || entry.name === '.env.example' ? [path] : [];
  }));
  return nested.flat();
}

const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
];
const files = await textFiles(process.cwd());
for (const file of files) {
  const source = await readFile(file, 'utf8');
  const matched = secretPatterns.find((pattern) => pattern.test(source));
  if (matched) throw new Error(`发现疑似已提交秘密：${relative(process.cwd(), file)} (${matched.source})`);
  if (file.includes(`${join('src', '')}`) && /\b(?:ACTIVATION_HMAC_SECRET|TOKEN_SIGNING_SECRET|REFRESH_HMAC_SECRET|ADMIN_API_SECRET|DATABASE_URL)\b/.test(source)) {
    throw new Error(`公开前端包含服务端配置名称：${relative(process.cwd(), file)}`);
  }
}
console.log(`秘密与前后端配置边界检查通过（${files.length} 个文本文件）。`);
