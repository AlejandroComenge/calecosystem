import type { EntityField, FeatureSet } from '@calecosystem/contracts';

/**
 * Lexicos del analizador.
 *
 * El analizador incluido es deterministico a propósito: mismas palabras,
 * misma arquitectura. Un modelo de lenguaje puede mejorarlo después a traves
 * del puerto `RequirementsEnricher`, pero la línea base no depende de una
 * llamada de red, no cuesta dinero por ejecución y es auditable.
 *
 * Todos los términos se escriben en minusculas y sin acentos porque el texto
 * de entrada se normaliza antes de comparar.
 */

/** Términos (es/en) que delatan cada capacidad transversal. */
export const FEATURE_LEXICON: Readonly<Record<keyof FeatureSet, readonly string[]>> = {
  auth: [
    'login', 'iniciar sesion', 'autenticacion', 'authentication', 'registro',
    'sign up', 'signup', 'cuenta', 'cuentas', 'usuarios registrados', 'oauth', 'sso', 'jwt',
  ],
  roles: [
    'rol', 'roles', 'permisos', 'permissions', 'perfiles', 'administrador',
    'administradores', 'moderador', 'rbac', 'niveles de acceso',
  ],
  payments: [
    'pago', 'pagos', 'pagar', 'cobro', 'cobros', 'stripe', 'paypal', 'checkout',
    'suscripcion', 'suscripciones', 'facturacion', 'facturas', 'tarjeta', 'payment', 'billing',
  ],
  realtime: [
    'tiempo real', 'realtime', 'websocket', 'websockets', 'chat', 'mensajeria',
    'en vivo', 'live', 'streaming', 'colaborativo',
  ],
  i18n: [
    'idioma', 'idiomas', 'multiidioma', 'multi idioma', 'internacionalizacion',
    'i18n', 'traduccion', 'traducciones', 'multilingue',
  ],
  fileUploads: [
    'subir archivos', 'subida de archivos', 'adjuntos', 'imagenes', 'fotos',
    'upload', 'uploads', 'galeria', 'documentos adjuntos', 'ficheros',
  ],
  search: [
    'busqueda', 'buscador', 'buscar', 'filtros', 'filtrar', 'search',
    'facetas', 'autocompletado',
  ],
  notifications: [
    'notificacion', 'notificaciones', 'avisos', 'alertas', 'email', 'correo',
    'emails', 'push', 'recordatorios',
  ],
  adminPanel: [
    'panel de administracion', 'backoffice', 'back office', 'panel admin',
    'administrar', 'gestionar', 'gestion', 'cms', 'dashboard',
  ],
  analytics: [
    'analitica', 'analiticas', 'metricas', 'estadisticas', 'informes',
    'reportes', 'kpi', 'kpis', 'analytics', 'cuadro de mando',
  ],
  multiTenant: [
    'multi tenant', 'multitenant', 'multiempresa', 'multi empresa',
    'organizaciones', 'workspaces', 'espacios de trabajo', 'varias empresas', 'saas',
  ],
  seo: ['seo', 'posicionamiento', 'indexacion', 'google', 'blog publico', 'landing', 'marketing'],
  offline: ['offline', 'sin conexion', 'pwa', 'app instalable', 'modo avion'],
};

/** Roles de negocio habituales y su etiqueta legible. */
export const ACTOR_LEXICON: Readonly<Record<string, string>> = {
  administrador: 'Administrador',
  admin: 'Administrador',
  cliente: 'Cliente',
  clientes: 'Cliente',
  usuario: 'Usuario',
  usuarios: 'Usuario',
  vendedor: 'Vendedor',
  vendedores: 'Vendedor',
  comprador: 'Comprador',
  compradores: 'Comprador',
  proveedor: 'Proveedor',
  proveedores: 'Proveedor',
  empleado: 'Empleado',
  empleados: 'Empleado',
  gestor: 'Gestor',
  supervisor: 'Supervisor',
  profesor: 'Profesor',
  profesores: 'Profesor',
  alumno: 'Alumno',
  alumnos: 'Alumno',
  estudiante: 'Estudiante',
  paciente: 'Paciente',
  pacientes: 'Paciente',
  medico: 'Medico',
  invitado: 'Invitado',
  visitante: 'Visitante',
  operador: 'Operador',
  repartidor: 'Repartidor',
};

