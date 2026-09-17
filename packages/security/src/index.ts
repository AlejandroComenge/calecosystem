import type {
  Finding,
  ModuleDescriptor,
  ModuleReport,
  ModuleRunContext,
  Plugin,
  SecurityAuditorModule,
  Severity,
  VirtualFile,
} from '@calecosystem/contracts';
import { definePlugin } from '@calecosystem/contracts';

const DESCRIPTOR = {
  id: '@calecosystem/security',
  kind: 'security',
  version: '0.1.0',
  displayName: 'Auditor de seguridad',
  description:
    'Audita el proyecto generado: secretos incrustados, autenticacion incompleta y endurecimiento de contenedores.',
  tier: 'pro',
  status: 'preview',
} as const satisfies ModuleDescriptor;

/**
 * Patrones de secreto incrustado.
 *
 * Buscan asignaciones con un valor literal que parece real, no menciones de
 * la palabra. Un generador que avisa en cada aparicion de "password" enseña
 * al equipo a ignorar los avisos, que es peor que no avisar.
 */
const SECRET_PATTERNS: readonly { readonly id: string; readonly pattern: RegExp; readonly label: string }[] = [
  {
    id: 'SEC-HARDCODED-SECRET',
    pattern: /(password|secret|api[_-]?key|token)\s*[:=]\s*['"][^'"\s${}]{8,}['"]/i,
    label: 'credencial literal en el codigo',
  },
  {
    id: 'SEC-PRIVATE-KEY',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    label: 'clave privada incrustada',
  },
  {
    id: 'SEC-AWS-KEY',
    pattern: /AKIA[0-9A-Z]{16}/,
    label: 'clave de acceso de AWS',
  },
];

/** Ficheros donde un valor de ejemplo es legitimo y no debe generar ruido. */
const ALLOWLIST = /(^|\/)(\.env\.example|README\.md|SECURITY\.md|docker-compose\.yml)$/;

/**
 * Auditor de seguridad (v0.1).
 *
 * Alcance actual: analisis estatico del proyecto generado y revision del
 * blueprint frente a los requisitos de cumplimiento detectados. No sustituye
 * a una auditoria profesional ni a un escaneo de dependencias; declara lo que
 * ha comprobado y deja constancia de lo que no.
 */
export class SecurityAuditor implements SecurityAuditorModule {
  readonly descriptor = DESCRIPTOR;

  async run(context: ModuleRunContext): Promise<ModuleReport> {
    const startedAt = performance.now();
    const findings: Finding[] = [];
    const { blueprint, requirements, files } = context;

    findings.push(...scanForSecrets(files));

    // La autenticacion generada es un esqueleto: decirlo es parte del trabajo.
    const authStub = files.find((file) => file.path.endsWith('application/authenticate.ts'));
    if (authStub && !/verify|jwt\.verify|createHmac/i.test(authStub.contents)) {
      findings.push({
        id: 'SEC-AUTH-NOT-VERIFIED',
        severity: 'critical',
        title: 'El middleware de autenticacion no valida la firma del token',
        detail:
          'El esqueleto generado acepta cualquier cabecera `Bearer`. Cualquiera puede suplantar a cualquier usuario.',
        path: authStub.path,
        remediation:
          'Implementar la verificacion de firma y expiracion antes de exponer el servicio fuera de local.',
        tags: ['auth', 'blocker'],
      });
    }

    if (requirements.features.payments) {
      const webhook = blueprint.endpoints.find((endpoint) => endpoint.path.includes('/payments/webhook'));
      if (webhook && !webhook.requiresAuth) {
        findings.push({
          id: 'SEC-WEBHOOK-UNVERIFIED',
          severity: 'high',
          title: 'El webhook de pagos es publico y no verifica la firma del proveedor',
          detail:
            'Un endpoint de webhook abierto permite falsificar confirmaciones de pago. Es publico por diseno, ' +
            'pero debe validar la firma HMAC de la pasarela en cada peticion.',
          path: 'apps/api/src/routes',
          remediation:
            'Verificar la cabecera de firma del proveedor contra el secreto compartido antes de procesar el evento.',
          tags: ['payments', 'pci-dss'],
        });
      }
    }

    if (requirements.features.multiTenant) {
      findings.push({
        id: 'SEC-TENANT-ISOLATION',
        severity: 'high',
        title: 'Los repositorios generados no filtran por inquilino',
        detail:
          'El puerto `Repository` no recibe identificador de tenant, asi que una consulta mal escrita ' +
          'devuelve datos de otra organizacion.',
        remediation:
          'Anadir el tenant al contrato del repositorio y hacerlo obligatorio en la firma, no opcional.',
        tags: ['multi-tenant', 'data-isolation'],
      });
    }

    const dockerfiles = files.filter((file) => file.path.endsWith('Dockerfile'));
    for (const dockerfile of dockerfiles) {
      if (!/^USER\s+(?!root)/m.test(dockerfile.contents)) {
        findings.push({
          id: 'SEC-CONTAINER-ROOT',
          severity: 'medium',
          title: 'El contenedor se ejecuta como root',
          detail: 'Una ejecucion de codigo dentro del contenedor hereda privilegios de root.',
          path: dockerfile.path,
          remediation: 'Anadir `USER node` (o un usuario dedicado) antes del `CMD`.',
          tags: ['container'],
        });
      }
    }

    for (const standard of requirements.nonFunctional.compliance) {
      findings.push({
        id: `SEC-COMPLIANCE-${standard.toUpperCase()}`,
        severity: 'info',
        title: `Alcance de cumplimiento declarado: ${standard.toUpperCase()}`,
        detail:
          'El analisis de requisitos detecto esta norma. El codigo generado no la satisface por si solo: ' +
          'necesita controles organizativos y evidencias documentadas.',
        remediation: 'Asignar un responsable de cumplimiento antes del primer despliegue en produccion.',
        tags: ['compliance', standard],
      });
    }

    context.emit(securityPolicyFile(findings, blueprint.projectName));

    const blockers = findings.filter(
      (finding) => finding.severity === 'critical' || finding.severity === 'high',
    );
    if (blockers.length > 0) {
      context.warn(
        `${blockers.length} hallazgos de gravedad alta o critica deben resolverse antes de desplegar.`,
      );
    }

    return {
      module: DESCRIPTOR.id,
      kind: 'security',
      summary:
        findings.length === 0
          ? 'Sin hallazgos en las comprobaciones estaticas incluidas.'
          : `${findings.length} hallazgos (${blockers.length} bloqueantes para produccion).`,
      findings,
      score: scoreFrom(findings),
      emittedFiles: [],
      durationMs: performance.now() - startedAt,
    };
  }
}

