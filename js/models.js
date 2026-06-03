/**
 * @typedef {Object} ModelConfig
 * @property {string}   id            - Identificador único del modelo.
 * @property {string}   name          - Nombre descriptivo para mostrar en la interfaz.
 * @property {string}   provider      - Proveedor de IA (e.g., Anthropic, OpenAI).
 * @property {string}   tier          - Nivel de capacidad (Flagship, Balanced, Fast, Premium).
 * @property {number}   input         - Precio por millón de tokens de entrada en USD.
 * @property {number}   output        - Precio por millón de tokens de salida en USD.
 * @property {string}   color         - Color hexadecimal corporativo asignado para gráficos.
 * @property {number|null} cacheWrite - Precio por 1M tokens al escribir caché. null = no soporta o cobra igual que input.
 * @property {number|null} cacheRead  - Precio por 1M tokens al leer caché. null = no soporta caché.
 * @property {number}   speedTier     - Velocidad relativa: 1=lento · 2=medio · 3=rápido.
 * @property {number}   reasoning     - Capacidad de razonamiento 1–5 (benchmarks públicos del proveedor).
 * @property {number}   contextWindow - Ventana de contexto máxima en tokens.
 * @property {string[]} modalities    - Modalidades de entrada soportadas: ['text','image','audio'].
 */

/**
 * Listado de modelos LLM soportados y sus tarifas oficiales vigentes por millón de tokens (USD).
 * cacheWrite:    costo por 1M tokens al escribir al caché (primera vez). null = no aplica o cobra igual que input.
 * cacheRead:     costo por 1M tokens al leer del caché (siguientes llamadas). null = no soporta caché.
 *
 * Precios y capacidades (revisión: 2026-06 — fuente: docs.anthropic.com/en/docs/about-claude/models/overview):
 * speedTier:     1=lento · 2=medio · 3=rápido  (basado en latencia / throughput publicado por el proveedor)
 * reasoning:     1–5 escala relativa (basada en benchmarks MMLU, GPQA, HumanEval publicados por el proveedor)
 * contextWindow: ventana de contexto máxima en tokens (fuente: documentación oficial del proveedor)
 * modalities:    capacidades de entrada soportadas ['text','image','audio']
 *
 * NOTA: speedTier y reasoning son valoraciones relativas basadas en benchmarks y documentación pública.
 * No representan métricas oficiales comparables entre proveedores. Revisar trimestralmente.
 * @type {ModelConfig[]}
 */