/** Traducción de términos de dominio al nombre canonico de entidad. */
export const ENTITY_LEXICON: Readonly<Record<string, string>> = {
  producto: 'Product', productos: 'Product', articulo: 'Article', articulos: 'Article',
  pedido: 'Order', pedidos: 'Order', orden: 'Order', ordenes: 'Order',
  cliente: 'Customer', clientes: 'Customer', usuario: 'User', usuarios: 'User',
  factura: 'Invoice', facturas: 'Invoice', pago: 'Payment', pagos: 'Payment',
  reserva: 'Booking', reservas: 'Booking', cita: 'Appointment', citas: 'Appointment',
  curso: 'Course', cursos: 'Course', leccion: 'Lesson', lecciones: 'Lesson',
  categoria: 'Category', categorias: 'Category', etiqueta: 'Tag', etiquetas: 'Tag',
  comentario: 'Comment', comentarios: 'Comment', valoracion: 'Review', valoraciones: 'Review',
  resena: 'Review', resenas: 'Review', mensaje: 'Message', mensajes: 'Message',
  notificacion: 'Notification', notificaciones: 'Notification',
  carrito: 'Cart', carritos: 'Cart', envio: 'Shipment', envios: 'Shipment',
  proveedor: 'Supplier', proveedores: 'Supplier', empleado: 'Employee', empleados: 'Employee',
  proyecto: 'Project', proyectos: 'Project', tarea: 'Task', tareas: 'Task',
  evento: 'Event', eventos: 'Event', entrada: 'Ticket', entradas: 'Ticket',
  ticket: 'Ticket', tickets: 'Ticket', incidencia: 'Issue', incidencias: 'Issue',
  suscripcion: 'Subscription', suscripciones: 'Subscription', plan: 'Plan', planes: 'Plan',
  documento: 'Document', documentos: 'Document', inventario: 'InventoryItem',
  stock: 'InventoryItem', propiedad: 'Property', propiedades: 'Property',
  vehiculo: 'Vehicle', vehiculos: 'Vehicle', habitacion: 'Room', habitaciones: 'Room',
  hotel: 'Hotel', hoteles: 'Hotel', restaurante: 'Restaurant', restaurantes: 'Restaurant',
  menu: 'MenuItem', menus: 'MenuItem', plato: 'Dish', platos: 'Dish',
  paciente: 'Patient', pacientes: 'Patient', historial: 'MedicalRecord',
  alumno: 'Student', alumnos: 'Student', profesor: 'Teacher', profesores: 'Teacher',
  empresa: 'Company', empresas: 'Company', organizacion: 'Organization',
  organizaciones: 'Organization', equipo: 'Team', equipos: 'Team',
  publicacion: 'Post', publicaciones: 'Post', post: 'Post', posts: 'Post',
  campana: 'Campaign', campanas: 'Campaign', descuento: 'Discount', descuentos: 'Discount',
  cupon: 'Coupon', cupones: 'Coupon', direccion: 'Address', direcciones: 'Address',
  // Términos ya en inglés, por si el texto llega mezclado.
  product: 'Product', products: 'Product', order: 'Order', orders: 'Order',
  customer: 'Customer', customers: 'Customer', user: 'User', users: 'User',
  invoice: 'Invoice', booking: 'Booking', bookings: 'Booking', course: 'Course',
  courses: 'Course', review: 'Review', reviews: 'Review', project: 'Project',
  task: 'Task', tasks: 'Task', event: 'Event', events: 'Event',
};

/**
 * Palabras que nunca son entidades de negocio.
 *
 * Sin esta lista, la extracción genérica convierte en tabla de base de datos
 * cualquier sustantivo plural del enunciado: "opciones", "datos", "meses".
 * Es la diferencia entre proponer un modelo y proponer ruido.
 */
