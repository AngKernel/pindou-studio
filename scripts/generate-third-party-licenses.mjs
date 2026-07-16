import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

const outputPath = new URL('../THIRD_PARTY_LICENSES.md', import.meta.url);
const lockPath = new URL('../package-lock.json', import.meta.url);
const lock = JSON.parse(await readFile(lockPath, 'utf8'));

function packageNameFromPath(packagePath) {
  return packagePath.split('node_modules/').at(-1);
}

const packages = Object.entries(lock.packages)
  .filter(([packagePath]) => packagePath !== '')
  .map(([packagePath, metadata]) => ({
    name: packageNameFromPath(packagePath),
    version: metadata.version ?? 'UNKNOWN',
    license: metadata.license ?? 'UNDECLARED',
    developmentOnly: metadata.dev === true,
  }));

const uniquePackages = [
  ...new Map(
    packages.map((dependency) => [
      `${dependency.name}@${dependency.version}`,
      dependency,
    ]),
  ).values(),
].sort((left, right) =>
  `${left.name}@${left.version}`.localeCompare(
    `${right.name}@${right.version}`,
    'en',
  ),
);

const undeclared = uniquePackages.filter(
  (dependency) => dependency.license === 'UNDECLARED',
);

const rows = uniquePackages.map(
  ({ name, version, license, developmentOnly }) =>
    `| \`${name}\` | ${version} | ${license} | ${developmentOnly ? '开发' : '运行/构建'} |`,
);

const content = `# 第三方许可证清单

> 此文件由 \`npm run licenses:generate\` 根据 \`package-lock.json\` 生成。
> 生成日期固定为锁文件变更的审阅时点；包升级后必须重新生成并审阅差异。
> 共 ${uniquePackages.length} 个唯一的包/版本组合，未声明许可证 ${undeclared.length} 个。

该清单是工程审计入口。正式发布物还应按各包要求附带 LICENSE、NOTICE、版权和署名文本。

| 包 | 版本 | SPDX/许可证声明 | 范围 |
| --- | --- | --- | --- |
${rows.join('\n')}
`;

if (process.argv.includes('--check')) {
  const existing = await readFile(outputPath, 'utf8').catch(() => '');
  if (existing.replaceAll('\r\n', '\n') !== content) {
    console.error('第三方许可证清单已过期；请运行 npm run licenses:generate。');
    process.exit(1);
  }
} else {
  await writeFile(outputPath, content, 'utf8');
  console.log(`已生成 ${uniquePackages.length} 条第三方依赖记录。`);
}

if (undeclared.length > 0) {
  console.error(
    `发现 ${undeclared.length} 个未声明许可证的依赖：${undeclared.map(({ name, version }) => `${name}@${version}`).join(', ')}`,
  );
  process.exit(1);
}