function scanForSecrets(files: readonly VirtualFile[]): Finding[] {
  const findings: Finding[] = [];
  for (const file of files) {
    if (ALLOWLIST.test(file.path)) continue;
    for (const { id, pattern, label } of SECRET_PATTERNS) {
      const lines = file.contents.split('\n');
      const index = lines.findIndex((line) => pattern.test(line));
      if (index === -1) continue;
      findings.push({
        id,
        severity: 'critical',
        title: `Posible ${label} en ${file.path}`,
        detail: `Coincidencia en la linea ${index + 1}. Un secreto en el repositorio se considera comprometido en cuanto se hace push.`,
        path: file.path,
        remediation: 'Mover el valor a una variable de entorno y rotar la credencial expuesta.',
        tags: ['secrets'],
      });
      break;
    }
  }
  return findings;
}

function securityPolicyFile(findings: readonly Finding[], projectName: string): VirtualFile {
  const bySeverity = (severity: Severity) => findings.filter((finding) => finding.severity === severity);
  const lines: string[] = [
    '# Seguridad',
    '',
    `Informe inicial generado por el auditor del ecosistema para **${projectName}**.`,
    'Es una linea base automatica, no una auditoria profesional.',
    '',
    '## Hallazgos',
    '',
  ];

  if (findings.length === 0) {
    lines.push('No se detectaron hallazgos en las comprobaciones estaticas incluidas.', '');
  } else {
    for (const severity of ['critical', 'high', 'medium', 'low', 'info'] as const) {
      const group = bySeverity(severity);
      if (group.length === 0) continue;
      lines.push(`### ${severity.toUpperCase()}`, '');
      for (const finding of group) {
        lines.push(`- **${finding.id}** - ${finding.title}`);
        lines.push(`  - ${finding.detail}`);
        if (finding.remediation) lines.push(`  - Correccion: ${finding.remediation}`);
      }
      lines.push('');
    }
  }

  lines.push(
    '## Fuera del alcance de esta revision',
    '',
    '- Escaneo de vulnerabilidades en dependencias de terceros.',
    '- Analisis dinamico y pruebas de penetracion.',
    '- Revision de la configuracion de la nube y de la red.',
    '',
    '## Reporte de vulnerabilidades',
    '',
    'Define aqui el canal de contacto y el plazo de respuesta comprometido.',
  );

  return {
    path: 'SECURITY.md',
    contents: `${lines.join('\n')}\n`,
    producedBy: DESCRIPTOR.id,
  };
}

function scoreFrom(findings: readonly Finding[]): number {
  const penalties: Record<Severity, number> = { info: 0, low: 4, medium: 9, high: 20, critical: 35 };
  const total = findings.reduce((sum, finding) => sum + penalties[finding.severity], 0);
  return Math.max(0, 100 - total);
}

export function securityPlugin(): Plugin {
  return definePlugin({
    name: '@calecosystem/security',
    version: '0.1.0',
    description: 'Registra el auditor de seguridad en la fase `augment`.',
    tier: 'pro',
    register(api) {
      api.registerModule(new SecurityAuditor());
    },
  });
}

export default securityPlugin;