export const NON_ENTITY_WORDS: ReadonlySet<string> = new Set([
  // Meta-lenguaje del propio encargo
  'proyecto', 'proyectos', 'aplicacion', 'aplicaciones', 'app', 'apps', 'web',
  'webs', 'sistema', 'sistemas', 'plataforma', 'plataformas', 'herramienta',
  'herramientas', 'portal', 'portales', 'sitio', 'sitios', 'software',
  'programa', 'programas', 'solucion', 'soluciones', 'idea', 'ideas',
  'negocio', 'negocios', 'servicio', 'servicios', 'modulo', 'modulos',
  // Abstractos y muletillas
  'gente', 'personas', 'persona', 'cosas', 'cosa', 'temas', 'tema', 'formas',
  'forma', 'maneras', 'manera', 'tipos', 'tipo', 'partes', 'parte', 'veces',
  'vez', 'casos', 'caso', 'ejemplos', 'ejemplo', 'detalles', 'detalle',
  'aspectos', 'puntos', 'punto', 'niveles', 'nivel', 'grupos', 'grupo',
  // Atributos, no entidades
  'datos', 'dato', 'precios', 'precio', 'estados', 'estado', 'nombres',
  'nombre', 'fechas', 'fecha', 'cantidades', 'cantidad', 'importes',
  'importe', 'totales', 'total', 'descripciones', 'descripcion', 'titulos',
  'titulo', 'campos', 'campo', 'valores', 'valor', 'codigos', 'codigo',
  'numeros', 'numero', 'euros', 'euro', 'colores', 'color', 'tallas', 'talla',
  // Interfaz
  'paginas', 'pagina', 'pantallas', 'pantalla', 'vistas', 'vista', 'botones',
  'boton', 'menus', 'menu', 'formularios', 'formulario', 'listados',
  'listado', 'tablas', 'tabla', 'filtros', 'filtro', 'buscador', 'panel',
  'paneles', 'secciones', 'seccion', 'apartados', 'apartado', 'opciones',
  'opcion', 'funciones', 'funcion', 'funcionalidades', 'funcionalidad',
  // Tiempo y medida
  'meses', 'mes', 'anos', 'ano', 'dias', 'dia', 'horas', 'hora', 'minutos',
  'semanas', 'semana', 'momentos', 'momento', 'plazos', 'plazo',
  // Roles: se detectan como actores, no como entidades
  'roles', 'rol', 'permisos', 'permiso', 'perfiles', 'perfil',
]);

/**
 * Verbos que introducen el objeto que la aplicación gestiona.
 *
 * "los vendedores **publican** cartas" -> `cartas` es candidata a entidad.
 * Es la señal sintáctica más fiable sin un analizador morfológico completo.
 */
export const OBJECT_VERBS: readonly string[] = [
  'gestionar', 'gestiona', 'gestionan', 'administrar', 'administra',
  'administran', 'publicar', 'publica', 'publican', 'vender', 'vende',
  'venden', 'comprar', 'compra', 'compran', 'intercambiar', 'intercambia',
  'intercambian', 'alquilar', 'alquila', 'alquilan', 'ofrecer', 'ofrece',
  'ofrecen', 'registrar', 'registra', 'registran', 'listar', 'lista',
  'listan', 'subir', 'sube', 'suben', 'anadir', 'anade', 'anaden',
  'crear', 'crea', 'crean', 'catalogo de', 'inventario de', 'coleccion de',
];

/** Terminaciones que delatan un verbo o un adverbio, nunca un sustantivo. */
export const NON_NOUN_ENDINGS: readonly string[] = [
  'ar', 'er', 'ir', 'ando', 'iendo', 'mente', 'aba', 'aban', 'ria', 'rian',
];

/**
 * Verbos que enmarcan el encargo: lo que va detrás describe el entregable,
 * no el dominio. Van en dos listas porque se encadenan ("quiero preparar una
 * web") y una sola expresión regular capturaría el segundo verbo como si
 * fuera el sustantivo.
 */
