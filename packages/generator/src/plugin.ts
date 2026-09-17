import { type Plugin, definePlugin } from '@calecosystem/contracts';
import { reactAdapter } from './scaffold/frontend/react.ts';
import { vueAdapter } from './scaffold/frontend/vue.ts';
import { angularAdapter } from './scaffold/frontend/angular.ts';
import { nodeApiAdapter } from './scaffold/backend/node-api.ts';
import { dockerDeploymentAdapter } from './scaffold/deployment/docker.ts';

export interface GeneratorPluginOptions {
  /** Frameworks a registrar. Por defecto, los tres soportados. */
  readonly frameworks?: readonly ('react' | 'vue' | 'angular')[];
}

/**
 * Plugin del generador.
 *
 * El propio modulo principal se carga como plugin: si el generador necesitara
 * un trato especial del kernel, el sistema de extension no serviria para
 * nadie mas. Todo lo que hace aqui puede hacerlo un plugin de terceros.
 */
export function generatorPlugin(options: GeneratorPluginOptions = {}): Plugin {
  const frameworks = options.frameworks ?? ['react', 'vue', 'angular'];

  return definePlugin({
    name: '@calecosystem/generator',
    version: '0.1.0',
    description: 'Adaptadores de scaffolding para React, Vue, Angular, Node y Docker.',
    tier: 'community',
    priority: 10,

    register(api) {
      if (frameworks.includes('react')) api.registerFrontendAdapter(reactAdapter);
      if (frameworks.includes('vue')) api.registerFrontendAdapter(vueAdapter);
      if (frameworks.includes('angular')) api.registerFrontendAdapter(angularAdapter);

      api.registerBackendAdapter(nodeApiAdapter);
      api.registerDeploymentAdapter(dockerDeploymentAdapter);

      api.logger.debug(`Adaptadores de frontend registrados: ${frameworks.join(', ')}.`);
    },
  });
}

export default generatorPlugin;