const MODELS = [
  // ── Anthropic ──────────────────────────────────────────────────────────────
  // Fuente: https://docs.anthropic.com/en/docs/about-claude/models/overview
  // Última revisión: 2026-06
  { id: 'claude-opus-4-8',   name: 'Claude Opus 4.8',       provider: 'Anthropic', tier: 'Flagship', input: 5,    output: 25,   color: '#5C6BC0', cacheWrite: 6.25, cacheRead: 0.5,  speedTier: 2, reasoning: 5, contextWindow: 1000000,   modalities: ['text','image'] },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6',     provider: 'Anthropic', tier: 'Balanced', input: 3,    output: 15,   color: '#5C6BC0', cacheWrite: 3.75, cacheRead: 0.3,  speedTier: 3, reasoning: 4, contextWindow: 1000000,   modalities: ['text','image'] },
  { id: 'claude-haiku-4-5',  name: 'Claude Haiku 4.5',      provider: 'Anthropic', tier: 'Fast',     input: 1,    output: 5,    color: '#5C6BC0', cacheWrite: 1.25, cacheRead: 0.1,  speedTier: 3, reasoning: 3, contextWindow: 200000,    modalities: ['text','image'] },
  // ── OpenAI ─────────────────────────────────────────────────────────────────
  { id: 'gpt-5-4',           name: 'GPT-5.4',               provider: 'OpenAI',    tier: 'Balanced', input: 2.5,  output: 15,   color: '#0F9D58', cacheWrite: null, cacheRead: 1.25, speedTier: 2, reasoning: 5, contextWindow: 128000,    modalities: ['text','image'] },
  { id: 'gpt-5-4-pro',       name: 'GPT-5.4 Pro',           provider: 'OpenAI',    tier: 'Premium',  input: 30,   output: 180,  color: '#0F9D58', cacheWrite: null, cacheRead: 15.0, speedTier: 1, reasoning: 5, contextWindow: 128000,    modalities: ['text','image'] },
  { id: 'gpt-4o',            name: 'GPT-4o',                provider: 'OpenAI',    tier: 'Balanced', input: 2.5,  output: 10,   color: '#0F9D58', cacheWrite: null, cacheRead: 1.25, speedTier: 3, reasoning: 4, contextWindow: 128000,    modalities: ['text','image','audio'] },
  { id: 'gpt-4o-mini',       name: 'GPT-4o mini',           provider: 'OpenAI',    tier: 'Fast',     input: 0.15, output: 0.6,  color: '#0F9D58', cacheWrite: null, cacheRead: 0.075,speedTier: 3, reasoning: 2, contextWindow: 128000,    modalities: ['text','image'] },
  // ── Google ─────────────────────────────────────────────────────────────────
  { id: 'gemini-3-1-pro',    name: 'Gemini 3.1 Pro',        provider: 'Google',    tier: 'Flagship', input: 2,    output: 12,   color: '#1A73E8', cacheWrite: null, cacheRead: 0.5,  speedTier: 2, reasoning: 4, contextWindow: 1000000,   modalities: ['text','image','audio'] },
  { id: 'gemini-3-flash',    name: 'Gemini 3 Flash',        provider: 'Google',    tier: 'Balanced', input: 0.5,  output: 3,    color: '#1A73E8', cacheWrite: null, cacheRead: 0.125,speedTier: 3, reasoning: 3, contextWindow: 1000000,   modalities: ['text','image'] },
  { id: 'gemini-flash-lite', name: 'Gemini 3.1 Flash-Lite', provider: 'Google',    tier: 'Fast',     input: 0.1,  output: 0.4,  color: '#1A73E8', cacheWrite: null, cacheRead: 0.025,speedTier: 3, reasoning: 2, contextWindow: 1000000,   modalities: ['text'] },
  // ── DeepSeek ───────────────────────────────────────────────────────────────
  { id: 'deepseek-v3',       name: 'DeepSeek V3',           provider: 'DeepSeek',  tier: 'Balanced', input: 0.27, output: 1.1,  color: '#E65100', cacheWrite: null, cacheRead: 0.07, speedTier: 2, reasoning: 4, contextWindow: 128000,    modalities: ['text'] },
  // ── xAI ────────────────────────────────────────────────────────────────────
  { id: 'grok-4-1',          name: 'Grok 4.1',              provider: 'xAI',       tier: 'Balanced', input: 0.2,  output: 0.5,  color: '#7B1FA2', cacheWrite: null, cacheRead: null, speedTier: 2, reasoning: 3, contextWindow: 131072,    modalities: ['text','image'] },
];

/**
 * Listado deducido de proveedores únicos disponibles basados en el listado de modelos.
 * @type {string[]}
 */
const PROVIDERS = [...new Set(MODELS.map(m => m.provider))];

/* ==========================================================================
   Configuración de Bizagi BPUs — Fuente única de verdad
   ========================================================================== */

/**
 * Precio oficial por BPU en USD.
 * Actualizar aquí si cambia la tarifa del proveedor.
 */
const BIZAGI_PRICING = {
  pricePerBPU: 136.5
};

/**
 * Modelo Legacy (pre-2026): prompts y steps comparten el mismo pool de BPUs.
 * Fuente: https://help.bizagi.com/platform/en/index.html?cloud_scalabilty_as.htm
 */
const BIZAGI_LEGACY = {
  promptsPerBPU: 2500,
  stepsPerBPU:   10000
};

/**
 * Modelo 2026+: AI BPUs y Automation BPUs son pools completamente independientes.
 * Fuente: https://help.bizagi.com/platform/en/index.html?cloud_scalabilty_as.htm
 */