export const FRAMING_MODALS: readonly string[] = [
  'quiero', 'queremos', 'necesito', 'necesitamos', 'busco', 'buscamos',
  'deseo', 'pretendo', 'me gustaria', 'estoy buscando', 'voy a', 'vamos a',
];

export const FRAMING_BUILD: readonly string[] = [
  'preparar', 'hacer', 'montar', 'crear', 'desarrollar', 'construir',
  'lanzar', 'disenar', 'programar', 'tener', 'poner en marcha',
];

/** Verbos que suelen introducir una enumeración de entidades. */
export const ENTITY_TRIGGERS: readonly string[] = [
  'gestionar', 'administrar', 'gestion de', 'administracion de', 'crear', 'registrar',
  'catalogo de', 'listado de', 'manage', 'listar', 'controlar', 'publicar', 'anadir',
];

const TIMESTAMPS: readonly EntityField[] = [
  { name: 'createdAt', type: 'datetime', required: true },
  { name: 'updatedAt', type: 'datetime', required: true },
];

/** Campos por defecto de cada entidad canonica. */
export const FIELD_TEMPLATES: Readonly<Record<string, readonly EntityField[]>> = {
  Product: [
    { name: 'name', type: 'string', required: true },
    { name: 'description', type: 'text', required: false },
    { name: 'price', type: 'decimal', required: true },
    { name: 'sku', type: 'string', required: false },
    { name: 'stock', type: 'number', required: true },
    { name: 'imageUrl', type: 'url', required: false },
    { name: 'active', type: 'boolean', required: true },
  ],
  Order: [
    { name: 'reference', type: 'string', required: true },
    { name: 'status', type: 'enum', required: true, description: 'pending | paid | shipped | cancelled' },
    { name: 'total', type: 'decimal', required: true },
    { name: 'customerId', type: 'reference', required: true, references: 'Customer' },
    { name: 'placedAt', type: 'datetime', required: true },
  ],
  Customer: [
    { name: 'fullName', type: 'string', required: true },
    { name: 'email', type: 'email', required: true },
    { name: 'phone', type: 'string', required: false },
    { name: 'company', type: 'string', required: false },
  ],
  User: [
    { name: 'email', type: 'email', required: true },
    { name: 'passwordHash', type: 'string', required: true },
    { name: 'displayName', type: 'string', required: true },
    { name: 'role', type: 'enum', required: true, description: 'admin | member' },
    { name: 'lastLoginAt', type: 'datetime', required: false },
  ],
  Invoice: [
    { name: 'number', type: 'string', required: true },
    { name: 'amount', type: 'decimal', required: true },
    { name: 'taxRate', type: 'decimal', required: true },
    { name: 'issuedAt', type: 'date', required: true },
    { name: 'dueAt', type: 'date', required: true },
    { name: 'customerId', type: 'reference', required: true, references: 'Customer' },
  ],
  Payment: [
    { name: 'amount', type: 'decimal', required: true },
    { name: 'currency', type: 'string', required: true },
    { name: 'provider', type: 'string', required: true },
    { name: 'status', type: 'enum', required: true, description: 'pending | succeeded | failed | refunded' },
    { name: 'externalId', type: 'string', required: false },
  ],
  Booking: [
    { name: 'startsAt', type: 'datetime', required: true },
    { name: 'endsAt', type: 'datetime', required: true },
    { name: 'status', type: 'enum', required: true, description: 'confirmed | pending | cancelled' },
    { name: 'notes', type: 'text', required: false },
  ],
  Appointment: [
    { name: 'scheduledAt', type: 'datetime', required: true },
    { name: 'durationMinutes', type: 'number', required: true },
    { name: 'status', type: 'enum', required: true, description: 'scheduled | done | cancelled' },
  ],
  Article: [
    { name: 'title', type: 'string', required: true },
    { name: 'slug', type: 'string', required: true },
    { name: 'body', type: 'text', required: true },
    { name: 'publishedAt', type: 'datetime', required: false },
  ],
  Post: [
    { name: 'title', type: 'string', required: true },
    { name: 'slug', type: 'string', required: true },
    { name: 'body', type: 'text', required: true },
    { name: 'publishedAt', type: 'datetime', required: false },
  ],
  Category: [
    { name: 'name', type: 'string', required: true },
    { name: 'slug', type: 'string', required: true },
    { name: 'parentId', type: 'reference', required: false, references: 'Category' },
  ],
  Review: [
    { name: 'rating', type: 'number', required: true },
    { name: 'comment', type: 'text', required: false },
    { name: 'authorId', type: 'reference', required: true, references: 'User' },
  ],
  Comment: [
    { name: 'body', type: 'text', required: true },
    { name: 'authorId', type: 'reference', required: true, references: 'User' },
  ],
  Message: [
    { name: 'body', type: 'text', required: true },
    { name: 'senderId', type: 'reference', required: true, references: 'User' },
    { name: 'readAt', type: 'datetime', required: false },
  ],
  Task: [
    { name: 'title', type: 'string', required: true },
    { name: 'description', type: 'text', required: false },
    { name: 'status', type: 'enum', required: true, description: 'todo | doing | done' },
    { name: 'dueAt', type: 'date', required: false },
    { name: 'assigneeId', type: 'reference', required: false, references: 'User' },
  ],
  Project: [
    { name: 'name', type: 'string', required: true },
    { name: 'description', type: 'text', required: false },
    { name: 'status', type: 'enum', required: true, description: 'active | archived' },
    { name: 'ownerId', type: 'reference', required: true, references: 'User' },
  ],
  Event: [
    { name: 'title', type: 'string', required: true },
    { name: 'startsAt', type: 'datetime', required: true },
    { name: 'location', type: 'string', required: false },
    { name: 'capacity', type: 'number', required: false },
  ],
  Subscription: [
    { name: 'planId', type: 'reference', required: true, references: 'Plan' },
    { name: 'status', type: 'enum', required: true, description: 'trialing | active | past_due | cancelled' },
    { name: 'renewsAt', type: 'datetime', required: true },
  ],
  Plan: [
    { name: 'name', type: 'string', required: true },
    { name: 'priceMonthly', type: 'decimal', required: true },
    { name: 'features', type: 'text', required: false },
  ],
  InventoryItem: [
    { name: 'productId', type: 'reference', required: true, references: 'Product' },
    { name: 'quantity', type: 'number', required: true },
    { name: 'location', type: 'string', required: false },
  ],
  Organization: [
    { name: 'name', type: 'string', required: true },
    { name: 'slug', type: 'string', required: true },
    { name: 'plan', type: 'string', required: false },
  ],
};

