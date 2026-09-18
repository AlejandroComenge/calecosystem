/**
 * Caso de uso demostrativo: un e-commerce completo generado por el propio
 * ecosistema.
 *
 * Estas pruebas son el contrato del caso de uso comercial: si dejan de pasar,
 * la demo que se enseña a un cliente está rota. Comprueban que el proyecto
 * sale entero, que las piezas encajan entre si y que las métricas que se
 * publican en `docs/case-study-ecommerce.md` son reales.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { GenerationResult, Principal } from '@calecosystem/contracts';
import { Entitlements, createKernel, createSilentLogger } from '@calecosystem/core';
import { CodeGenerator, generatorPlugin } from '@calecosystem/generator';
import { optimizerPlugin } from '@calecosystem/optimizer';
import { securityPlugin } from '@calecosystem/security';
import { testerPlugin } from '@calecosystem/tester';
import { documenterPlugin } from '@calecosystem/documenter';
import { MemoryUsageStore, QuotaExceededError, billingPlugin } from '@calecosystem/billing';

export const SHOP_BRIEF =
  'Tienda online de productos artesanales. Los clientes navegan el catálogo, añaden ' +
  'productos al carrito y pagan con Stripe en el checkout. Hay valoraciones de productos, ' +
  'login de usuarios con roles y un panel de administración para gestionar pedidos, ' +
  'productos y clientes. Esperamos 20.000 usuarios y cumplimos el RGPD.';

const logger = createSilentLogger();
const enterprise = new Entitlements({ tier: 'enterprise' });

async function generateShop(): Promise<GenerationResult> {
  const kernel = await createKernel({
    logger,
    entitlements: enterprise,
    plugins: [
      generatorPlugin(),
      optimizerPlugin(),
      securityPlugin(),
      testerPlugin(),
      documenterPlugin(),
    ],
  });
  try {
    return await new CodeGenerator({ kernel }).generate({ text: SHOP_BRIEF });
  } finally {
    await kernel.dispose();
  }
}

test('el enunciado activa la plantilla de e-commerce', async () => {
  const result = await generateShop();

  assert.equal(result.template?.kind, 'ecommerce');
  assert.ok((result.template?.score ?? 0) >= 0.6, 'el encaje debería ser claro');
});

test('genera catálogo, carrito, checkout y panel de administración', async () => {
  const paths = new Set((await generateShop()).files.map((file) => file.path));

  // Catálogo
  assert.ok(paths.has('apps/web/src/pages/CatalogPage.tsx'));
  assert.ok(paths.has('apps/web/src/features/catalog/ProductGrid.tsx'));
  // Carrito
  assert.ok(paths.has('apps/web/src/features/cart/CartContext.tsx'));
  assert.ok(paths.has('apps/web/src/features/cart/useCart.ts'));
  assert.ok(paths.has('apps/web/src/pages/CartPage.tsx'));
  // Checkout, front y back
  assert.ok(paths.has('apps/web/src/pages/CheckoutPage.tsx'));
  assert.ok(paths.has('apps/api/src/application/CheckoutService.ts'));
  assert.ok(paths.has('apps/api/src/routes/checkout.routes.ts'));
  // Panel de administración
  assert.ok(paths.has('apps/web/src/pages/AdminOrdersPage.tsx'));
});

test('el cálculo de precios vive en el dominio y viene con pruebas', async () => {
  const files = (await generateShop()).files;
  const pricing = files.find((file) => file.path === 'apps/api/src/domain/CartPricing.ts');
  const pricingTest = files.find((file) => file.path === 'apps/api/src/domain/CartPricing.test.ts');

  assert.ok(pricing, 'las reglas de dinero no pueden vivir en una ruta HTTP');
  assert.ok(pricingTest, 'el cálculo de importes se entrega probado');
  assert.match(pricing.contents, /roundCents/);
  assert.equal(pricing.contents.includes('fastify'), false, 'el dominio no conoce el servidor');
});

test('el checkout no confia en el precio que envia el navegador', async () => {
  const files = (await generateShop()).files;
  const checkoutPage = files.find((file) => file.path === 'apps/web/src/pages/CheckoutPage.tsx');
  const service = files.find((file) => file.path === 'apps/api/src/application/CheckoutService.ts');

  // El cliente solo manda identificadores y cantidades.
  assert.match(checkoutPage?.contents ?? '', /productId: line\.productId/);
  assert.equal(/body: JSON.stringify\([^)]*unitPrice/s.test(checkoutPage?.contents ?? ''), false);
  // El servidor recalcula.
  assert.match(service?.contents ?? '', /priceLines/);
});

test('el catálogo de componentes se genera una sola vez y se reutiliza', async () => {
  const result = await generateShop();
  const paths = result.files.map((file) => file.path);

  assert.ok(paths.includes('apps/web/src/components/ui/Button.tsx'));
  assert.ok(paths.includes('apps/web/src/components/ui/DataTable.tsx'));
  assert.ok(paths.includes('apps/web/src/components/index.ts'));
  assert.ok(paths.includes('apps/web/src/components/domain/ProductTable.tsx'));
  assert.ok(result.metrics.componentCount > 15, 'kit base más componentes por entidad');

  const duplicates = paths.filter((path, index) => paths.indexOf(path) !== index);
  assert.deepEqual(duplicates, [], 'ningún fichero se genera dos veces');
});

test('el package.json se deduce de las capacidades detectadas', async () => {
  const files = (await generateShop()).files;
  const api = files.find((file) => file.path === 'apps/api/package.json');
  const web = files.find((file) => file.path === 'apps/web/package.json');

  const apiManifest = JSON.parse(api?.contents ?? '{}') as {
    dependencies: Record<string, string>;
  };
  const webManifest = JSON.parse(web?.contents ?? '{}') as {
    dependencies: Record<string, string>;
  };

  // Pagos detectados -> cliente de la pasarela.
  assert.ok(apiManifest.dependencies['stripe'], 'los pagos exigen la libreria de la pasarela');
  // Autenticación detectada -> hash y limitación de intentos.
  assert.ok(apiManifest.dependencies['argon2'], 'no se puede guardar una contraseña sin hash');
  assert.ok(apiManifest.dependencies['@fastify/rate-limit']);
  assert.ok(webManifest.dependencies['react']);
});

test('no hay conflictos de version entre productores', async () => {
  const result = await generateShop();

  assert.deepEqual(result.dependencyConflicts, []);
});

test('el auditor detecta el webhook de pagos sin verificar', async () => {
  const result = await generateShop();
  const security = result.reports.find((report) => report.kind === 'security');

  assert.ok(security?.findings.some((finding) => finding.id === 'SEC-WEBHOOK-UNVERIFIED'));
});

test('el testeador reclama la prueba del riesgo de stock que añadió la plantilla', async () => {
  const result = await generateShop();
  const tester = result.reports.find((report) => report.kind === 'tester');

  assert.ok(
    tester?.findings.some((finding) => finding.id.includes('RISK-STOCK-RACE')),
    'el riesgo lo pone la plantilla y lo recoge otro módulo: eso es el ecosistema',
  );
});

test('las métricas publicadas en el caso de estudio son reales', async () => {
  const result = await generateShop();

  // Cotas amplias a propósito: fijan el orden de magnitud sin romperse
  // cada vez que se añade una plantilla o un componente.
  assert.ok(result.metrics.fileCount >= 100, `solo ${result.metrics.fileCount} ficheros`);
  assert.ok(result.metrics.lineCount >= 3000, `solo ${result.metrics.lineCount} líneas`);
  assert.ok(result.metrics.componentCount >= 20);
  assert.ok(result.metrics.durationMs < 5_000, 'la demo tiene que ser instantanea');
});

test('la generación del e-commerce es reproducible', async () => {
  const first = await generateShop();
  const second = await generateShop();

  assert.deepEqual(
    first.files.map((file) => [file.path, file.contents]),
    second.files.map((file) => [file.path, file.contents]),
  );
});

test('con cuota agotada la demo se rechaza antes de generar nada', async () => {
  const store = new MemoryUsageStore();
  const principal: Principal = { userId: 'demo', tier: 'community' };

  const kernel = await createKernel({
    logger,
    plugins: [billingPlugin({ store }), generatorPlugin()],
  });

  try {
    const generator = new CodeGenerator({ kernel });

    // El plan gratuito permite 10 generaciones al mes.
    for (let index = 0; index < 10; index += 1) {
      await generator.generate({ text: SHOP_BRIEF }, { principal });
    }

    await assert.rejects(
      () => generator.generate({ text: SHOP_BRIEF }, { principal }),
      (error: unknown) => {
        assert.ok(error instanceof QuotaExceededError);
        assert.equal(error.details['upgradeTo'], 'pro');
        return true;
      },
    );
  } finally {
    await kernel.dispose();
  }
});