const BIZAGI_2026 = {
  tokensPerAiBPU:        50000000,  // 1 AI BPU = 50M tokens (input + output)
  stepsPerAutomationBPU: 10000      // 1 Automation BPU = 10,000 steps
};

/**
 * Catálogo de acciones de IA disponibles en Bizagi.
 * Extensible: agregar nuevas acciones aquí sin modificar la lógica de cálculo.
 */
const BIZAGI_ACTIONS = [
  { id: 'doc-extraction', name: 'Extracción de documentos PDF', category: 'Document AI'     },
  { id: 'ocr',            name: 'OCR y extracción de campos',   category: 'Document AI'     },
  { id: 'classification', name: 'Clasificación inteligente',    category: 'Machine Learning' },
  { id: 'prediction',     name: 'Predicción IA',                category: 'Machine Learning' },
  { id: 'generation',     name: 'Generación de contenido',      category: 'Generative AI'   },
  { id: 'custom',         name: 'Acción personalizada',         category: 'Custom'          }
];

/* ==========================================================================
   AWS Bedrock — Catálogo de modelos disponibles (On-Demand)
   Fuente oficial: https://aws.amazon.com/bedrock/pricing/
   Región de referencia: us-east-1 · Última revisión: 2026-06
   V2 multi-región: convertir BEDROCK_CATALOG en objeto { regionId: [...] }
   y BEDROCK_REGION_REF en selector dinámico en UI — sin cambiar el motor de cálculo.
   ========================================================================== */

/**
 * Región de referencia para precios Bedrock.
 * Cambiar aquí si el banco migra de región o en V2 se agrega selector multi-región.
 */
const BEDROCK_REGION_REF = 'us-east-1';

/**
 * Catálogo de modelos disponibles vía AWS Bedrock On-Demand.
 * modelId: debe coincidir exactamente con el id en MODELS[].
 * input/output: precio USD por 1M tokens en la región de referencia.
 * Modelos sin entrada aquí no están disponibles en Bedrock (GPT, Gemini, DeepSeek, Grok).
 */
const BEDROCK_CATALOG = [
  { modelId: 'claude-opus-4-8',   input: 15.00, output: 75.00 },
  { modelId: 'claude-sonnet-4-6', input: 3.00,  output: 15.00 },
  { modelId: 'claude-haiku-4-5',  input: 1.00,  output: 5.00  },
];

/* ==========================================================================
   Tipos de Iniciativa IA — Perfiles de recomendación para el Comité de IA
   Centraliza pesos, justificaciones y riesgos por tipo de caso de uso.
   Para agregar un nuevo tipo: añadir una entrada aquí sin tocar calculator.js.
   ========================================================================== */