/** Campos genéricos para entidades fuera del lexico. */
export const DEFAULT_FIELDS: readonly EntityField[] = [
  { name: 'name', type: 'string', required: true },
  { name: 'description', type: 'text', required: false },
];

export function fieldsFor(entityName: string): EntityField[] {
  const base = FIELD_TEMPLATES[entityName] ?? DEFAULT_FIELDS;
  return [{ name: 'id', type: 'uuid', required: true }, ...base, ...TIMESTAMPS];
}

/** Normas de cumplimiento reconocidas y los términos que las activan. */
export const COMPLIANCE_LEXICON: Readonly<Record<string, readonly string[]>> = {
  gdpr: ['gdpr', 'rgpd', 'proteccion de datos', 'datos personales', 'lopd'],
  'pci-dss': ['pci', 'pci dss', 'datos de tarjeta', 'tarjetas de credito'],
  hipaa: ['hipaa', 'datos medicos', 'historia clinica', 'datos de salud'],
  'iso-27001': ['iso 27001', 'iso27001', 'sgsi'],
  soc2: ['soc 2', 'soc2'],
};

/** Integraciones de terceros detectables por nombre. */
export const INTEGRATION_LEXICON: readonly string[] = [
  'stripe', 'paypal', 'redsys', 'twilio', 'sendgrid', 'mailchimp', 'hubspot',
  'salesforce', 'google analytics', 'google maps', 'firebase', 'auth0', 'okta',
  'slack', 'zapier', 'shopify', 'woocommerce', 'sap', 'whatsapp', 'openai',
];
