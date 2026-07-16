import Link from 'next/link';

const upstreamUrl = 'https://github.com/Zippland/perler-beads';
const sourceCodeUrl =
  process.env.NEXT_PUBLIC_SOURCE_CODE_URL ??
  'https://github.com/AngKernel/pindou-studio';

export default function LicensesPage() {
  return (
    <main className="min-h-screen bg-gray-50 px-5 py-10 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      <article className="mx-auto max-w-3xl space-y-6 rounded-2xl bg-white p-6 shadow-sm dark:bg-gray-800 sm:p-10">
        <header className="space-y-2">
          <p className="text-sm font-medium text-blue-600 dark:text-blue-400">Pindou Studio</p>
          <h1 className="text-3xl font-bold">开源许可与源码</h1>
          <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">
            本程序基于 AGPL-3.0 开源项目继续开发。使用本网站即代表你可以通过下方入口取得当前部署版本的对应源码。
          </p>
        </header>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">许可证</h2>
          <p className="leading-7">
            本程序整体使用 GNU Affero General Public License v3.0（AGPL-3.0-only）。程序不提供任何明示或默示担保。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">来源与修改</h2>
          <p className="leading-7">
            上游项目为{' '}
            <a className="text-blue-600 underline dark:text-blue-400" href={upstreamUrl} target="_blank" rel="noreferrer">
              Zippland/perler-beads
            </a>
            。本项目保留上游 Git 历史、作者信息和版权声明，并在此基础上增加工程化、测试和后续产品能力。
          </p>
        </section>

        <nav className="flex flex-wrap gap-3">
          <a className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700" href={sourceCodeUrl} target="_blank" rel="noreferrer">
            获取对应版本源码
          </a>
          <a className="rounded-lg border border-gray-300 px-4 py-2 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700" href={`${sourceCodeUrl}/blob/main/LICENSE`} target="_blank" rel="noreferrer">
            查看 AGPL-3.0
          </a>
          <a className="rounded-lg border border-gray-300 px-4 py-2 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700" href={`${sourceCodeUrl}/blob/main/THIRD_PARTY_LICENSES.md`} target="_blank" rel="noreferrer">
            第三方许可证
          </a>
        </nav>

        <Link className="inline-block text-sm text-gray-600 underline dark:text-gray-300" href="/">
          返回生成器
        </Link>
      </article>
    </main>
  );
}
