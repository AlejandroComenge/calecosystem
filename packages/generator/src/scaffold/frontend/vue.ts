import type { DomainEntity, FrontendAdapter, ScaffoldContext, VirtualFile } from '@calecosystem/contracts';
import { banner, displayField, entityInterface, fileFactory, jsonFile, listColumns } from '../shared.ts';

const TOOL = '@calecosystem/generator (vue)';
const file = fileFactory(TOOL);

/** Adaptador de frontend para Vue 3 (composition API) + Vite. */
export const vueAdapter: FrontendAdapter = {
  id: 'calec.frontend.vue',
  displayName: 'Vue 3 + Vite',
  framework: 'vue',
  tier: 'community',

  scaffold({ blueprint }: ScaffoldContext): VirtualFile[] {
    const root = 'apps/web';
    const files: VirtualFile[] = [];

    files.push(
      file(
        `${root}/package.json`,
        jsonFile({
          name: `${blueprint.slug}-web`,
          private: true,
          type: 'module',
          scripts: { dev: 'vite', build: 'vue-tsc --noEmit && vite build', preview: 'vite preview' },
          dependencies: { vue: '^3.5.0', 'vue-router': '^4.4.0' },
          devDependencies: {
            '@vitejs/plugin-vue': '^5.2.0',
            typescript: '^5.9.0',
            'vue-tsc': '^2.1.0',
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
          '    <div id="app"></div>',
          '    <script type="module" src="/src/main.ts"></script>',
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
          "import vue from '@vitejs/plugin-vue';",
          '',
          'export default defineConfig({',
          '  plugins: [vue()],',
          "  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },",
          '});',
        ].join('\n'),
      ),
    );

    files.push(
      file(
        `${root}/src/types.ts`,
        [banner(blueprint, TOOL), '', ...blueprint.entities.map(entityInterface)].join('\n\n'),
      ),
    );
    files.push(file(`${root}/src/api/client.ts`, apiClient(blueprint.slug)));
    files.push(file(`${root}/src/main.ts`, mainEntry()));
    files.push(file(`${root}/src/App.vue`, appComponent(blueprint.projectName, blueprint.entities)));
    files.push(file(`${root}/src/router/index.ts`, router(blueprint.entities)));

    for (const entity of blueprint.entities) {
      files.push(file(`${root}/src/pages/${entity.name}ListPage.vue`, listPage(entity)));
    }
    return files;
  },
};

function apiClient(slug: string): string {
  return [
    '/** Cliente HTTP compartido. Un unico punto donde cambiar auth o base URL. */',
    "const BASE_URL = import.meta.env['VITE_API_URL'] ?? '/api';",
    '',
    'export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {',
    `  const token = localStorage.getItem('${slug}.token');`,
    '  const response = await fetch(BASE_URL + path, {',
    '    ...init,',
    '    headers: {',
    "      'Content-Type': 'application/json',",
    "      ...(token ? { Authorization: 'Bearer ' + token } : {}),",
    '      ...(init.headers ?? {}),',
    '    },',
    '  });',
    "  if (!response.ok) throw new Error('La peticion a ' + path + ' fallo con ' + response.status);",
    '  if (response.status === 204) return undefined as T;',
    '  return (await response.json()) as T;',
    '}',
  ].join('\n');
}

function mainEntry(): string {
  return [
    "import { createApp } from 'vue';",
    "import App from './App.vue';",
    "import { router } from './router/index.ts';",
    '',
    'createApp(App).use(router).mount(\'#app\');',
  ].join('\n');
}

function router(entities: readonly DomainEntity[]): string {
  const imports = entities
    .map((entity) => `import ${entity.name}ListPage from '../pages/${entity.name}ListPage.vue';`)
    .join('\n');
  const routes = entities
    .map(
      (entity) =>
        `    { path: '/${entity.plural}', name: '${entity.plural}', component: ${entity.name}ListPage },`,
    )
    .join('\n');

  return [
    "import { createRouter, createWebHistory } from 'vue-router';",
    imports,
    '',
    'export const router = createRouter({',
    '  history: createWebHistory(),',
    '  routes: [',
    routes,
    '  ],',
    '});',
  ].join('\n');
}

function appComponent(projectName: string, entities: readonly DomainEntity[]): string {
  const links = entities
    .map((entity) => `      <RouterLink to="/${entity.plural}">${entity.name}</RouterLink>`)
    .join('\n');
  return [
    '<script setup lang="ts">',
    "import { RouterLink, RouterView } from 'vue-router';",
    '</script>',
    '',
    '<template>',
    '  <header>',
    `    <h1>${projectName}</h1>`,
    '  </header>',
    '  <nav>',
    links,
    '  </nav>',
    '  <main>',
    '    <RouterView />',
    '  </main>',
    '</template>',
  ].join('\n');
}

function listPage(entity: DomainEntity): string {
  const columns = listColumns(entity);
  const headers = columns.map((column) => `        <th>${column.name}</th>`).join('\n');
  const cells = columns.map((column) => `        <td>{{ item.${column.name} }}</td>`).join('\n');
  const key = displayField(entity);

  return [
    '<script setup lang="ts">',
    "import { onMounted, ref } from 'vue';",
    "import { apiFetch } from '../api/client.ts';",
    `import type { ${entity.name} } from '../types.ts';`,
    '',
    `const items = ref<${entity.name}[]>([]);`,
    'const error = ref<string | null>(null);',
    'const loading = ref(true);',
    '',
    'onMounted(async () => {',
    '  try {',
    `    items.value = await apiFetch<${entity.name}[]>('/${entity.plural}');`,
    '  } catch (cause) {',
    '    error.value = cause instanceof Error ? cause.message : String(cause);',
    '  } finally {',
    '    loading.value = false;',
    '  }',
    '});',
    '</script>',
    '',
    '<template>',
    '  <section>',
    `    <h2>${entity.name}</h2>`,
    '    <p v-if="loading">Cargando...</p>',
    '    <p v-else-if="error" role="alert">{{ error }}</p>',
    '    <table v-else>',
    '      <thead>',
    '        <tr>',
    headers,
    '        </tr>',
    '      </thead>',
    '      <tbody>',
    `        <tr v-for="item in items" :key="String(item.${key})">`,
    cells,
    '        </tr>',
    '      </tbody>',
    '    </table>',
    '  </section>',
    '</template>',
  ].join('\n');
}
