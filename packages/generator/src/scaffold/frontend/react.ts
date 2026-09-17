import type { FrontendAdapter, ScaffoldContext, VirtualFile } from '@calecosystem/contracts';
import { banner, displayField, entityInterface, fileFactory, jsonFile, listColumns } from '../shared.ts';

const TOOL = '@calecosystem/generator (react)';
const file = fileFactory(TOOL);

/**
 * Adaptador de frontend para React + Vite.
 *
 * Genera una aplicacion enrutada con una vista de listado por entidad y un
 * cliente HTTP compartido. No genera formularios ni estado global: son
 * decisiones que dependen del producto y es mas barato escribirlas que
 * borrar las equivocadas.
 */
export const reactAdapter: FrontendAdapter = {
  id: 'calec.frontend.react',
  displayName: 'React 19 + Vite',
  framework: 'react',
  tier: 'community',

  scaffold({ blueprint }: ScaffoldContext): VirtualFile[] {
    const root = 'apps/web';
    const entities = blueprint.entities;
    const files: VirtualFile[] = [];

    files.push(
      file(
        `${root}/package.json`,
        jsonFile({
          name: `${blueprint.slug}-web`,
          private: true,
          type: 'module',
          scripts: {
            dev: 'vite',
            build: 'tsc --noEmit && vite build',
            preview: 'vite preview',
          },
          dependencies: {
            react: '^19.0.0',
            'react-dom': '^19.0.0',
            'react-router-dom': '^7.0.0',
          },
          devDependencies: {
            '@vitejs/plugin-react': '^4.3.0',
            typescript: '^5.9.0',
            vite: '^6.0.0',
          },
        }),
      ),
    );

    files.push(
      file(
        `${root}/index.html`,
        [
          '<!doctype html>',
          '<html lang="es">',
          '  <head>',
          '    <meta charset="UTF-8" />',
          '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
          `    <title>${blueprint.projectName}</title>`,
          '  </head>',
          '  <body>',
          '    <div id="root"></div>',
          '    <script type="module" src="/src/main.tsx"></script>',
          '  </body>',
          '</html>',
        ].join('\n'),
      ),
    );

    files.push(
      file(
        `${root}/vite.config.ts`,
        [
          "import { defineConfig } from 'vite';",
          "import react from '@vitejs/plugin-react';",
          '',
          'export default defineConfig({',
          '  plugins: [react()],',
          '  server: {',
          '    port: 5173,',
          "    proxy: { '/api': 'http://localhost:3000' },",
          '  },',
          '});',
        ].join('\n'),
      ),
    );

    files.push(
      file(
        `${root}/src/types.ts`,
        [banner(blueprint, TOOL), '', ...entities.map(entityInterface)].join('\n\n'),
      ),
    );

    files.push(file(`${root}/src/api/client.ts`, apiClient(blueprint.slug)));
    files.push(file(`${root}/src/main.tsx`, mainEntry()));
    files.push(file(`${root}/src/App.tsx`, appComponent(blueprint)));

    for (const entity of entities) {
      files.push(
        file(`${root}/src/pages/${entity.name}ListPage.tsx`, listPage(entity.name, entity.plural, entity)),
      );
    }

    return files;
  },
};

function apiClient(slug: string): string {
  return [
    '/** Cliente HTTP compartido. Un unico punto donde cambiar auth o base URL. */',
    "const BASE_URL = import.meta.env['VITE_API_URL'] ?? '/api';",
    '',
    'export class ApiError extends Error {',
    '  readonly status: number;',
    '',
    '  constructor(status: number, message: string) {',
    '    super(message);',
    '    this.status = status;',
    '  }',
    '}',
    '',
    'function authHeaders(): Record<string, string> {',
    `  const token = localStorage.getItem('${slug}.token');`,
    "  return token ? { Authorization: 'Bearer ' + token } : {};",
    '}',
    '',
    'export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {',
    '  const response = await fetch(BASE_URL + path, {',
    '    ...init,',
    '    headers: {',
    "      'Content-Type': 'application/json',",
    '      ...authHeaders(),',
    '      ...(init.headers ?? {}),',
    '    },',
    '  });',
    '  if (!response.ok) {',
    "    throw new ApiError(response.status, 'La peticion a ' + path + ' fallo con ' + response.status);",
    '  }',
    "  if (response.status === 204) return undefined as T;",
    '  return (await response.json()) as T;',
    '}',
  ].join('\n');
}

