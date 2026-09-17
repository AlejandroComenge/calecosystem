import { type Plugin, definePlugin } from '@calecosystem/contracts';
import { reactAdapter } from './scaffold/frontend/react.ts';
import { vueAdapter } from './scaffold/frontend/vue.ts';
import { angularAdapter } from './scaffold/frontend/angular.ts';
import { nodeApiAdapter } from './scaffold/backend/node-api.ts';
import { dockerDeploymentAdapter } from './scaffold/deployment/docker.ts';
import { netlifyDeploymentAdapter, vercelDeploymentAdapter } from './scaffold/deployment/edge.ts';
import { reactComponentRenderer } from './components/renderer.ts';
import { uiKit } from './components/ui-kit.ts';
import { ecommerceTemplate } from './templates/ecommerce.ts';
import { saasTemplate } from './templates/saas.ts';
import { landingTemplate } from './templates/landing.ts';

export type SupportedFramework = 'react' | 'vue' | 'angular';
export type SupportedTemplate = 'ecommerce' | 'saas' | 'landing';

export interface GeneratorPluginOptions {
  /** Frameworks a registrar. Por defecto, los tres soportados. */
  readonly frameworks?: readonly SupportedFramework[];
  /** Plantillas de producto a registrar. Por defecto, las tres incluidas. */
  readonly templates?: readonly SupportedTemplate[];
  /** Con `false` no se registra el catalogo base de componentes. */
  readonly uiKit?: boolean;
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
  const templates = options.templates ?? ['ecommerce', 'saas', 'landing'];

  return definePlugin({
    name: '@calecosystem/generator',
    version: '0.2.0',
    description:
      'Adaptadores de scaffolding, catalogo de componentes y plantillas de producto.',
    tier: 'community',
    priority: 10,

    register(api) {
      if (frameworks.includes('react')) {
        api.registerFrontendAdapter(reactAdapter);
        // El renderizador de componentes es hoy solo de React; registrarlo
        // aparte deja claro que es un eje distinto del adaptador.
        api.registerComponentRenderer(reactComponentRenderer);
      }
      if (frameworks.includes('vue')) api.registerFrontendAdapter(vueAdapter);
      if (frameworks.includes('angular')) api.registerFrontendAdapter(angularAdapter);

      api.registerBackendAdapter(nodeApiAdapter);
      api.registerDeploymentAdapter(dockerDeploymentAdapter);
      api.registerDeploymentAdapter(vercelDeploymentAdapter);
      api.registerDeploymentAdapter(netlifyDeploymentAdapter);

      if (options.uiKit !== false) {
        for (const component of uiKit()) api.registerComponent(component);
      }

      if (templates.includes('ecommerce')) api.registerTemplate(ecommerceTemplate);
      if (templates.includes('saas')) api.registerTemplate(saasTemplate);
      if (templates.includes('landing')) api.registerTemplate(landingTemplate);

      api.logger.debug(
        `Frontends: ${frameworks.join(', ')}. Plantillas: ${templates.join(', ')}.`,
      );
    },
  });
}

export default generatorPlugin;