const INITIATIVE_TYPES = [
  {
    id: 'classification',
    label: 'Clasificación / Extracción',
    icon: '🏷️',
    weights: { cost: 0.48, reasoning: 0.14, speed: 0.33, context: 0.05 },
    justification: {
      high:   'Capacidad de razonamiento superior a la requerida. Costo y velocidad son los factores críticos para esta tarea estructurada.',
      medium: 'Balance adecuado entre precisión y velocidad. Suficiente para clasificación con categorías bien definidas.',
      low:    'Velocidad máxima al mínimo costo. Adecuado para categorías claras; monitorear precisión en casos límite.'
    },
    risk: 'Puede fallar en clasificaciones ambiguas o categorías semánticamente similares. Validar con casos reales antes de producción.',
    altQualityReason: 'Si la precisión es crítica y los casos son ambiguos o complejos.',
    altCostReason:    'Si el volumen es muy alto y las categorías son simples y bien definidas.'
  },
  {
    id: 'generation',
    label: 'Generación de texto',
    icon: '✍️',
    weights: { cost: 0.27, reasoning: 0.43, speed: 0.22, context: 0.08 },
    justification: {
      high:   'Razonamiento alto ideal para generar textos coherentes, formales y con contexto financiero complejo.',
      medium: 'Razonamiento suficiente para redacción estructurada. Buen balance calidad-costo para generación en escala.',
      low:    'Velocidad alta a bajo costo. Adecuado solo para textos cortos y muy estructurados (plantillas fijas).'
    },
    risk: 'Modelos de razonamiento bajo pueden generar textos genéricos o inconsistentes con el tono institucional del banco.',
    altQualityReason: 'Si el contenido requiere precisión jurídica, financiera o regulatoria.',
    altCostReason:    'Si se generan textos cortos y altamente templados con poca variabilidad.'
  },
  {
    id: 'reasoning',
    label: 'Razonamiento complejo',
    icon: '🧠',
    weights: { cost: 0.13, reasoning: 0.52, speed: 0.20, context: 0.15 },
    justification: {
      high:   'Razonamiento máximo — óptimo para análisis multi-variable, evaluación de riesgo y decisiones financieras complejas.',
      medium: 'Razonamiento adecuado para análisis estructurado. Evaluar si los casos requieren mayor profundidad analítica.',
      low:    'Razonamiento insuficiente para esta categoría. Riesgo alto de respuestas incorrectas en análisis complejo.'
    },
    risk: 'Las tareas de razonamiento complejo son sensibles a alucinaciones. Siempre incluir validación humana en el flujo.',
    altQualityReason: 'Siempre preferir el modelo de mayor razonamiento disponible para esta categoría.',
    altCostReason:    'Solo si el análisis es semi-estructurado y los casos son predecibles.'
  },
  {
    id: 'conversation',
    label: 'Conversación / Chatbot',
    icon: '💬',
    weights: { cost: 0.32, reasoning: 0.23, speed: 0.35, context: 0.10 },
    justification: {
      high:   'Velocidad alta y costo controlado — factores clave para experiencia de usuario fluida en conversaciones en tiempo real.',
      medium: 'Balance velocidad-calidad adecuado. Respuestas coherentes sin latencia perceptible para el usuario final.',
      low:    'Velocidad máxima al menor costo. Revisar si el razonamiento es suficiente para la complejidad de las preguntas esperadas.'
    },
    risk: 'Modelos lentos degradan la experiencia del usuario en canales digitales. Medir latencia en condiciones de carga real.',
    altQualityReason: 'Si el chatbot maneja consultas financieras complejas o temas regulatorios sensibles.',
    altCostReason:    'Si el volumen de conversaciones es muy alto y las preguntas son principalmente FAQ.'
  },
  {
    id: 'documents',
    label: 'Análisis de documentos',
    icon: '📄',
    weights: { cost: 0.20, reasoning: 0.40, speed: 0.15, context: 0.25 },
    justification: {
      high:   'Razonamiento alto esencial para interpretar contratos, pólizas y extractos con precisión regulatoria.',
      medium: 'Razonamiento suficiente para extracción y análisis de documentos estructurados con campos definidos.',
      low:    'Razonamiento básico — solo para documentos muy estandarizados. Riesgo de errores en cláusulas complejas.'
    },
    risk: 'La ventana de contexto determina si el documento cabe en una sola llamada. Verificar que el modelo soporte el tamaño del documento.',
    altQualityReason: 'Si los documentos contienen cláusulas ambiguas, lenguaje legal complejo o requieren interpretación.',
    altCostReason:    'Si los documentos son formularios estandarizados con campos fijos y predecibles.'
  },
  {
    id: 'code',
    label: 'Código',
    icon: '⚙️',
    weights: { cost: 0.22, reasoning: 0.45, speed: 0.18, context: 0.15 },
    justification: {
      high:   'Razonamiento alto crítico para generación de código correcto, seguro y mantenible en sistemas bancarios.',
      medium: 'Razonamiento adecuado para scripts y automatizaciones. Revisar outputs en código de producción.',
      low:    'Razonamiento insuficiente para código de calidad. Solo para snippets muy simples y de bajo riesgo.'
    },
    risk: 'El código generado debe pasar revisión humana obligatoria antes de despliegue. No usar en sistemas críticos sin validación.',
    altQualityReason: 'Si el código integra sistemas financieros críticos o maneja datos sensibles de clientes.',
    altCostReason:    'Si se generan scripts utilitarios simples o transformaciones de datos predecibles.'
  },
];
