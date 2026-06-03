/**
 * @fileoverview Funciones de utilidad y formateadores de datos para la calculadora.
 * Provee herramientas para estimación de tokens, formateo de divisas (USD), formateo de números
 * y mapeo de variables visuales a clases CSS.
 */

/**
 * Estima la cantidad de tokens basada en la longitud del texto.
 * Regla general aproximada: 4 caracteres equivalen a 1 token.
 * 
 * @param {string} text - El texto del prompt o skill a evaluar.
 * @returns {number} Cantidad estimada de tokens (entero redondeado, mínimo 0).
 */
function calculateTokens(text) {
  return Math.max(0, Math.round((text || '').length / 4));
}

/**
 * Formatea un valor numérico a una representación de moneda en dólares (USD).
 * Ajusta dinámicamente la precisión decimal según la escala del valor (para tokens baratos).
 * 
 * @param {number} value - El costo numérico en USD.
 * @returns {string} El string formateado (ej. "$0.0025" o "$3,450").
 */
function formatCurrency(value) {
  if (value === 0) return '$0.00';
  if (value < 0) return '-$' + formatCurrency(-value).slice(1);
  if (value < 0.0001) return '$' + value.toFixed(7);
  if (value < 0.001)  return '$' + value.toFixed(6);
  if (value < 0.01)   return '$' + value.toFixed(5);
  if (value < 1)      return '$' + value.toFixed(4);
  if (value < 1000)   return '$' + value.toFixed(2);
  return '$' + Math.round(value).toLocaleString();
}

/**
 * Simplifica números grandes añadiendo sufijos de escala (K para miles, M para millones, B para miles de millones).
 * 
 * @param {number} value - El número a simplificar.
 * @returns {string} El número formateado con su sufijo correspondiente.
 */
function formatNumber(value) {
  if (value >= 1e9) return (value / 1e9).toFixed(2) + 'B';
  if (value >= 1e6) return (value / 1e6).toFixed(2) + 'M';
  if (value >= 1e3) return (value / 1e3).toFixed(1) + 'K';
  return value.toLocaleString();
}

/**
 * Mapea el nivel (tier) del modelo con su respectiva clase CSS de color.
 * 
 * @param {string} tier - El nivel del modelo (Flagship, Balanced, Fast, Premium).
 * @returns {string} El nombre de la clase CSS de badge (tb-f, tb-b, tb-s, tb-p).
 */
function getTierBadgeClass(tier) {
  const mapping = {
    'Flagship': 'tb-f',
    'Balanced': 'tb-b',
    'Fast': 'tb-s',
    'Premium': 'tb-p'
  };
  return mapping[tier] || 'tb-b';
}

/**
 * Retorna la traducción al español y la etiqueta legible del período seleccionado.
 * 
 * @param {number|string} periodValue - Cantidad de días del período (1, 7, 30, 365).
 * @returns {string} La etiqueta en español (día, semana, mes, año).
 */
function getPeriodLabel(periodValue) {
  const mapping = {
    '1': 'día',
    '7': 'semana',
    '30': 'mes',
    '365': 'año'
  };
  return mapping[String(periodValue)] || 'período';
}

/**
 * Obtiene la configuración del modelo LLM seleccionado actualmente para un contexto.
 * Hace referencia al estado de la aplicación 'appState' definido en calculator.js.
 *
 * Manejo defensivo: si el modelId en appState no existe en MODELS[],
 * registra un error claro en consola y retorna null.
 * Los consumidores deben verificar el retorno antes de operar.
 *
 * @param {string} context - El contexto actual ('single' o 'batch').
 * @returns {ModelConfig|null} Objeto de configuración del modelo activo, o null si no se encuentra.
 */
function getSelectedModel(context) {
  const modelId = appState[context]?.modelId;
  const model   = MODELS.find(m => m.id === modelId);

  if (!model) {
    console.error(
      `[getSelectedModel] Modelo no encontrado — contexto: "${context}", modelId: "${modelId}". ` +
      `Verifica que el id exista en MODELS[] en models.js.`
    );
  }

  return model || null;
}

/**
 * Calcula la suma acumulada de tokens de todos los archivos "skills" cargados en el contexto.
 * Hace referencia al estado de la aplicación 'appState' definido en calculator.js.
 * 
 * @param {string} context - El contexto de trabajo ('single' o 'batch').
 * @returns {number} Cantidad de tokens acumulados de todos los skills del contexto.
 */
function getSkillsTokenCount(context) {
  return appState[context].skills.reduce((acc, skill) => acc + skill.tokens, 0);
}