function mainEntry(): string {
  return [
    "import { StrictMode } from 'react';",
    "import { createRoot } from 'react-dom/client';",
    "import { BrowserRouter } from 'react-router-dom';",
    "import { App } from './App.tsx';",
    '',
    "const container = document.getElementById('root');",
    "if (!container) throw new Error('No se encontro el nodo #root.');",
    '',
    'createRoot(container).render(',
    '  <StrictMode>',
    '    <BrowserRouter>',
    '      <App />',
    '    </BrowserRouter>',
    '  </StrictMode>,',
    ');',
  ].join('\n');
}

function appComponent(blueprint: { projectName: string; entities: readonly { name: string; plural: string }[] }): string {
  const imports = blueprint.entities
    .map((entity) => `import { ${entity.name}ListPage } from './pages/${entity.name}ListPage.tsx';`)
    .join('\n');
  const links = blueprint.entities
    .map((entity) => `        <Link to="/${entity.plural}">${entity.name}</Link>`)
    .join('\n');
  const routes = blueprint.entities
    .map((entity) => `        <Route path="/${entity.plural}" element={<${entity.name}ListPage />} />`)
    .join('\n');

  return [
    "import { Link, Route, Routes } from 'react-router-dom';",
    imports,
    '',
    'export function App() {',
    '  return (',
    '    <div className="app">',
    '      <header>',
    `        <h1>${blueprint.projectName}</h1>`,
    '      </header>',
    '      <nav>',
    links,
    '      </nav>',
    '      <main>',
    '        <Routes>',
    `          <Route path="/" element={<p>Bienvenido a ${blueprint.projectName}.</p>} />`,
    routes,
    '        </Routes>',
    '      </main>',
    '    </div>',
    '  );',
    '}',
  ].join('\n');
}

function listPage(
  name: string,
  plural: string,
  entity: Parameters<typeof listColumns>[0],
): string {
  const columns = listColumns(entity);
  const headers = columns.map((column) => `            <th>${column.name}</th>`).join('\n');
  const cells = columns
    .map((column) => `              <td>{String(item.${column.name} ?? '')}</td>`)
    .join('\n');
  const key = displayField(entity);

  return [
    "import { useEffect, useState } from 'react';",
    "import { apiFetch } from '../api/client.ts';",
    `import type { ${name} } from '../types.ts';`,
    '',
    `export function ${name}ListPage() {`,
    `  const [items, setItems] = useState<${name}[]>([]);`,
    '  const [error, setError] = useState<string | null>(null);',
    '  const [loading, setLoading] = useState(true);',
    '',
    '  useEffect(() => {',
    '    let cancelled = false;',
    `    apiFetch<${name}[]>('/${plural}')`,
    '      .then((data) => {',
    '        if (!cancelled) setItems(data);',
    '      })',
    '      .catch((cause: unknown) => {',
    '        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));',
    '      })',
    '      .finally(() => {',
    '        if (!cancelled) setLoading(false);',
    '      });',
    '    return () => {',
    '      cancelled = true;',
    '    };',
    '  }, []);',
    '',
    '  if (loading) return <p>Cargando...</p>;',
    '  if (error) return <p role="alert">{error}</p>;',
    '',
    '  return (',
    '    <section>',
    `      <h2>${name}</h2>`,
    '      <table>',
    '        <thead>',
    '          <tr>',
    headers,
    '          </tr>',
    '        </thead>',
    '        <tbody>',
    '          {items.map((item) => (',
    `            <tr key={String(item.${key})}>`,
    cells,
    '            </tr>',
    '          ))}',
    '        </tbody>',
    '      </table>',
    '    </section>',
    '  );',
    '}',
  ].join('\n');
}
