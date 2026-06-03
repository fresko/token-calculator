/**
 * @fileoverview Lógica principal, controladores de eventos de UI y motor de cálculo
 * de la Calculadora de Tokens de IA del Banco de Occidente.
 * Administra el estado local de la simulación de Prompt único y Batch CSV.
 */

/**
 * Estado global de la aplicación.
 * Mantiene la selección de proveedor, modelo, archivos "skills" y datos de batch activos.
 * @type {Object}
 */
const appState = {
  single: {
    provider: 'Anthropic',
    modelId: 'claude-sonnet-4-6', // Sonnet 4.6 — sin cambio de id
    skills: [],
    inputMode: 'text'
  },
  batch: {
    provider: 'Anthropic',
    modelId: 'claude-sonnet-4-6',
    skills: [],
    prompts: []
  },
  cache: {
    provider: 'Anthropic',
    modelId: 'claude-sonnet-4-6'
  },
  bizagi: {
    pricingModel: 'legacy', // 'legacy' | '2026'
    actionId:     'doc-extraction',
    // Inputs legacy
    prompts:      2300,
    steps:        0,
    // Inputs 2026+
    aiTokens:     0,
    autoSteps:    0,
    // Común
    periodDays:   365
  }
};

/**
 * Gestiona el cambio de pestañas de navegación principal (Prompt único, Batch CSV, Comparativa).
 * 
 * @param {string} id - El identificador de la pestaña destino ('single', 'batch', 'compare').
 */
function switchTab(id) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + id).classList.add('active');
  const tabIndices = { single: 0, batch: 1, cache: 2, compare: 3, bizagi: 4 };
  document.querySelectorAll('.tab-btn')[tabIndices[id]].classList.add('active');
}

/**
 * Renderiza de manera dinámica las pastillas de proveedores (pills) y la lista de modelos
 * del proveedor seleccionado para un contexto de trabajo específico.
 * 
 * @param {string} ctx - El contexto de ejecución ('single' o 'batch').
 */
function renderProviders(ctx) {
  const prefix = ctx === 'single' ? 's' : ctx === 'batch' ? 'b' : 'cc';
  
  document.getElementById(prefix + '-ppills').innerHTML = PROVIDERS.map(p => {
    const isActive = p === appState[ctx].provider ? 'active' : '';
    return `<button class="pill ${isActive}" onclick="selProv('${ctx}','${p}')">${p}</button>`;
  }).join('');
  
  document.getElementById(prefix + '-mlist').innerHTML = MODELS
    .filter(m => m.provider === appState[ctx].provider)
    .map(m => {
      const isSelected = m.id === appState[ctx].modelId ? 'sel' : '';
      const badgeClass = getTierBadgeClass(m.tier);
      return `
        <div class="mitem ${isSelected}" onclick="selMdl('${ctx}','${m.id}')">
          <div class="mitem-top">
            <span class="mitem-name">${m.name}</span>
            <span class="tbadge ${badgeClass}">${m.tier}</span>
          </div>
          <div class="mitem-price">in: $${m.input}/1M · out: $${m.output}/1M</div>
        </div>`;
    }).join('');

  // Para el tab cache, renderiza también el cuadro de tarifas de caché
  if (ctx === 'cache') {
    const m = MODELS.find(mod => mod.id === appState.cache.modelId);
    const ratesEl = document.getElementById('cc-rates-info');
    if (m && m.cacheRead !== null) {
      const writeLabel = m.cacheWrite !== null ? `$${m.cacheWrite}/1M` : `igual a input ($${m.input}/1M)`;
      ratesEl.innerHTML =
        `Input normal: <span style="color:var(--t1);">$${m.input}/1M</span><br>` +
        `Cache write:  <span style="color:var(--am);">${writeLabel}</span><br>` +
        `Cache read:   <span style="color:var(--gr);">$${m.cacheRead}/1M</span><br>` +
        `Ahorro en read: <span style="color:var(--gr);">${((1 - m.cacheRead / m.input) * 100).toFixed(0)}% vs input normal</span>`;
    } else {
      ratesEl.innerHTML = `<span style="color:var(--rd);">⚠ Este modelo no soporta Prompt Caching oficial.</span>`;
    }
  }
}

/**
 * Modifica el proveedor de IA del estado del contexto, restablece el modelo al primero
 * disponible de ese proveedor y refresca la visualización de la UI.
 * 
 * @param {string} ctx - El contexto de ejecución ('single' o 'batch').
 * @param {string} p - Nombre del proveedor seleccionado.
 */
function selProv(ctx, p) {
  appState[ctx].provider = p;
  const firstModelOfProvider = MODELS.find(m => m.provider === p);
  if (firstModelOfProvider) {
    appState[ctx].modelId = firstModelOfProvider.id;
  }
  renderProviders(ctx);
  if (ctx === 'single') calcSingle();
  else if (ctx === 'batch') calcBatch();
  else calcCache();
}

/**
 * Modifica el modelo de IA seleccionado en el estado para el contexto y actualiza la UI.
 * 
 * @param {string} ctx - El contexto de ejecución ('single' o 'batch').
 * @param {string} id - ID único del modelo seleccionado.
 */
function selMdl(ctx, id) {
  appState[ctx].modelId = id;
  renderProviders(ctx);
  if (ctx === 'single') calcSingle();
  else if (ctx === 'batch') calcBatch();
  else calcCache();
}

/* ==========================================================================
   Gestión de Skills / Archivos de Contexto Base (Drag & Drop + File Input)
   ========================================================================== */

/**
 * Evento DragOver de HTML5. Evita comportamiento por defecto y añade la clase visual de hover.
 * @param {DragEvent} e - Evento de arrastre.
 * @param {string} id - ID del elemento contenedor drop-zone.
 */
function dOver(e, id) {
  e.preventDefault();
  document.getElementById(id).classList.add('drag');
}

/**
 * Evento DragLeave de HTML5. Remueve la clase visual de hover de la drop-zone.
 * @param {string} id - ID del elemento contenedor drop-zone.
 */
function dLeave(id) {
  document.getElementById(id).classList.remove('drag');
}

/**
 * Evento Drop de HTML5 para cargar archivos como skills.
 * @param {DragEvent} e - Evento de soltar archivo.
 * @param {string} ctx - El contexto de ejecución ('single' o 'batch').
 */
function dDropSkill(e, ctx) {
  e.preventDefault();
  const prefix = ctx === 'single' ? 's' : 'b';
  dLeave(prefix + '-skill-drop');
  loadSkillFiles(e.dataTransfer.files, ctx);
}

/**
 * Lector al seleccionar archivos vía input file clásico de HTML.
 * @param {Event} e - Evento de cambio de input.
 * @param {string} ctx - El contexto de ejecución ('single' o 'batch').
 */
function loadSkills(e, ctx) {
  loadSkillFiles(e.target.files, ctx);
  e.target.value = ''; // Limpia el input para permitir recargar el mismo archivo si es necesario
}

/**
 * Procesa la lista de archivos cargados (.txt, .md), estima sus tokens y los guarda en el estado local.
 * 
 * @param {FileList} files - Listado de archivos cargados en el cliente.
 * @param {string} ctx - El contexto de ejecución ('single' o 'batch').
 */
function loadSkillFiles(files, ctx) {
  Array.from(files).forEach(f => {
    const reader = new FileReader();
    reader.onload = ev => {
      const textContent = ev.target.result;
      const estimatedTokens = calculateTokens(textContent);
      
      // Agrega el skill procesado al listado del estado
      appState[ctx].skills.push({
        name: f.name,
        tokens: estimatedTokens,
        size: f.size
      });
      
      renderSkills(ctx);
      
      if (ctx === 'single') {
        calcSingle();
      } else {
        calcBatch();
      }
    };
    reader.readAsText(f);
  });
}

/**
 * Remueve un archivo de skill del estado por su índice de arreglo y actualiza los costos.
 * 
 * @param {string} ctx - El contexto de ejecución ('single' o 'batch').
 * @param {number} i - Índice del elemento en el arreglo.
 */
function removeSkill(ctx, i) {
  appState[ctx].skills.splice(i, 1);
  renderSkills(ctx);
  if (ctx === 'single') {
    calcSingle();
  } else {
    calcBatch();
  }
}

/**
 * Renderiza el listado de archivos de contexto (skills) actualmente activos y calcula el total de tokens.
 * 
 * @param {string} ctx - El contexto de ejecución ('single' o 'batch').
 */
function renderSkills(ctx) {
  const prefix = ctx === 'single' ? 's' : 'b';
  const container = document.getElementById(prefix + '-skill-list');
  
  // Renderiza el HTML para cada ítem de skill
  container.innerHTML = appState[ctx].skills.map((s, i) => `
    <div class="skill-item">
      <div>
        <div class="skill-name">📄 ${s.name}</div>
        <div class="skill-meta">${(s.size / 1024).toFixed(1)} KB</div>
      </div>
      <div style="display:flex;align-items:center;gap:7px;">
        <span class="skill-tok">≈ ${formatNumber(s.tokens)} tok</span>
        <button class="skill-rm" onclick="removeSkill('${ctx}',${i})">✕</button>
      </div>
    </div>`).join('');
    
  // Actualiza el indicador global de tokens de skill en la interfaz
  document.getElementById(prefix + '-skill-tok').textContent = formatNumber(getSkillsTokenCount(ctx)) + ' tokens';
}

/* ==========================================================================
   Procesamiento de Archivos Batch CSV (Prompts Masivos)
   ========================================================================== */

/**
 * Evento Drop de HTML5 para cargar el archivo CSV masivo.
 * @param {DragEvent} e - Evento de soltar archivo.
 */
function dDropCSV(e) {
  e.preventDefault();
  dLeave('csv-dz');
  parseCSV(e.dataTransfer.files[0]);
}

/**
 * Lector al seleccionar el CSV desde el buscador de archivos.
 * @param {Event} e - Evento de cambio de input file.
 */
function loadCSV(e) {
  parseCSV(e.target.files[0]);
  e.target.value = '';
}

/**
 * Procesa y valida el archivo CSV para extraer prompts y tokens de salida esperados.
 * Requiere una columna "prompt" obligatoria, y columnas opcionales "nombre" e "output_tokens".
 * 
 * @param {File} file - El archivo CSV a parsear.
 */
function parseCSV(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const lines = ev.target.result.split('\n').filter(l => l.trim());
    if (lines.length < 2) {
      alert('El CSV necesita un encabezado en la primera fila y al menos un prompt.');
      return;
    }
    
    // Obtiene los nombres de columnas limpias en minúsculas
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
    const nameIdx = headers.indexOf('nombre');
    const promptIdx = headers.indexOf('prompt');
    const outputIdx = headers.indexOf('output_tokens');
    
    if (promptIdx < 0) {
      alert('El archivo CSV debe contener una columna llamada exactamente "prompt".');
      return;
    }
    
    // Mapea las filas del CSV en prompts de datos estructurados en el estado
    appState.batch.prompts = lines.slice(1).filter(l => l.trim()).map((line, i) => {
      const parsedColumns = parseCSVLine(line);
      return {
        name: nameIdx >= 0 && parsedColumns[nameIdx] ? parsedColumns[nameIdx] : 'Prompt ' + (i + 1),
        prompt: parsedColumns[promptIdx] || '',
        outputTokens: outputIdx >= 0 && parsedColumns[outputIdx] ? parseInt(parsedColumns[outputIdx]) || null : null
      };
    });
    
    calcBatch();
  };
  reader.readAsText(file);
}

/**
 * Parsea una línea de texto CSV de forma segura, contemplando comas dentro de textos entre comillas dobles.
 * 
 * @param {string} line - La línea de texto cruda del archivo CSV.
 * @returns {string[]} Colección de strings representando las celdas de la fila.
 */
function parseCSVLine(line) {
  const result = [];
  let currentCell = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes; // Cambia el estado al encontrar comillas dobles
    } else if (char === ',' && !inQuotes) {
      result.push(currentCell.trim()); // Finaliza celda
      currentCell = '';
    } else {
      currentCell += char;
    }
  }
  result.push(currentCell.trim()); // Agrega última celda
  return result;
}

/* ==========================================================================
   Lógica y Fórmulas de Cálculo de Costos Financieros
   ========================================================================== */

/**
 * Ejecuta el cálculo financiero y de tokens para la simulación de Prompt Único.
 * Renderiza los resultados en métricas, el desglose detallado de costos y proyecciones.
 */
function setSingleMode(mode) {
  const isText = mode === 'text';
  document.getElementById('s-text-mode').style.display   = isText ? '' : 'none';
  document.getElementById('s-tokens-mode').style.display = isText ? 'none' : '';
  document.getElementById('s-mode-text').classList.toggle('active',   isText);
  document.getElementById('s-mode-tokens').classList.toggle('active', !isText);
  appState.single.inputMode = mode;
  calcSingle();
}

function calcSingle() {
  const isTokenMode = appState.single.inputMode === 'tokens';
  let inputTokensPrompt;

  if (isTokenMode) {
    inputTokensPrompt = parseInt(document.getElementById('s-input-tok').value) || 0;
    document.getElementById('s-itok-manual').textContent = inputTokensPrompt.toLocaleString() + ' tokens';
  } else {
    const textInput = document.getElementById('s-input').value;
    inputTokensPrompt = calculateTokens(textInput);
    document.getElementById('s-chars').textContent = textInput.length.toLocaleString() + ' chars';
    document.getElementById('s-itok').textContent  = formatNumber(inputTokensPrompt);
  }

  const inputTokensSkill = getSkillsTokenCount('single');
  
  const expectedOutputTokens = parseInt(document.getElementById('s-out').value) || 500;
  const executionCount = parseInt(document.getElementById('s-calls').value) || 1000;
  const periodDays = parseInt(document.getElementById('s-period').value) || 30;
  const periodLabel = getPeriodLabel(periodDays);
  
  const selectedModel = getSelectedModel('single');
  if (!selectedModel) {
    document.getElementById('s-metrics').innerHTML =
      `<div class="empty" style="grid-column:1/-1;">
        <div class="empty-icon">⚠️</div>
        <div class="empty-text">Modelo no disponible</div>
        <div class="empty-hint">El modelo seleccionado no se encontró. Selecciona otro modelo para continuar.</div>
      </div>`;
    return;
  }

  const totalInputTokens = inputTokensPrompt + inputTokensSkill;

  // FÓRMULA DE COSTO POR LLAMADA: (Tokens Entrada / 1,000,000 * Precio Input) + (Tokens Salida / 1,000,000 * Precio Output)
  const costPerCall = (totalInputTokens * selectedModel.input / 1e6) + (expectedOutputTokens * selectedModel.output / 1e6);
  const totalPeriodCost = costPerCall * executionCount;
  
  // 1. Renderizar tarjetas de métricas en la interfaz
  document.getElementById('s-metrics').innerHTML = `
    <div class="met">
      <div class="met-lbl">Tokens entrada</div>
      <div class="met-val">${formatNumber(totalInputTokens)}</div>
      <div class="met-sub">prompt + skill</div>
    </div>
    <div class="met">
      <div class="met-lbl">Tokens salida</div>
      <div class="met-val">${formatNumber(expectedOutputTokens)}</div>
      <div class="met-sub">por llamada</div>
    </div>
    <div class="met hl">
      <div class="met-lbl">Costo / llamada</div>
      <div class="met-val">${formatCurrency(costPerCall)}</div>
      <div class="met-sub">USD</div>
    </div>
    <div class="met gr">
      <div class="met-lbl">Costo / ${periodLabel}</div>
      <div class="met-val">${formatCurrency(totalPeriodCost)}</div>
      <div class="met-sub">${formatNumber(executionCount)} llamadas</div>
    </div>`;
    
  // 2. Renderizar gráfico de desglose de peso de tokens
  const grandTotalTokens = totalInputTokens + expectedOutputTokens || 1;
  const promptWeightPct = Math.round(inputTokensPrompt / grandTotalTokens * 100);
  const skillWeightPct = Math.round(inputTokensSkill / grandTotalTokens * 100);
  const outputWeightPct = 100 - promptWeightPct - skillWeightPct;
  
  document.getElementById('s-tokbar').innerHTML = `
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:10px;">
      <span style="font-size:11px;color:var(--t2);display:flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:3px;background:#0079C1;display:inline-block;"></span>Prompt: ${formatNumber(inputTokensPrompt)} (${promptWeightPct}%)</span>
      <span style="font-size:11px;color:var(--t2);display:flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:3px;background:#7C3AED;display:inline-block;"></span>Skills: ${formatNumber(inputTokensSkill)} (${skillWeightPct}%)</span>
      <span style="font-size:11px;color:var(--t2);display:flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:3px;background:#008A4B;display:inline-block;"></span>Salida: ${formatNumber(expectedOutputTokens)} (${outputWeightPct}%)</span>
    </div>
    <div style="display:flex;gap:2px;height:8px;border-radius:999px;overflow:hidden;background:var(--s4);">
      <div style="width:${promptWeightPct}%;background:#0079C1;opacity:0.9;"></div>
      <div style="width:${skillWeightPct}%;background:#7C3AED;opacity:0.9;"></div>
      <div style="width:${outputWeightPct}%;background:#008A4B;opacity:0.9;"></div>
    </div>`;
    
  // 3. Renderizar las tarjetas de desglose de costo detallado
  document.getElementById('s-costbd').innerHTML = `
    <div class="bd-card">
      <div class="bd-title">Por llamada</div>
      <div class="bd-row"><span>Entrada (prompt)</span><span class="bd-val">${formatCurrency(inputTokensPrompt * selectedModel.input / 1e6)}</span></div>
      <div class="bd-row"><span>Entrada (skill)</span><span class="bd-val">${formatCurrency(inputTokensSkill * selectedModel.input / 1e6)}</span></div>
      <div class="bd-row"><span>Salida</span><span class="bd-val">${formatCurrency(expectedOutputTokens * selectedModel.output / 1e6)}</span></div>
      <div class="bd-row"><span>Total</span><span class="bd-val">${formatCurrency(costPerCall)}</span></div>
    </div>
    <div class="bd-card">
      <div class="bd-title">Por ${periodLabel} (${formatNumber(executionCount)} llamadas)</div>
      <div class="bd-row"><span>Costo entrada</span><span class="bd-val">${formatCurrency(totalInputTokens * selectedModel.input / 1e6 * executionCount)}</span></div>
      <div class="bd-row"><span>Costo salida</span><span class="bd-val">${formatCurrency(expectedOutputTokens * selectedModel.output / 1e6 * executionCount)}</span></div>
      <div class="bd-row"><span>Total ${periodLabel}</span><span class="bd-val">${formatCurrency(totalPeriodCost)}</span></div>
    </div>
    <div class="bd-card">
      <div class="bd-title">Proyecciones de Tiempo</div>
      <div class="bd-row"><span>Diario</span><span class="bd-val">${formatCurrency(totalPeriodCost / periodDays)}</span></div>
      <div class="bd-row"><span>Mensual</span><span class="bd-val">${formatCurrency(totalPeriodCost / periodDays * 30)}</span></div>
      <div class="bd-row"><span>Anual</span><span class="bd-val">${formatCurrency(totalPeriodCost / periodDays * 365)}</span></div>
    </div>`;
}

/**
 * Ejecuta el cálculo financiero para el procesamiento masivo Batch CSV.
 * Renderiza la barra de resumen de lotes, la tabla interactiva de desglose por prompt y proyecciones.
 */
function calcBatch() {
  const selectedModel = getSelectedModel('batch');
  if (!selectedModel) {
    document.getElementById('b-summary').innerHTML = '';
    document.getElementById('b-tbody').innerHTML =
      `<tr><td colspan="9">
        <div class="empty">
          <div class="empty-icon">⚠️</div>
          <div class="empty-text">Modelo no disponible</div>
          <div class="empty-hint">El modelo seleccionado no se encontró. Selecciona otro modelo para continuar.</div>
        </div>
      </td></tr>`;
    document.getElementById('b-totals').innerHTML = '';
    return;
  }

  const inputTokensSkill    = getSkillsTokenCount('batch');
  const defaultOutputTokens = parseInt(document.getElementById('b-out-def').value)  || 500;
  const extraInputTokens    = parseInt(document.getElementById('b-in-extra').value) || 0;
  const executionCount      = parseInt(document.getElementById('b-calls').value)    || 1000;
  const periodDays          = parseInt(document.getElementById('b-period').value)   || 30;
  const periodLabel         = getPeriodLabel(periodDays);
  const promptList          = appState.batch.prompts;

  // Modo override — ignora valores individuales del CSV cuando está activo
  const outputOverride = document.getElementById('b-out-override').checked;
  const inputOverride  = document.getElementById('b-in-override').checked;
  const scenarioActive = outputOverride || inputOverride;
  
  // Renderizar estado vacío si no se han cargado prompts
  if (promptList.length === 0) {
    document.getElementById('b-summary').innerHTML = '';
    document.getElementById('b-tbody').innerHTML = `
      <tr>
        <td colspan="9">
          <div class="empty">
            <div class="empty-icon">📂</div>
            <div class="empty-text">Sube un archivo CSV para comenzar</div>
            <div class="empty-hint">Formato esperado: nombre, prompt, output_tokens (opcional)</div>
          </div>
        </td>
      </tr>`;
    document.getElementById('b-totals').innerHTML = '';
    return;
  }
  
  // 1. Procesa cada fila evaluando sus costos e importes
  const processedRows = promptList.map(p => {
    // Output: override fuerza el valor por defecto en todos los prompts
    const outputTokens = outputOverride
      ? defaultOutputTokens
      : (p.outputTokens || defaultOutputTokens);

    // Input: override suma tokens extra al texto del CSV para simular carga real
    const baseInputTokens = calculateTokens(p.prompt);
    const inputTokensPrompt = inputOverride
      ? baseInputTokens + extraInputTokens
      : baseInputTokens;

    const totalInput = inputTokensPrompt + inputTokensSkill;
    const costPerCall = (totalInput * selectedModel.input / 1e6) + (outputTokens * selectedModel.output / 1e6);
    return {
      ...p,
      pT: inputTokensPrompt,
      sT: inputTokensSkill,
      oT: outputTokens,
      totIn: totalInput,
      cpc: costPerCall,
      costTotal: costPerCall * executionCount
    };
  });
  
  // Totales acumulados del lote
  const grandTotalCost = processedRows.reduce((acc, row) => acc + row.costTotal, 0);
  const grandTotalTokens = processedRows.reduce((acc, row) => acc + (row.totIn + row.oT) * executionCount, 0);
  const maxPromptCost = Math.max(...processedRows.map(row => row.costTotal));
  
  // 2. Renderizar barra superior de resumen global
  // Badge de modo simulación — visible cuando cualquier override está activo
  const scenarioBadge = scenarioActive ? `
    <div class="sb-div"></div>
    <div class="sb-item">
      <div class="sb-lbl">Modo</div>
      <div class="batch-scenario-badge">⚡ Simulación activa</div>
    </div>` : '';

  const scenarioDetail = scenarioActive ? `
    <div class="batch-scenario-bar">
      ${outputOverride ? `<span>Output forzado: <strong>${defaultOutputTokens} tok</strong> en todos los prompts</span>` : ''}
      ${outputOverride && inputOverride ? '<span style="margin:0 6px;color:var(--b2);">·</span>' : ''}
      ${inputOverride  ? `<span>Input adicional: <strong>+${formatNumber(extraInputTokens)} tok</strong> por prompt</span>` : ''}
      <span style="margin-left:auto;font-size:10px;color:var(--am);">Los valores del CSV están siendo ignorados parcialmente</span>
    </div>` : '';

  document.getElementById('b-summary').innerHTML = `
    <div class="summary-bar">
      <div class="sb-item"><div class="sb-lbl">Prompts</div><div class="sb-val">${processedRows.length}</div></div>
      <div class="sb-div"></div>
      <div class="sb-item"><div class="sb-lbl">Skills</div><div class="sb-val">${formatNumber(inputTokensSkill)} tok</div></div>
      <div class="sb-div"></div>
      <div class="sb-item"><div class="sb-lbl">Tokens / ${periodLabel}</div><div class="sb-val" style="color:var(--ac);">${formatNumber(grandTotalTokens)}</div></div>
      <div class="sb-div"></div>
      <div class="sb-item"><div class="sb-lbl">Costo / ${periodLabel}</div><div class="sb-val" style="color:var(--gr);">${formatCurrency(grandTotalCost)}</div></div>
      <div class="sb-div"></div>
      <div class="sb-item"><div class="sb-lbl">Modelo</div><div class="sb-val" style="font-size:13px;">${selectedModel.name}</div></div>
      ${scenarioBadge}
    </div>
    ${scenarioDetail}`;
    
  // 3. Renderizar filas de la tabla de detalles con barras de proporción y etiquetas de costo
  document.getElementById('b-tbody').innerHTML = processedRows.map((r, i) => {
    const costBarPct = maxPromptCost > 0 ? Math.round(r.costTotal / maxPromptCost * 100) : 0;
    const batchWeightPct = grandTotalCost > 0 ? ((r.costTotal / grandTotalCost) * 100).toFixed(1) : 0;
    
    // Mapea la etiqueta de severidad según el peso porcentual del costo del prompt
    const weightTagClass = batchWeightPct > 20 ? 'tag-rd' : batchWeightPct > 10 ? 'tag-am' : 'tag-gr';
    
    return `
      <tr>
        <td class="mono" style="color:var(--t3);">${i + 1}</td>
        <td><strong>${r.name}</strong></td>
        <td class="mono">${formatNumber(r.pT)}</td>
        <td class="mono" style="color:var(--pu);">${formatNumber(r.sT)}</td>
        <td class="mono">${formatNumber(r.oT)}</td>
        <td class="mono">${formatNumber(r.totIn + r.oT)}</td>
        <td class="mono">${formatCurrency(r.cpc)}</td>
        <td>
          <div class="cost-cell">
            <span class="mono">${formatCurrency(r.costTotal)}</span>
            <div class="cost-bar">
              <div class="cost-bar-f" style="width:${costBarPct}%;"></div>
            </div>
          </div>
        </td>
        <td><span class="${weightTagClass}">${batchWeightPct}%</span></td>
      </tr>`;
  }).join('');
  
  // 4. Renderizar tarjetas inferiores de resumen y proyecciones
  const totalInputTokensAllCalls = processedRows.reduce((acc, row) => acc + row.totIn * executionCount, 0);
  const totalOutputTokensAllCalls = processedRows.reduce((acc, row) => acc + row.oT * executionCount, 0);
  
  document.getElementById('b-totals').innerHTML = `
    <div class="sec-hdr">Resumen por período</div>
    <div class="bd-grid">
      <div class="bd-card">
        <div class="bd-title">Tokens / ${periodLabel}</div>
        <div class="bd-row"><span>Total entrada</span><span class="bd-val">${formatNumber(totalInputTokensAllCalls)}</span></div>
        <div class="bd-row"><span>Total salida</span><span class="bd-val">${formatNumber(totalOutputTokensAllCalls)}</span></div>
        <div class="bd-row"><span>Total general</span><span class="bd-val">${formatNumber(grandTotalTokens)}</span></div>
      </div>
      <div class="bd-card">
        <div class="bd-title">Costo / ${periodLabel}</div>
        <div class="bd-row"><span>Costo entrada</span><span class="bd-val">${formatCurrency(totalInputTokensAllCalls * selectedModel.input / 1e6)}</span></div>
        <div class="bd-row"><span>Costo salida</span><span class="bd-val">${formatCurrency(totalOutputTokensAllCalls * selectedModel.output / 1e6)}</span></div>
        <div class="bd-row"><span>Total</span><span class="bd-val">${formatCurrency(grandTotalCost)}</span></div>
      </div>
      <div class="bd-card">
        <div class="bd-title">Proyecciones de Tiempo</div>
        <div class="bd-row"><span>Diario</span><span class="bd-val">${formatCurrency(grandTotalCost / periodDays)}</span></div>
        <div class="bd-row"><span>Mensual</span><span class="bd-val">${formatCurrency(grandTotalCost / periodDays * 30)}</span></div>
        <div class="bd-row"><span>Anual</span><span class="bd-val">${formatCurrency(grandTotalCost / periodDays * 365)}</span></div>
      </div>
    </div>`;
}

/* ==========================================================================
   Comparativa de Modelos — estado de ordenación
   ========================================================================== */
const compareState = {
  sortBy:     'cost',  // 'cost' | 'score'
  view:       'all',   // 'all' | 'bedrock'
  initiative: null,    // id del tipo seleccionado o null
  lastRows:   null     // última ejecución de _calcCompareAllView() — para _renderRecommendation()
};

/**
 * Cambia el criterio de ordenación y re-renderiza la tabla.
 * @param {string} by - 'cost' | 'score'
 */
function setCompareSort(by) {
  compareState.sortBy = by;
  document.getElementById('c-sort-cost').classList.toggle('active',  by === 'cost');
  document.getElementById('c-sort-score').classList.toggle('active', by === 'score');
  calcCompare();
}

/**
 * Cambia la vista entre todos los modelos y Direct API vs AWS Bedrock.
 * En modo 'bedrock' la tabla muestra filas pareadas por modelo disponible en Bedrock.
 * @param {string} view - 'all' | 'bedrock'
 */
function setCompareView(view) {
  compareState.view = view;
  document.getElementById('c-view-all').classList.toggle('active',    view === 'all');
  document.getElementById('c-view-bedrock').classList.toggle('active', view === 'bedrock');

  // El selector de score no aplica en modo Bedrock — las filas Bedrock distorsionan el score
  const sortBar = document.getElementById('c-sort-score');
  sortBar.disabled = view === 'bedrock';
  sortBar.style.opacity = view === 'bedrock' ? '0.4' : '1';
  if (view === 'bedrock') {
    compareState.sortBy = 'cost';
    document.getElementById('c-sort-cost').classList.add('active');
    document.getElementById('c-sort-score').classList.remove('active');
  }

  // Mostrar/ocultar leyenda de score
  document.getElementById('c-score-legend').style.display = view === 'bedrock' ? 'none' : '';
  // Mostrar/ocultar insight Bedrock
  document.getElementById('c-bedrock-insight').style.display = view === 'bedrock' ? '' : 'none';

  calcCompare();
}

/**
 * Genera los puntos de velocidad visuales (●●●).
 * Verde=rápido · Ámbar=medio · Rojo=lento.
 * @param {number} tier - 1|2|3
 * @returns {string} HTML con los puntos
 */
function _speedDots(tier) {
  const colors = ['var(--rd)', 'var(--am)', 'var(--gr)'];
  const labels = ['Lento', 'Medio', 'Rápido'];
  return `<span class="speed-dots" title="${labels[tier-1]}">` +
    [1,2,3].map(i =>
      `<span class="speed-dot" style="background:${i <= tier ? colors[tier-1] : 'var(--s4)'};"></span>`
    ).join('') +
  `</span>`;
}

/**
 * Genera la mini barra de razonamiento (1–5).
 * @param {number} val - 1–5
 * @returns {string} HTML con la barra
 */
function _reasoningBar(val) {
  const pct  = (val / 5) * 100;
  const color = val >= 4 ? 'var(--ac)' : val >= 3 ? 'var(--am)' : 'var(--rd)';
  return `<div class="reasoning-bar-wrap" title="Razonamiento ${val}/5">
    <div class="reasoning-bar-track">
      <div class="reasoning-bar-fill" style="width:${pct}%;background:${color};"></div>
    </div>
    <span class="reasoning-label">${val}/5</span>
  </div>`;
}

/**
 * Calcula el score global visible (0–100) con pesos declarados:
 * Razonamiento 40% · Costo 35% · Velocidad 25%.
 * Normalización: mejor del grupo = 1.0 (costo: menor es mejor; resto: mayor es mejor).
 * @param {Object} m - modelo enriquecido con { total, reasoning, speedTier }
 * @param {number} maxTotal - costo total máximo del grupo
 * @param {number} minTotal - costo total mínimo del grupo
 * @returns {number} score 0–100
 */
function _calcScore(m, maxTotal, minTotal) {
  const costNorm      = maxTotal > minTotal ? 1 - (m.total - minTotal) / (maxTotal - minTotal) : 1;
  const reasonNorm    = (m.reasoning  || 1) / 5;
  const speedNorm     = ((m.speedTier || 1) - 1) / 2;   // 1→0, 2→0.5, 3→1
  return Math.round((reasonNorm * 0.40 + costNorm * 0.35 + speedNorm * 0.25) * 100);
}

/**
 * Ejecuta el cálculo comparativo enriquecido.
 * Modo 'all':     todos los modelos, ordenación por costo o score.
 * Modo 'bedrock': solo modelos disponibles en Bedrock, filas pareadas Direct/Bedrock.
 */
function calcCompare() {
  const inputTokensPrompt    = parseInt(document.getElementById('c-in').value)    || 200;
  const expectedOutputTokens = parseInt(document.getElementById('c-out').value)   || 500;
  const inputTokensSkill     = parseInt(document.getElementById('c-skill').value) || 0;
  const executionCount       = parseInt(document.getElementById('c-calls').value) || 1000;
  const totalInputTokens     = inputTokensPrompt + inputTokensSkill;

  if (compareState.view === 'bedrock') {
    _calcCompareBedrockView(totalInputTokens, expectedOutputTokens, executionCount);
  } else {
    _calcCompareAllView(totalInputTokens, expectedOutputTokens, executionCount);
  }
}

/** Vista normal — todos los modelos ordenados por costo o score */
function _calcCompareAllView(totalIn, outTok, calls) {
  const rows = MODELS.map(m => {
    const cpc   = (totalIn * m.input / 1e6) + (outTok * m.output / 1e6);
    const total = cpc * calls;
    return { ...m, cpc, total };
  });

  const maxTotal = Math.max(...rows.map(r => r.total));
  const minTotal = Math.min(...rows.map(r => r.total));
  rows.forEach(r => { r.score = _calcScore(r, maxTotal, minTotal); });

  const sorted   = [...rows].sort((a, b) =>
    compareState.sortBy === 'score' ? b.score - a.score : a.total - b.total
  );
  const cheapest  = rows.reduce((a, b) => a.total < b.total ? a : b);
  const bestScore = rows.reduce((a, b) => a.score > b.score ? a : b);

  // Actualizar cabeceras — modo normal (9 columnas sin Canal ni Δ Bedrock)
  document.getElementById('c-thead-row').innerHTML = `
    <th>Modelo</th><th>Proveedor</th><th>Input /1M</th><th>Output /1M</th>
    <th>Costo total</th><th>vs. más barato</th><th>Velocidad</th><th>Razonamiento</th><th>Score</th>`;

  document.getElementById('c-tbody').innerHTML = sorted.map(m => {
    const costRatio  = cheapest.total > 0 ? m.total / cheapest.total : 1;
    const costBarPct = maxTotal > 0 ? Math.round(m.total / maxTotal * 100) : 0;
    const costBadge  = m.id === cheapest.id  ? '<span class="tag-gr" style="margin-left:6px;">más barato</span>' : '';
    const scoreBadge = m.id === bestScore.id && compareState.sortBy === 'score'
                       ? '<span class="tag-ac" style="margin-left:6px;">mejor score</span>' : '';
    return `
      <tr>
        <td><strong>${m.name}</strong>${costBadge}${scoreBadge}</td>
        <td style="color:var(--t2);">${m.provider}</td>
        <td class="mono">$${m.input}</td>
        <td class="mono">$${m.output}</td>
        <td>
          <div class="cost-cell">
            <span class="mono">${formatCurrency(m.total)}</span>
            <div class="cost-bar"><div class="cost-bar-f" style="width:${costBarPct}%;background:${m.color};"></div></div>
          </div>
        </td>
        <td class="mono" style="color:var(--t3);">${costRatio > 1.01 ? costRatio.toFixed(1) + 'x' : '—'}</td>
        <td>${_speedDots(m.speedTier || 1)}</td>
        <td>${_reasoningBar(m.reasoning || 1)}</td>
        <td><span class="score-badge" style="background:${m.score >= 70 ? 'var(--gr2)' : m.score >= 50 ? 'var(--am2)' : 'var(--rd2)'};color:${m.score >= 70 ? 'var(--gr)' : m.score >= 50 ? 'var(--am)' : 'var(--rd)'};">${m.score}</span></td>
      </tr>`;
  }).join('');

  // Guardar rows para que _renderRecommendation() los consuma sin recalcular
  compareState.lastRows = rows;
  _renderRecommendation();
}

/** Vista Bedrock — filas pareadas Direct/Bedrock para modelos disponibles en Bedrock */
function _calcCompareBedrockView(totalIn, outTok, calls) {
  // Solo modelos que tienen entrada en BEDROCK_CATALOG
  const bedrockModels = MODELS.filter(m => BEDROCK_CATALOG.some(b => b.modelId === m.id));

  // Calcular filas Direct y Bedrock para cada modelo
  const pairs = bedrockModels.map(m => {
    const bEntry   = BEDROCK_CATALOG.find(b => b.modelId === m.id);
    const cpcDir   = (totalIn * m.input       / 1e6) + (outTok * m.output       / 1e6);
    const cpcBed   = (totalIn * bEntry.input  / 1e6) + (outTok * bEntry.output  / 1e6);
    const totalDir = cpcDir * calls;
    const totalBed = cpcBed * calls;
    const delta    = totalBed - totalDir;
    const ratio    = totalDir > 0 ? totalBed / totalDir : 1;
    return { m, bEntry, totalDir, totalBed, cpcDir, cpcBed, delta, ratio };
  });

  // Actualizar cabeceras — modo Bedrock (10 columnas con Canal y Δ Bedrock)
  document.getElementById('c-thead-row').innerHTML = `
    <th>Modelo</th><th>Canal</th><th>Proveedor</th><th>Input /1M</th><th>Output /1M</th>
    <th>Costo total</th><th>Δ Bedrock</th><th>Velocidad</th><th>Razonamiento</th>`;

  const maxTotal = Math.max(...pairs.map(p => Math.max(p.totalDir, p.totalBed)));

  document.getElementById('c-tbody').innerHTML = pairs.map(({ m, bEntry, totalDir, totalBed, cpcDir, cpcBed, delta, ratio }) => {
    const barDirPct = maxTotal > 0 ? Math.round(totalDir / maxTotal * 100) : 0;
    const barBedPct = maxTotal > 0 ? Math.round(totalBed / maxTotal * 100) : 0;

    // Columna Δ Bedrock
    const deltaHtml = Math.abs(delta) < 0.001
      ? '<span class="tag-gr">Igual</span>'
      : `<span style="color:var(--rd);font-family:\'Consolas\',\'Courier New\',monospace;font-size:11px;">+${formatCurrency(delta)} (${ratio.toFixed(1)}x)</span>`;

    const rowDir = `
      <tr style="border-bottom:none;">
        <td rowspan="2" style="vertical-align:middle;"><strong>${m.name}</strong></td>
        <td><span class="badge-channel badge-direct">Direct</span></td>
        <td style="color:var(--t2);">${m.provider}</td>
        <td class="mono">$${m.input}</td>
        <td class="mono">$${m.output}</td>
        <td>
          <div class="cost-cell">
            <span class="mono">${formatCurrency(totalDir)}</span>
            <div class="cost-bar"><div class="cost-bar-f" style="width:${barDirPct}%;background:${m.color};"></div></div>
          </div>
        </td>
        <td rowspan="2" style="vertical-align:middle;">${deltaHtml}</td>
        <td rowspan="2" style="vertical-align:middle;">${_speedDots(m.speedTier || 1)}</td>
        <td rowspan="2" style="vertical-align:middle;">${_reasoningBar(m.reasoning || 1)}</td>
      </tr>`;

    const rowBed = `
      <tr style="background:var(--s3);">
        <td><span class="badge-channel badge-bedrock">Bedrock</span></td>
        <td style="color:var(--t2);font-size:10px;">AWS · ${BEDROCK_REGION_REF}</td>
        <td class="mono">$${bEntry.input}</td>
        <td class="mono">$${bEntry.output}</td>
        <td>
          <div class="cost-cell">
            <span class="mono">${formatCurrency(totalBed)}</span>
            <div class="cost-bar"><div class="cost-bar-f" style="width:${barBedPct}%;background:#FF9900;"></div></div>
          </div>
        </td>
      </tr>`;

    return rowDir + rowBed;
  }).join('');

  // Insight automático
  const equal    = pairs.filter(p => Math.abs(p.delta) < 0.001).map(p => p.m.name);
  const higher   = pairs.filter(p => p.delta > 0.001);
  let insight = '';
  if (equal.length)  insight += `<strong>${equal.join(' y ')}</strong> tienen el mismo costo en Direct API y AWS Bedrock para esta carga. `;
  if (higher.length) insight += higher.map(p =>
    `<strong>${p.m.name}</strong> tiene un sobrecosto de <span style="color:var(--rd);">+${formatCurrency(p.delta)} (${p.ratio.toFixed(1)}x)</span> vía Bedrock.`
  ).join(' ');
  document.getElementById('c-bedrock-insight-text').innerHTML = insight;
}

/* ==========================================================================
   Recomendador de Modelo para Iniciativas IA
   ========================================================================== */

/**
 * Controlador del selector de tipo de iniciativa.
 * Actualiza compareState.initiative y re-renderiza la sección de recomendación.
 * NO recalcula la tabla — solo actualiza la sección nueva.
 * @param {string} id - id del tipo en INITIATIVE_TYPES
 */
function setInitiativeType(id) {
  compareState.initiative = compareState.initiative === id ? null : id;
  // Actualizar pills activas
  document.querySelectorAll('#c-initiative-pills .pill').forEach(p => {
    p.classList.toggle('active', p.dataset.initiative === compareState.initiative);
  });
  _renderRecommendation();
}

/**
 * Normaliza los pesos de un tipo de iniciativa a fracciones que suman exactamente 1.0.
 * Fuente única — usada por _calcInitiativeScore() y por la barra de pesos en _renderRecommendation().
 * DT-12 fix: elimina el cálculo duplicado de wSum en la barra de transparencia.
 * @param {Object} weights - { cost, reasoning, speed, context? }
 * @returns {Object} pesos normalizados { cost, reasoning, speed, context }
 */
function _normalizeWeights(weights) {
  const sum = (weights.cost||0) + (weights.reasoning||0) + (weights.speed||0) + (weights.context||0) || 1;
  return {
    cost:      (weights.cost      || 0) / sum,
    reasoning: (weights.reasoning || 0) / sum,
    speed:     (weights.speed     || 0) / sum,
    context:   (weights.context   || 0) / sum
  };
}

/**
 * Calcula el score ajustado de un modelo según los pesos del tipo de iniciativa.
 * Reutiliza la misma lógica de normalización que _calcScore() — sin duplicar la fórmula.
 * Los pesos se normalizan a través de _normalizeWeights() — fuente única de normalización.
 * @param {Object} m          - modelo con { total, reasoning, speedTier, contextWindow }
 * @param {Object} weights    - { cost, reasoning, speed, context } — pesos del tipo de iniciativa
 * @param {number} maxTotal
 * @param {number} minTotal
 * @param {number} maxContext - ventana de contexto máxima del grupo (default 0)
 * @param {number} minContext - ventana de contexto mínima del grupo (default 0)
 * @returns {number} score ajustado 0–100
 */
function _calcInitiativeScore(m, weights, maxTotal, minTotal, maxContext = 0, minContext = 0) {
  const nw         = _normalizeWeights(weights);
  const wCost      = nw.cost;
  const wReasoning = nw.reasoning;
  const wSpeed     = nw.speed;
  const wContext   = nw.context;

  const costNorm    = maxTotal   > minTotal   ? 1 - (m.total          - minTotal)   / (maxTotal   - minTotal)   : 1;
  const reasonNorm  = (m.reasoning  || 1) / 5;
  const speedNorm   = ((m.speedTier || 1) - 1) / 2;
  // contextNorm: lineal — 0 para contexto mínimo del grupo, 1 para el máximo
  // Math.max(0, ...) evita valores negativos si contextWindow < minContext
  // (posible al agregar modelos con contexto menor al mínimo actual del grupo)
  // Si todos tienen el mismo contexto → factor neutro (0), no penaliza ni beneficia
  const contextNorm = maxContext > minContext
    ? Math.max(0, ((m.contextWindow || 0) - minContext) / (maxContext - minContext))
    : 0;

  return Math.round((
    reasonNorm  * wReasoning +
    costNorm    * wCost      +
    speedNorm   * wSpeed     +
    contextNorm * wContext
  ) * 100);
}

/**
 * Determina el texto de riesgo específico para un modelo dentro de un tipo de iniciativa.
 * Extraída de _renderRecommendation() para seguir el patrón de funciones de módulo con prefijo _.
 * DT-08 fix: usa m.total (no m.cost que no existe en lastRows).
 * @param {Object} m           - modelo enriquecido con { total, reasoning }
 * @param {Object} recommended - modelo recomendado (para comparar costo relativo)
 * @param {Object} type        - tipo de iniciativa (para riesgo genérico)
 * @returns {string} texto de riesgo
 */
function _riskForModel(m, recommended, type) {
  if (m.reasoning <= 2) return 'Razonamiento básico — validar exhaustivamente antes de producción.';
  if (m.reasoning === 3) return 'Razonamiento medio — adecuado para casos estructurados, revisar casos ambiguos.';
  if (m.total > recommended.total * 3) return 'Costo significativamente mayor — justificar con requerimientos específicos de precisión.';
  return type.risk;
}

/**
 * Renderiza la sección completa de recomendación para la iniciativa seleccionada.
 * Consume compareState.lastRows — sin recalcular costos.
 * Si no hay tipo seleccionado o no hay rows, muestra el estado inicial.
 */
function _renderRecommendation() {
  const container = document.getElementById('c-recommendation-content');
  if (!container) return;

  // Estado inicial — sin tipo seleccionado
  if (!compareState.initiative) {
    container.innerHTML = `
      <div style="padding:1.5rem;text-align:center;color:var(--t3);background:var(--s2);border:1px solid var(--b1);border-radius:var(--r2);">
        <div style="font-size:24px;margin-bottom:8px;">🎯</div>
        <div style="font-size:13px;font-weight:600;color:var(--t2);">Selecciona el tipo de iniciativa</div>
        <div style="font-size:11px;margin-top:4px;">La recomendación se generará automáticamente con los parámetros actuales.</div>
      </div>`;
    return;
  }

  // Sin datos de la tabla aún
  if (!compareState.lastRows || !compareState.lastRows.length) {
    container.innerHTML = `<div style="padding:1rem;font-size:12px;color:var(--t3);">Configura los parámetros de la comparativa para ver la recomendación.</div>`;
    return;
  }

  const type   = INITIATIVE_TYPES.find(t => t.id === compareState.initiative);
  if (!type) return;

  const rows   = compareState.lastRows;
  const maxT   = Math.max(...rows.map(r => r.total));
  const minT   = Math.min(...rows.map(r => r.total));
  // Rango de contexto — calculado una sola vez para toda la sesión de scoring
  const maxCtx = Math.max(...rows.map(r => r.contextWindow || 0));
  const minCtx = Math.min(...rows.map(r => r.contextWindow || 0));

  // Calcular score ajustado para cada modelo
  // Desempate: mayor adjScore → menor costo → orden original de MODELS[] (determinista)
  const scored = rows.map(m => ({
    ...m,
    adjScore: _calcInitiativeScore(m, type.weights, maxT, minT, maxCtx, minCtx)
  })).sort((a, b) => b.adjScore - a.adjScore || a.total - b.total);

  const recommended   = scored[0];
  const calls         = parseInt(document.getElementById('c-calls').value) || 1000;
  const annualCostFmt = formatCurrency(recommended.total * 12);

  // Nivel de razonamiento para justificación
  const reasonLevel = recommended.reasoning >= 4 ? 'high' : recommended.reasoning >= 3 ? 'medium' : 'low';
  const justText    = type.justification[reasonLevel]
    .replace('X/5', `${recommended.reasoning}/5`);

  // Alternativa de calidad — mejor modelo de un PROVEEDOR DISTINTO al recomendado
  // Ordena por adjScore del tipo activo → varía con los parámetros del usuario
  // Desempate: mayor reasoning → menor costo
  // Garantiza diversidad de proveedor y sensibilidad a los parámetros de la iniciativa
  const altQuality = scored
    .filter(m => m.provider !== recommended.provider)
    .sort((a, b) => b.adjScore - a.adjScore || b.reasoning - a.reasoning || a.total - b.total)[0];

  // Alternativa de costo — más barata de un proveedor distinto al recomendado Y distinto a altQuality
  // Si altQuality ya es el más barato de su proveedor, busca en un tercero
  const altQualityProvider = altQuality?.provider;
  const altCost = scored
    .filter(m =>
      m.provider !== recommended.provider &&
      m.provider !== altQualityProvider &&
      m.total < recommended.total
    )
    .sort((a, b) => a.total - b.total)[0]
    // Fallback: si no hay tercer proveedor, el más barato distinto al recomendado y altQuality
    || scored
    .filter(m => m.id !== recommended.id && m.id !== altQuality?.id && m.total < recommended.total)
    .sort((a, b) => a.total - b.total)[0];

  // Top 4 modelos para tabla de riesgos (por adjScore descendente)
  const riskModels = scored.slice(0, 4);

  // ── Render ─────────────────────────────────────────────────────────────

  // Tarjeta principal
  const mainCard = `
    <div class="rec-card">
      <div class="rec-card-header">
        <div>
          <span class="rec-badge-recommended">✅ Recomendado</span>
          <span class="rec-model-name">${recommended.name}</span>
          <span style="font-size:11px;color:var(--t3);">${recommended.provider} · ${recommended.tier}</span>
        </div>
        <div class="rec-score-box">
          <div style="font-size:10px;color:var(--t3);margin-bottom:2px;">Score ajustado</div>
          <div style="font-size:22px;font-weight:700;color:var(--ac);">${recommended.adjScore}</div>
        </div>
      </div>
      <div class="rec-section-label">Justificación</div>
      <div class="rec-justification">${justText}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px;">
        <div class="rec-cost-block">
          <div class="rec-section-label">Costo anual estimado</div>
          <div class="rec-cost-annual">${annualCostFmt}</div>
          <div style="font-size:10px;color:var(--t3);margin-top:2px;">Basado en ${formatNumber(calls)} llamadas/mes × 12 meses</div>
        </div>
        <div class="rec-risk-box">
          <div class="rec-section-label" style="color:var(--am);">⚠️ Riesgo principal</div>
          <div style="font-size:11px;color:var(--t1);line-height:1.5;">${type.risk}</div>
        </div>
      </div>
    </div>`;

  // Tabla alternativas — proveedores distintos al recomendado para diversidad de ecosistema
  const altRows = [
    altQuality ? `<tr>
      <td>
        <strong>${altQuality.name}</strong>
        <span style="font-size:10px;color:var(--t3);margin-left:5px;">${altQuality.provider}</span>
      </td>
      <td style="font-size:11px;color:var(--t2);">${type.altQualityReason}</td>
      <td class="mono">${formatCurrency(altQuality.total * 12)}</td>
      <td class="mono" style="color:var(--am);">${altQuality.total > recommended.total ? '+' + (altQuality.total / recommended.total).toFixed(1) + 'x' : '≈ igual'}</td>
    </tr>` : '',
    altCost ? `<tr>
      <td>
        <strong>${altCost.name}</strong>
        <span style="font-size:10px;color:var(--t3);margin-left:5px;">${altCost.provider}</span>
      </td>
      <td style="font-size:11px;color:var(--t2);">${type.altCostReason}</td>
      <td class="mono">${formatCurrency(altCost.total * 12)}</td>
      <td class="mono" style="color:var(--gr);">-${((1 - altCost.total / recommended.total) * 100).toFixed(0)}%</td>
    </tr>` : ''
  ].filter(Boolean).join('');

  const altTable = altRows ? `
    <div class="rec-section-label" style="margin:16px 0 8px;">Alternativas — otros proveedores</div>
    <table class="rec-table">
      <thead><tr><th>Modelo</th><th>Cuándo usarlo</th><th>Costo anual</th><th>Δ costo</th></tr></thead>
      <tbody>${altRows}</tbody>
    </table>` : '';

  // Tabla riesgos
  const riskRows = riskModels.map(m => `
    <tr>
      <td><strong>${m.name}</strong>${m.id === recommended.id ? ' <span class="tag-gr">recomendado</span>' : ''}</td>
      <td style="font-size:11px;color:var(--t2);">${_riskForModel(m, recommended, type)}</td>
    </tr>`).join('');

  const riskTable = `
    <div class="rec-section-label" style="margin:16px 0 8px;">Riesgos por modelo</div>
    <table class="rec-table">
      <thead><tr><th>Modelo</th><th>Riesgo para esta iniciativa</th></tr></thead>
      <tbody>${riskRows}</tbody>
    </table>`;

  // Transparencia de pesos
  // Barra de transparencia — reutiliza _normalizeWeights() para garantizar
  // consistencia con los pesos usados en _calcInitiativeScore() (DT-12 fix)
  const nw = _normalizeWeights(type.weights);
  const pct = v => Math.round(v * 100);
  const weightsBar = `
    <div class="rec-weights-bar">
      <span style="font-size:10px;color:var(--t3);">Pesos aplicados para <strong>${type.label}</strong>:</span>
      <span>Costo <strong>${pct(nw.cost)}%</strong></span>
      <span>·</span>
      <span>Razonamiento <strong>${pct(nw.reasoning)}%</strong></span>
      <span>·</span>
      <span>Velocidad <strong>${pct(nw.speed)}%</strong></span>
      ${nw.context > 0 ? `<span>·</span><span>Contexto <strong>${pct(nw.context)}%</strong></span>` : ''}
    </div>`;

  container.innerHTML = mainCard + altTable + riskTable + weightsBar;
}

/**
 * Inicializa los pills de tipo de iniciativa en el DOM.
 * Llamado una sola vez al cargar la app.
 */
function _initInitiativePills() {
  const container = document.getElementById('c-initiative-pills');
  if (!container) return;
  container.innerHTML = INITIATIVE_TYPES.map(t =>
    `<button class="pill" data-initiative="${t.id}" onclick="setInitiativeType('${t.id}')">${t.icon} ${t.label}</button>`
  ).join('');
}

/**
 * Sincroniza de forma instantánea todos los parámetros numéricos y textuales ingresados
 * en la pestaña de Prompt Único hacia los inputs correspondientes de la Comparativa de modelos.
 * Soporta ambos modos de entrada: texto libre y cantidad exacta de tokens.
 */
function syncCompare() {
  // Lee tokens de entrada según el modo activo en Prompt único
  let inputTokens;
  if (appState.single.inputMode === 'tokens') {
    inputTokens = parseInt(document.getElementById('s-input-tok').value) || 0;
  } else {
    inputTokens = calculateTokens(document.getElementById('s-input').value) || 0;
  }

  document.getElementById('c-in').value    = inputTokens || 200;
  document.getElementById('c-out').value   = document.getElementById('s-out').value;
  document.getElementById('c-skill').value = getSkillsTokenCount('single');
  document.getElementById('c-calls').value = document.getElementById('s-calls').value;

  calcCompare();
  switchTab('compare');
}

/* ==========================================================================
   Cálculo de Prompt Caching — Conversaciones Multiturn con Caché de Skill e Historial
   ========================================================================== */

/**
 * Motor de cálculo para la simulación de Prompt Caching en conversaciones multi-turno.
 *
 * Lógica por turno:
 *   Entrada total  = skill + historial acumulado (prompts + respuestas anteriores) + prompt nuevo
 *   Cache write    = tokens que se guardan en caché por primera vez en ese turno
 *   Cache read     = tokens que se leen del caché (ya cacheados en turnos anteriores)
 *   Input normal   = tokens que no tienen caché (solo el prompt nuevo del turno actual)
 *
 * El skill se cachea desde el turno 1 si la opción está activada.
 * El historial acumulado se cachea turno a turno si la opción está activada.
 */
function calcCache() {
  const model = MODELS.find(m => m.id === appState.cache.modelId);
  if (!model) {
    console.error(`[calcCache] Modelo no encontrado — modelId: "${appState.cache.modelId}".`);
    document.getElementById('cc-metrics').innerHTML =
      `<div class="empty" style="grid-column:1/-1;">
        <div class="empty-icon">⚠️</div>
        <div class="empty-text">Modelo no disponible</div>
        <div class="empty-hint">El modelo seleccionado no se encontró. Selecciona otro modelo para continuar.</div>
      </div>`;
    return;
  }

  const skillTok        = parseInt(document.getElementById('cc-skill-tok').value)    || 0;
  const promptTok       = parseInt(document.getElementById('cc-prompt-tok').value)   || 200;
  const respTok         = parseInt(document.getElementById('cc-resp-tok').value)     || 500;
  const turns           = Math.max(1, parseInt(document.getElementById('cc-turns').value) || 8);
  const convos          = parseInt(document.getElementById('cc-convos').value)        || 500;
  const periodDays      = parseInt(document.getElementById('cc-period').value)        || 30;
  const skillCached     = document.getElementById('cc-skill-cache').value === '1';
  const histCached      = document.getElementById('cc-hist-cache').value  === '1';
  const periodLabel     = getPeriodLabel(periodDays);

  // Tarifas efectivas según el modelo seleccionado
  const rateInput      = model.input;
  const rateOutput     = model.output;
  const rateCacheWrite = model.cacheWrite !== null ? model.cacheWrite : model.input;
  const rateCacheRead  = model.cacheRead  !== null ? model.cacheRead  : model.input;
  const cacheSupported = model.cacheRead  !== null;

  // ── Simular turno a turno ──────────────────────────────────────────────
  const turnRows = [];
  let totalCostWithCache    = 0;
  let totalCostWithoutCache = 0;

  for (let t = 1; t <= turns; t++) {
    // Historial acumulado = todos los turnos anteriores (prompt + respuesta)
    const histTok = (t - 1) * (promptTok + respTok);

    let cacheReadTok   = 0;
    let cacheWriteTok  = 0;
    let normalInputTok = 0;

    if (!cacheSupported) {
      // Modelo sin soporte de caché: todo es input normal
      normalInputTok = skillTok + histTok + promptTok;

    } else {
      // ── Skill ──────────────────────────────────────────────────────────
      // Si el skill se cachea:
      //   T1 → cache write (primera vez que se graba en caché)
      //   T2+ → cache read (ya está guardado, se lee barato)
      // Si NO se cachea → siempre input normal
      if (skillCached) {
        if (t === 1) cacheWriteTok += skillTok;
        else         cacheReadTok  += skillTok;
      } else {
        normalInputTok += skillTok;
      }

      // ── Historial acumulado ────────────────────────────────────────────
      // Si el historial se cachea:
      //   El bloque de historial del turno anterior fue escrito al caché en ese turno.
      //   Ahora se lee completo como cache read.
      // Si NO se cachea → se re-envía completo como input normal
      if (histTok > 0) {
        if (histCached) cacheReadTok  += histTok;
        else            normalInputTok += histTok;
      }

      // ── Prompt nuevo del turno actual ──────────────────────────────────
      // El prompt nuevo siempre es contenido fresco → input normal
      normalInputTok += promptTok;

      // ── Cache write del historial para el PRÓXIMO turno ────────────────
      // Si el historial se cachea, el bloque (prompt actual + respuesta actual)
      // debe escribirse al caché ahora para que el turno siguiente lo lea.
      // Solo aplica si hay un turno siguiente.
      if (histCached && t < turns) {
        cacheWriteTok += promptTok + respTok;
      }
    }

    const totalEntrada = skillTok + histTok + promptTok;

    // ── Costos desagregados por tarifa ─────────────────────────────────
    const costCacheWrite  = cacheWriteTok  * rateCacheWrite  / 1e6;
    const costCacheRead   = cacheReadTok   * rateCacheRead   / 1e6;
    const costNormalInput = normalInputTok * rateInput       / 1e6;
    const costOutput      = respTok        * rateOutput      / 1e6;
    const costTurnWith    = costCacheWrite + costCacheRead + costNormalInput + costOutput;

    // Costo base sin caché: todo el input a tarifa normal
    const costTurnWithout = (totalEntrada * rateInput / 1e6) + costOutput;

    totalCostWithCache    += costTurnWith;
    totalCostWithoutCache += costTurnWithout;

    turnRows.push({
      t, skillTok, histTok, promptTok, totalEntrada,
      cacheWriteTok, cacheReadTok, normalInputTok, respTok,
      costCacheWrite, costCacheRead, costNormalInput, costOutput,
      costTurnWith, costTurnWithout
    });
  }

  // ── Totales ────────────────────────────────────────────────────────────
  const savingPerConvo     = totalCostWithoutCache - totalCostWithCache;
  const savingPct          = totalCostWithoutCache > 0
    ? (savingPerConvo / totalCostWithoutCache * 100).toFixed(1) : 0;
  const totalWithPeriod    = totalCostWithCache    * convos;
  const totalWithoutPeriod = totalCostWithoutCache * convos;
  const totalSavingPeriod  = totalWithoutPeriod - totalWithPeriod;

  // ── Métricas superiores ────────────────────────────────────────────────
  document.getElementById('cc-convos-label').textContent =
    `${formatNumber(convos)} conversaciones / ${periodLabel}`;

  document.getElementById('cc-metrics').innerHTML = `
    <div class="met">
      <div class="met-lbl">Costo / conversación SIN caché</div>
      <div class="met-val" style="color:var(--rd);">${formatCurrency(totalCostWithoutCache)}</div>
      <div class="met-sub">${turns} turnos · $${rateInput}/1M input</div>
    </div>
    <div class="met hl">
      <div class="met-lbl">Costo / conversación CON caché</div>
      <div class="met-val">${formatCurrency(totalCostWithCache)}</div>
      <div class="met-sub">write $${rateCacheWrite}/1M · read $${rateCacheRead}/1M</div>
    </div>
    <div class="met gr">
      <div class="met-lbl">Ahorro / conversación</div>
      <div class="met-val">${formatCurrency(savingPerConvo)}</div>
      <div class="met-sub">${savingPct}% de reducción</div>
    </div>
    <div class="met gr">
      <div class="met-lbl">Ahorro / ${periodLabel}</div>
      <div class="met-val">${formatCurrency(totalSavingPeriod)}</div>
      <div class="met-sub">${formatNumber(convos)} conversaciones</div>
    </div>`;

  // ── Barra visual de ahorro ─────────────────────────────────────────────
  const savingBarW  = Math.min(100, parseFloat(savingPct));
  const savingColor = savingBarW > 50 ? 'var(--gr)' : savingBarW > 20 ? 'var(--am)' : 'var(--rd)';
  document.getElementById('cc-savings-bar').innerHTML = cacheSupported ? `
    <div style="background:var(--s2);border:1px solid var(--b1);border-radius:var(--r2);padding:1rem 1.25rem;">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--t3);margin-bottom:8px;">
        <span>Reducción de costo con caché activo — <strong style="color:var(--t2);">${model.name}</strong></span>
        <span style="color:${savingColor};font-weight:600;">${savingPct}%</span>
      </div>
      <div style="height:8px;background:var(--s4);border-radius:999px;overflow:hidden;">
        <div style="width:${savingBarW}%;height:100%;background:${savingColor};border-radius:999px;transition:width 0.4s;"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--t3);margin-top:6px;font-family:'Consolas','Courier New',monospace;">
        <span>Sin caché: ${formatCurrency(totalCostWithoutCache)}/conv (input $${rateInput}/1M)</span>
        <span>Con caché: ${formatCurrency(totalCostWithCache)}/conv (read $${rateCacheRead}/1M)</span>
      </div>
    </div>` :
    `<div style="padding:10px 14px;background:var(--rd2);border:1px solid rgba(255,107,107,0.3);border-radius:var(--r2);font-size:12px;color:var(--rd);">
      ⚠ El modelo <strong>${model.name}</strong> no soporta Prompt Caching. Se muestra el costo sin caché como referencia.
    </div>`;

  // ── Tabla turno a turno con costos desagregados ────────────────────────
  // La tabla ahora muestra dos filas por turno:
  //   Fila 1 (tokens): cantidad de tokens en cada categoría
  //   Fila 2 (costos): costo en USD de cada categoría según tarifa del modelo
  const maxTurnCost = Math.max(...turnRows.map(r => r.costTurnWith));

  document.getElementById('cc-turn-tbody').innerHTML = turnRows.map(r => {
    const barW   = maxTurnCost > 0 ? Math.round(r.costTurnWith / maxTurnCost * 100) : 0;
    const saving = r.costTurnWithout - r.costTurnWith;
    const savingSign = saving >= 0 ? '-' : '+';
    const savingColor = saving >= 0 ? 'var(--gr)' : 'var(--rd)';

    return `
      <!-- Fila de tokens -->
      <tr style="border-bottom:none;">
        <td rowspan="2" class="mono" style="color:var(--t3);vertical-align:middle;font-weight:600;">T${r.t}</td>
        <td class="mono">${formatNumber(r.skillTok)}</td>
        <td class="mono" style="color:var(--t2);">${formatNumber(r.histTok)}</td>
        <td class="mono">${formatNumber(r.promptTok)}</td>
        <td class="mono"><strong>${formatNumber(r.totalEntrada)}</strong></td>
        <td class="mono" style="color:var(--am);">${r.cacheWriteTok  > 0 ? formatNumber(r.cacheWriteTok)  : '—'}</td>
        <td class="mono" style="color:var(--gr);">${r.cacheReadTok   > 0 ? formatNumber(r.cacheReadTok)   : '—'}</td>
        <td class="mono">${formatNumber(r.normalInputTok)}</td>
        <td class="mono">${formatNumber(r.respTok)}</td>
        <td rowspan="2" style="vertical-align:middle;">
          <div class="cost-cell">
            <span class="mono" style="color:var(--ac);">${formatCurrency(r.costTurnWith)}</span>
            <div class="cost-bar"><div class="cost-bar-f" style="width:${barW}%;"></div></div>
          </div>
        </td>
        <td rowspan="2" class="mono" style="color:var(--t3);vertical-align:middle;">${formatCurrency(r.costTurnWithout)}</td>
        <td rowspan="2" style="vertical-align:middle;font-size:11px;color:${savingColor};font-family:'Consolas','Courier New',monospace;">${savingSign}${formatCurrency(Math.abs(saving))}</td>
      </tr>
      <!-- Fila de costos por tarifa -->
      <tr style="background:var(--s1);">
        <td colspan="2" style="font-size:10px;color:var(--t3);padding:3px 12px;font-family:'Consolas','Courier New',monospace;">
          $${rateCacheWrite}/1M write · $${rateCacheRead}/1M read · $${rateInput}/1M normal
        </td>
        <td class="mono" style="font-size:10px;color:var(--t3);">—</td>
        <td class="mono" style="font-size:10px;color:var(--t3);">${formatCurrency(r.costNormalInput + r.costCacheWrite + r.costCacheRead)}</td>
        <td class="mono" style="font-size:10px;color:var(--am);">${r.costCacheWrite  > 0 ? formatCurrency(r.costCacheWrite)  : '—'}</td>
        <td class="mono" style="font-size:10px;color:var(--gr);">${r.costCacheRead   > 0 ? formatCurrency(r.costCacheRead)   : '—'}</td>
        <td class="mono" style="font-size:10px;color:var(--t2);">${formatCurrency(r.costNormalInput)}</td>
        <td class="mono" style="font-size:10px;color:var(--t3);">${formatCurrency(r.costOutput)}</td>
      </tr>`;
  }).join('');

  document.getElementById('cc-turn-tfoot').innerHTML = `
    <tr style="font-weight:700;border-top:2px solid var(--b2);">
      <td colspan="9" style="padding:8px 12px;color:var(--t2);">Total por conversación</td>
      <td style="padding:8px 12px;font-family:'Consolas','Courier New',monospace;color:var(--ac);">${formatCurrency(totalCostWithCache)}</td>
      <td style="padding:8px 12px;font-family:'Consolas','Courier New',monospace;color:var(--t3);">${formatCurrency(totalCostWithoutCache)}</td>
      <td style="padding:8px 12px;font-family:'Consolas','Courier New',monospace;color:var(--gr);">-${formatCurrency(savingPerConvo)}</td>
    </tr>`;

  // ── Tarjetas comparativas por período ─────────────────────────────────
  document.getElementById('cc-costbd').innerHTML = `
    <div class="bd-card">
      <div class="bd-title">Sin caché — ${periodLabel}</div>
      <div class="bd-row"><span>Costo / conversación</span><span class="bd-val" style="color:var(--rd);">${formatCurrency(totalCostWithoutCache)}</span></div>
      <div class="bd-row"><span>${formatNumber(convos)} conversaciones</span><span class="bd-val" style="color:var(--rd);">${formatCurrency(totalWithoutPeriod)}</span></div>
      <div class="bd-row"><span>Proyección anual</span><span class="bd-val">${formatCurrency(totalWithoutPeriod / periodDays * 365)}</span></div>
    </div>
    <div class="bd-card">
      <div class="bd-title">Con caché — ${periodLabel}</div>
      <div class="bd-row"><span>Costo / conversación</span><span class="bd-val" style="color:var(--gr);">${formatCurrency(totalCostWithCache)}</span></div>
      <div class="bd-row"><span>${formatNumber(convos)} conversaciones</span><span class="bd-val" style="color:var(--gr);">${formatCurrency(totalWithPeriod)}</span></div>
      <div class="bd-row"><span>Proyección anual</span><span class="bd-val">${formatCurrency(totalWithPeriod / periodDays * 365)}</span></div>
    </div>
    <div class="bd-card">
      <div class="bd-title">Ahorro total — ${periodLabel}</div>
      <div class="bd-row"><span>Ahorro / conversación</span><span class="bd-val" style="color:var(--gr);">${formatCurrency(savingPerConvo)}</span></div>
      <div class="bd-row"><span>Ahorro ${periodLabel}</span><span class="bd-val" style="color:var(--gr);">${formatCurrency(totalSavingPeriod)}</span></div>
      <div class="bd-row"><span>Ahorro anual estimado</span><span class="bd-val" style="color:var(--gr);">${formatCurrency(totalSavingPeriod / periodDays * 365)}</span></div>
    </div>`;
}

/* ==========================================================================
   Módulo Bizagi BPU — Motor de Cálculo e Interfaz
   ========================================================================== */

/**
 * Cambia entre modelo de precios Legacy y 2026+.
 * Muestra/oculta los campos correspondientes y recalcula.
 * @param {string} model - 'legacy' | '2026'
 */
function switchBizagiModel(model) {
  appState.bizagi.pricingModel = model;

  document.getElementById('bz-btn-legacy').classList.toggle('active', model === 'legacy');
  document.getElementById('bz-btn-2026').classList.toggle('active',  model === '2026');
  document.getElementById('bz-legacy-fields').style.display = model === 'legacy' ? '' : 'none';
  document.getElementById('bz-2026-fields').style.display   = model === '2026'   ? '' : 'none';

  // Info box con descripción del modelo activo
  const infoEl = document.getElementById('bz-model-info');
  if (model === 'legacy') {
    infoEl.innerHTML =
      `Modelo pre-2026: <span style="color:var(--t1);">prompts + steps comparten el mismo pool de BPUs</span><br>` +
      `1 BPU = <span style="color:var(--am);">2,500 prompts</span> ó <span style="color:var(--am);">10,000 steps</span><br>` +
      `Precio: <span style="color:var(--gr);">$${BIZAGI_PRICING.pricePerBPU} USD / BPU</span>`;
  } else {
    infoEl.innerHTML =
      `Modelo 2026+: <span style="color:var(--t1);">AI BPUs y Automation BPUs son pools independientes</span><br>` +
      `1 AI BPU = <span style="color:var(--ac);">50,000,000 tokens</span> (input + output)<br>` +
      `1 Auto BPU = <span style="color:var(--ac);">10,000 steps</span> &nbsp;·&nbsp; Precio: <span style="color:var(--gr);">$${BIZAGI_PRICING.pricePerBPU} USD / BPU</span>`;
  }

  calcBizagi();
}

/**
 * Renderiza el selector de acciones IA de Bizagi.
 */
function renderBizagiActions() {
  const categories = [...new Set(BIZAGI_ACTIONS.map(a => a.category))];
  let html = '';
  categories.forEach(cat => {
    BIZAGI_ACTIONS.filter(a => a.category === cat).forEach(a => {
      const sel = a.id === appState.bizagi.actionId ? 'sel' : '';
      const catClass = _bizagiCatClass(cat);
      html += `
        <div class="mitem ${sel}" onclick="selBizagiAction('${a.id}')">
          <div class="mitem-top">
            <span class="mitem-name">${a.name}</span>
            <span class="tbadge ${catClass}">${cat}</span>
          </div>
        </div>`;
    });
  });
  document.getElementById('bz-action-list').innerHTML = html;
}

/**
 * Selecciona una acción IA de Bizagi y recalcula.
 * @param {string} id - ID de la acción
 */
function selBizagiAction(id) {
  appState.bizagi.actionId = id;
  renderBizagiActions();
  calcBizagi();
}

/**
 * Devuelve la clase CSS de badge para cada categoría Bizagi.
 * @param {string} cat
 * @returns {string}
 */
function _bizagiCatClass(cat) {
  const map = {
    'Document AI':     'tb-f',
    'Machine Learning':'tb-b',
    'Generative AI':   'tb-p',
    'Custom':          'tb-s'
  };
  return map[cat] || 'tb-b';
}

/**
 * Motor principal de cálculo Bizagi BPU.
 * Lee los inputs del DOM, aplica las fórmulas del modelo activo
 * y renderiza métricas, desglose y proyecciones.
 */
function calcBizagi() {
  const model      = appState.bizagi.pricingModel;
  const periodDays = parseInt(document.getElementById('bz-period').value) || 365;
  const period     = getPeriodLabel(periodDays);
  const price      = BIZAGI_PRICING.pricePerBPU;

  const result = model === 'legacy'
    ? _calcBizagiLegacy(periodDays, price)
    : _calcBizagi2026(periodDays, price);

  // Sincroniza appState con los valores calculados — fuente de verdad para el builder
  appState.bizagi.lastResult  = result;
  appState.bizagi.periodDays  = periodDays;

  _renderBizagiMetrics(result, period);
  _renderBizagiBreakdown(result, period, periodDays);
  _renderBizagiCapacity(result, model);
  _renderBizagiProjections(result, periodDays);
}

/**
 * Fórmulas Legacy: prompts + steps comparten el mismo pool de BPUs.
 */
function _calcBizagiLegacy(periodDays, price) {
  const prompts = Math.max(0, parseInt(document.getElementById('bz-prompts').value)    || 0);
  const steps   = Math.max(0, parseInt(document.getElementById('bz-steps-legacy').value) || 0);

  const promptBPUs = Math.ceil(prompts / BIZAGI_LEGACY.promptsPerBPU);
  const stepBPUs   = Math.ceil(steps   / BIZAGI_LEGACY.stepsPerBPU);
  const totalBPUs  = promptBPUs + stepBPUs;
  const totalCost  = totalBPUs * price;

  // BPU parcial — capacidad restante sin costo adicional
  const promptRemainder = prompts > 0 ? BIZAGI_LEGACY.promptsPerBPU - (prompts % BIZAGI_LEGACY.promptsPerBPU || BIZAGI_LEGACY.promptsPerBPU) : 0;
  const stepRemainder   = steps   > 0 ? BIZAGI_LEGACY.stepsPerBPU   - (steps   % BIZAGI_LEGACY.stepsPerBPU   || BIZAGI_LEGACY.stepsPerBPU)   : 0;
  const promptUsagePct  = prompts > 0 ? Math.min(100, Math.round((prompts % BIZAGI_LEGACY.promptsPerBPU || BIZAGI_LEGACY.promptsPerBPU) / BIZAGI_LEGACY.promptsPerBPU * 100)) : 0;

  return {
    model: 'legacy', prompts, steps, promptBPUs, stepBPUs, totalBPUs, totalCost, price,
    promptRemainder, stepRemainder, promptUsagePct,
    periodDays
  };
}

/**
 * Fórmulas 2026+: AI BPUs y Automation BPUs son pools independientes.
 */
function _calcBizagi2026(periodDays, price) {
  const aiTokens  = Math.max(0, parseInt(document.getElementById('bz-ai-tokens').value)   || 0);
  const autoSteps = Math.max(0, parseInt(document.getElementById('bz-auto-steps').value)   || 0);

  const aiBPUs    = Math.ceil(aiTokens  / BIZAGI_2026.tokensPerAiBPU);
  const autoBPUs  = Math.ceil(autoSteps / BIZAGI_2026.stepsPerAutomationBPU);
  const aiCost    = aiBPUs   * price;
  const autoCost  = autoBPUs * price;
  const totalCost = aiCost + autoCost;
  const totalBPUs = aiBPUs + autoBPUs;

  const aiUsagePct = aiTokens > 0
    ? Math.min(100, Math.round((aiTokens % BIZAGI_2026.tokensPerAiBPU || BIZAGI_2026.tokensPerAiBPU) / BIZAGI_2026.tokensPerAiBPU * 100))
    : 0;
  const aiRemainder = aiTokens > 0
    ? BIZAGI_2026.tokensPerAiBPU - (aiTokens % BIZAGI_2026.tokensPerAiBPU || BIZAGI_2026.tokensPerAiBPU)
    : 0;

  return {
    model: '2026', aiTokens, autoSteps, aiBPUs, autoBPUs, totalBPUs,
    aiCost, autoCost, totalCost, price,
    aiUsagePct, aiRemainder,
    periodDays
  };
}

/** Renderiza las 4 tarjetas de métricas superiores */
function _renderBizagiMetrics(r, period) {
  const el = document.getElementById('bz-metrics');
  if (r.model === 'legacy') {
    el.innerHTML = `
      <div class="met">
        <div class="met-lbl">BPUs Prompts</div>
        <div class="met-val">${r.promptBPUs}</div>
        <div class="met-sub">${formatNumber(r.prompts)} prompts</div>
      </div>
      <div class="met">
        <div class="met-lbl">BPUs Steps</div>
        <div class="met-val">${r.stepBPUs}</div>
        <div class="met-sub">${formatNumber(r.steps)} steps</div>
      </div>
      <div class="met hl">
        <div class="met-lbl">Total BPUs</div>
        <div class="met-val">${r.totalBPUs}</div>
        <div class="met-sub">$${r.price} USD / BPU</div>
      </div>
      <div class="met gr">
        <div class="met-lbl">Costo / ${period}</div>
        <div class="met-val">${formatCurrency(r.totalCost)}</div>
        <div class="met-sub">USD total</div>
      </div>`;
  } else {
    el.innerHTML = `
      <div class="met">
        <div class="met-lbl">AI BPUs</div>
        <div class="met-val">${r.aiBPUs}</div>
        <div class="met-sub">${formatNumber(r.aiTokens)} tokens</div>
      </div>
      <div class="met">
        <div class="met-lbl">Automation BPUs</div>
        <div class="met-val">${r.autoBPUs}</div>
        <div class="met-sub">${formatNumber(r.autoSteps)} steps</div>
      </div>
      <div class="met hl">
        <div class="met-lbl">Total BPUs</div>
        <div class="met-val">${r.totalBPUs}</div>
        <div class="met-sub">pools independientes</div>
      </div>
      <div class="met gr">
        <div class="met-lbl">Costo / ${period}</div>
        <div class="met-val">${formatCurrency(r.totalCost)}</div>
        <div class="met-sub">USD total</div>
      </div>`;
  }
}

/** Renderiza la tabla de desglose de BPUs */
function _renderBizagiBreakdown(r, period, periodDays) {
  let rows = '';
  if (r.model === 'legacy') {
    rows = `
      <tr>
        <td>Prompts IA</td>
        <td class="mono">${formatNumber(r.prompts)}</td>
        <td class="mono">${BIZAGI_LEGACY.promptsPerBPU.toLocaleString()} prompts / BPU</td>
        <td class="mono">${r.promptBPUs}</td>
        <td class="mono" style="color:var(--gr);">${formatCurrency(r.promptBPUs * r.price)}</td>
      </tr>
      <tr>
        <td>Steps de automatización</td>
        <td class="mono">${formatNumber(r.steps)}</td>
        <td class="mono">${BIZAGI_LEGACY.stepsPerBPU.toLocaleString()} steps / BPU</td>
        <td class="mono">${r.stepBPUs}</td>
        <td class="mono" style="color:var(--gr);">${formatCurrency(r.stepBPUs * r.price)}</td>
      </tr>`;
  } else {
    rows = `
      <tr>
        <td>AI (tokens input + output)</td>
        <td class="mono">${formatNumber(r.aiTokens)}</td>
        <td class="mono">${formatNumber(BIZAGI_2026.tokensPerAiBPU)} tokens / BPU</td>
        <td class="mono">${r.aiBPUs}</td>
        <td class="mono" style="color:var(--gr);">${formatCurrency(r.aiCost)}</td>
      </tr>
      <tr>
        <td>Automation (steps)</td>
        <td class="mono">${formatNumber(r.autoSteps)}</td>
        <td class="mono">${BIZAGI_2026.stepsPerAutomationBPU.toLocaleString()} steps / BPU</td>
        <td class="mono">${r.autoBPUs}</td>
        <td class="mono" style="color:var(--gr);">${formatCurrency(r.autoCost)}</td>
      </tr>`;
  }

  document.getElementById('bz-breakdown-tbody').innerHTML = rows;
  document.getElementById('bz-breakdown-tfoot').innerHTML = `
    <tr style="font-weight:700;border-top:2px solid var(--b2);">
      <td colspan="3" style="padding:8px 14px;color:var(--t2);">Total / ${period}</td>
      <td style="padding:8px 14px;font-family:'Consolas','Courier New',monospace;">${r.totalBPUs}</td>
      <td style="padding:8px 14px;font-family:'Consolas','Courier New',monospace;color:var(--gr);">${formatCurrency(r.totalCost)}</td>
    </tr>`;
}

/** Renderiza la barra de capacidad del BPU actual */
function _renderBizagiCapacity(r, model) {
  const el = document.getElementById('bz-capacity');

  /** Helper: genera una barra de utilización reutilizable */
  function _capacityBar(label, pct, remainderLabel) {
    const color = pct > 80 ? 'var(--gr)' : pct > 50 ? 'var(--am)' : 'var(--rd)';
    const warn  = remainderLabel
      ? `<span style="color:var(--gr);font-weight:600;">${remainderLabel}</span>`
      : `<span style="color:var(--t3);">BPU utilizado al 100%</span>`;
    return `
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--t3);margin-bottom:6px;">
        <span>${label}</span>
        <span style="color:${color};font-weight:600;">${pct}%</span>
      </div>
      <div style="height:8px;background:var(--s4);border-radius:999px;overflow:hidden;margin-bottom:6px;">
        <div style="width:${pct}%;height:100%;background:${color};border-radius:999px;transition:width 0.4s;"></div>
      </div>
      <div style="font-size:11px;margin-bottom:10px;">${warn}</div>`;
  }

  if (model === 'legacy') {
    if (r.prompts === 0 && r.steps === 0) {
      el.innerHTML = `<div style="font-size:12px;color:var(--t3);text-align:center;padding:12px 0;">Ingresa un volumen para ver la utilización del BPU.</div>`;
      return;
    }
    let html = '';
    if (r.prompts > 0) {
      const remainLabel = r.promptRemainder > 0
        ? `${formatNumber(r.promptRemainder)} prompts disponibles sin costo adicional en el BPU actual`
        : null;
      html += _capacityBar('Utilización del BPU activo — Prompts', r.promptUsagePct, remainLabel);
    }
    if (r.steps > 0) {
      const stepUsagePct = Math.min(100, Math.round(
        (r.steps % BIZAGI_LEGACY.stepsPerBPU || BIZAGI_LEGACY.stepsPerBPU) / BIZAGI_LEGACY.stepsPerBPU * 100
      ));
      const stepRemainder = BIZAGI_LEGACY.stepsPerBPU - (r.steps % BIZAGI_LEGACY.stepsPerBPU || BIZAGI_LEGACY.stepsPerBPU);
      const remainLabel = stepRemainder > 0
        ? `${formatNumber(stepRemainder)} steps disponibles sin costo adicional en el BPU actual`
        : null;
      html += _capacityBar('Utilización del BPU activo — Steps', stepUsagePct, remainLabel);
    }
    el.innerHTML = html;
  } else if (model === '2026') {
    if (r.aiTokens === 0 && r.autoSteps === 0) {
      el.innerHTML = `<div style="font-size:12px;color:var(--t3);text-align:center;padding:12px 0;">Ingresa un volumen para ver la utilización del BPU.</div>`;
      return;
    }
    let html = '';
    if (r.aiTokens > 0) {
      const remainLabel = r.aiRemainder > 0
        ? `${formatNumber(r.aiRemainder)} tokens disponibles sin costo adicional en el AI BPU actual`
        : null;
      html += _capacityBar('Utilización del AI BPU activo', r.aiUsagePct, remainLabel);
    }
    if (r.autoSteps > 0) {
      const autoUsagePct = Math.min(100, Math.round(
        (r.autoSteps % BIZAGI_2026.stepsPerAutomationBPU || BIZAGI_2026.stepsPerAutomationBPU) / BIZAGI_2026.stepsPerAutomationBPU * 100
      ));
      const autoRemainder = BIZAGI_2026.stepsPerAutomationBPU - (r.autoSteps % BIZAGI_2026.stepsPerAutomationBPU || BIZAGI_2026.stepsPerAutomationBPU);
      const remainLabel = autoRemainder > 0
        ? `${formatNumber(autoRemainder)} steps disponibles sin costo adicional en el Automation BPU actual`
        : null;
      html += _capacityBar('Utilización del Automation BPU activo', autoUsagePct, remainLabel);
    }
    el.innerHTML = html;
  } else {
    el.innerHTML = `<div style="font-size:12px;color:var(--t3);text-align:center;padding:12px 0;">Ingresa un volumen para ver la utilización del BPU.</div>`;
  }
}

/** Renderiza las tarjetas de proyección de tiempo */
function _renderBizagiProjections(r, periodDays) {
  const daily   = r.totalCost / periodDays;
  const monthly = daily * 30;
  const annual  = daily * 365;
  document.getElementById('bz-projections').innerHTML = `
    <div class="bd-card">
      <div class="bd-title">Costo por BPU</div>
      <div class="bd-row"><span>Precio unitario</span><span class="bd-val">${formatCurrency(r.price)}</span></div>
      <div class="bd-row"><span>Total BPUs consumidos</span><span class="bd-val">${r.totalBPUs}</span></div>
      <div class="bd-row"><span>Costo total período</span><span class="bd-val">${formatCurrency(r.totalCost)}</span></div>
    </div>
    <div class="bd-card">
      <div class="bd-title">Proyecciones de tiempo</div>
      <div class="bd-row"><span>Diario</span><span class="bd-val">${formatCurrency(daily)}</span></div>
      <div class="bd-row"><span>Mensual</span><span class="bd-val">${formatCurrency(monthly)}</span></div>
      <div class="bd-row"><span>Anual</span><span class="bd-val" style="color:var(--gr);">${formatCurrency(annual)}</span></div>
    </div>
    <div class="bd-card">
      <div class="bd-title">Referencia — Tasas del Activo</div>
      <div class="bd-row"><span>Prompts anuales</span><span class="bd-val">2,300</span></div>
      <div class="bd-row"><span>BPUs consumidos</span><span class="bd-val">${Math.ceil(2300 / BIZAGI_LEGACY.promptsPerBPU)}</span></div>
      <div class="bd-row"><span>Costo anual</span><span class="bd-val" style="color:var(--gr);">${formatCurrency(Math.ceil(2300 / BIZAGI_LEGACY.promptsPerBPU) * BIZAGI_PRICING.pricePerBPU)}</span></div>
    </div>`;
}

// Inicializa las vistas de proveedores y gatilla la renderización inicial
renderProviders('single');
renderProviders('batch');
renderProviders('cache');
calcSingle();
calcBatch();
calcCache();
calcCompare();

// Inicializa Bizagi BPU
renderBizagiActions();
switchBizagiModel('legacy');

// Inicializa pills del recomendador de iniciativas
_initInitiativePills();

/* ==========================================================================
   Módulo de Reporte Ejecutivo
   ========================================================================== */

let _reportMarkdown = '';

function generateReport(tab) {
  const tabNames = {
    single:  'Prompt Único',
    batch:   'Batch CSV',
    cache:   'Prompt Caching',
    compare: 'Comparativa de Modelos',
    bizagi:  'Bizagi BPUs'
  };

  let html = '';
  let md   = '';

  const now = new Date().toLocaleString('es-CO', {
    dateStyle: 'long', timeStyle: 'short'
  });

  if (tab === 'single')  { const r = _buildSingleReport();  html = r.html; md = r.md; }
  if (tab === 'batch')   { const r = _buildBatchReport();   html = r.html; md = r.md; }
  if (tab === 'cache')   { const r = _buildCacheReport();   html = r.html; md = r.md; }
  if (tab === 'compare') { const r = _buildCompareReport(); html = r.html; md = r.md; }
  if (tab === 'bizagi')  { const r = _buildBizagiReport();  html = r.html; md = r.md; }

  _reportMarkdown = md;

  document.getElementById('report-modal-body').innerHTML = html;
  document.querySelector('.report-modal-title').textContent =
    `📊 Reporte Ejecutivo — ${tabNames[tab]}`;
  document.getElementById('report-overlay').classList.add('open');
}

function closeReport(e) {
  if (e.target === document.getElementById('report-overlay')) closeReportBtn();
}

function closeReportBtn() {
  document.getElementById('report-overlay').classList.remove('open');
}

function exportReportPDF() {
  const printArea = document.getElementById('report-print-area');
  const title = document.querySelector('.report-modal-title').textContent.replace('📊 ', '');
  const now = new Date().toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' });

  // Construir HTML de impresión a partir del contenido del modal, sustituyendo clases rpt-* → pdf-*
  const modalContent = document.getElementById('report-modal-body').innerHTML
    .replace(/rpt-section-title/g, 'pdf-section-title')
    .replace(/rpt-table/g,        'pdf-table')
    .replace(/rpt-num/g,          'pdf-num')
    .replace(/rpt-green/g,        'pdf-green')
    .replace(/rpt-list/g,         'pdf-list')
    .replace(/rpt-optim-box/g,    'pdf-optim-box')
    .replace(/rpt-optim-label/g,  'pdf-optim-label')
    .replace(/rpt-optim-text/g,   'pdf-optim-text')
    .replace(/rpt-roi-box/g,      'pdf-roi-box')
    .replace(/rpt-roi-label/g,    'pdf-roi-label')
    .replace(/rpt-roi-text/g,     'pdf-roi-text')
    // Remover el párrafo de pie que ya va en el footer PDF
    .replace(/<p[^>]*>Documento generado[^<]*<\/p>/g, '');

  printArea.innerHTML = `
    <div class="pdf-header">
      <div class="pdf-header-title">${title}</div>
      <div class="pdf-header-sub">Centro de Excelencia de IA · Banco de Occidente</div>
      <div class="pdf-header-meta">Generado el ${now} · Uso Interno y Autorizado</div>
    </div>
    <div class="pdf-body">
      ${modalContent}
      <div class="pdf-footer">
        <span>Centro de Excelencia de IA — Banco de Occidente</span>
        <span>${now}</span>
      </div>
    </div>`;

  window.print();
}

function copyReportMd() {
  navigator.clipboard.writeText(_reportMarkdown).then(() => {
    const btn = document.querySelector('.btn-copy-md');
    btn.textContent = '✓ Copiado';
    setTimeout(() => { btn.innerHTML = '📋 Copiar Markdown'; }, 2000);
  });
}

/* --------------------------------------------------------------------------
   Builder: Prompt Único
   -------------------------------------------------------------------------- */
function _buildSingleReport() {
  const model = getSelectedModel('single');
  if (!model) return {
    html: `<div class="empty"><div class="empty-icon">⚠️</div><div class="empty-text">Modelo no disponible</div><div class="empty-hint">No se puede generar el reporte — el modelo seleccionado no se encontró.</div></div>`,
    md:   '# Reporte — Prompt Único\n\nModelo no disponible.'
  };

  const promptTok   = parseInt(document.getElementById('s-itok').textContent.replace(/[^\d]/g,'')) || 0;
  const skillTok    = getSkillsTokenCount('single');
  const outputTok   = parseInt(document.getElementById('s-out').value)   || 500;
  const calls       = parseInt(document.getElementById('s-calls').value) || 1000;
  const periodDays  = parseInt(document.getElementById('s-period').value) || 30;
  const period      = getPeriodLabel(periodDays);
  const totalInput  = promptTok + skillTok;
  const cpc         = (totalInput * model.input / 1e6) + (outputTok * model.output / 1e6);
  const totalCost   = cpc * calls;
  const annualCost  = totalCost / periodDays * 365;
  const tip         = _getOptimTip(model, 'single');

  const html = `
    <div class="rpt-section-title">Métricas Principales</div>
    <table class="rpt-table">
      <thead><tr><th>Parámetro</th><th>Valor</th></tr></thead>
      <tbody>
        <tr><td>Modelo seleccionado</td><td class="rpt-num">${model.name} (${model.provider})</td></tr>
        <tr><td>Tokens de entrada — Prompt</td><td class="rpt-num">${formatNumber(promptTok)}</td></tr>
        <tr><td>Tokens de entrada — Skill/Contexto</td><td class="rpt-num">${formatNumber(skillTok)}</td></tr>
        <tr><td>Tokens de salida esperados</td><td class="rpt-num">${formatNumber(outputTok)}</td></tr>
        <tr><td>Total tokens por llamada</td><td class="rpt-num">${formatNumber(totalInput + outputTok)}</td></tr>
        <tr><td>Costo por llamada</td><td class="rpt-num">${formatCurrency(cpc)}</td></tr>
        <tr><td>Ejecuciones por ${period}</td><td class="rpt-num">${formatNumber(calls)}</td></tr>
        <tr><td>Costo total / ${period}</td><td class="rpt-green">${formatCurrency(totalCost)}</td></tr>
        <tr><td>Proyección anual</td><td class="rpt-green">${formatCurrency(annualCost)}</td></tr>
      </tbody>
    </table>
    <div class="rpt-section-title">Hallazgos Técnicos</div>
    <ul class="rpt-list">
      <li>Tarifa de entrada: <strong>$${model.input}/1M tokens</strong> — tarifa de salida: <strong>$${model.output}/1M tokens</strong>.</li>
      <li>El skill/contexto representa el <strong>${totalInput > 0 ? Math.round(skillTok/totalInput*100) : 0}%</strong> del total de tokens de entrada.</li>
      <li>Costo mensual estimado (base 30 días): <strong>${formatCurrency(totalCost / periodDays * 30)}</strong>.</li>
      <li>Tier del modelo: <strong>${model.tier}</strong> — balance costo/capacidad para esta carga de trabajo.</li>
    </ul>
    <div class="rpt-optim-box">
      <div class="rpt-optim-label">Optimización Sugerida</div>
      <div class="rpt-optim-text">${tip}</div>
    </div>
    <div class="rpt-roi-box">
      <div class="rpt-roi-label">Retorno de Inversión</div>
      <div class="rpt-roi-text">Con <strong>${formatNumber(calls)} ejecuciones/${period}</strong> sobre <strong>${model.name}</strong>, el banco obtiene automatización de tareas cognitivas a <strong>${formatCurrency(cpc)} por llamada</strong>. La proyección anual de <strong>${formatCurrency(annualCost)}</strong> representa un costo predecible y escalable frente al valor operativo generado.</div>
    </div>
    <p style="margin-top:1.5rem;font-size:10px;color:var(--t3);font-family:'Segoe UI Semibold','Segoe UI',Arial,sans-serif;text-align:center;text-transform:uppercase;letter-spacing:0.07em;">Documento generado por el Centro de Excelencia de IA — Banco de Occidente</p>`;

  const md = `# Reporte Ejecutivo — Prompt Único\n_Centro de Excelencia de IA · Banco de Occidente_\n\n## Métricas Principales\n| Parámetro | Valor |\n|---|---|\n| Modelo | ${model.name} (${model.provider}) |\n| Tokens entrada (prompt) | ${formatNumber(promptTok)} |\n| Tokens entrada (skill) | ${formatNumber(skillTok)} |\n| Tokens salida | ${formatNumber(outputTok)} |\n| Costo / llamada | ${formatCurrency(cpc)} |\n| Ejecuciones / ${period} | ${formatNumber(calls)} |\n| Costo total / ${period} | ${formatCurrency(totalCost)} |\n| Proyección anual | ${formatCurrency(annualCost)} |\n\n## Hallazgos\n- Tarifa entrada: $${model.input}/1M · salida: $${model.output}/1M\n- El skill representa el ${totalInput > 0 ? Math.round(skillTok/totalInput*100) : 0}% de tokens de entrada\n- Costo mensual base: ${formatCurrency(totalCost / periodDays * 30)}\n\n## Optimización Sugerida\n${tip}\n\n## ROI\nCon ${formatNumber(calls)} ejecuciones/${period} el banco opera a ${formatCurrency(cpc)}/llamada. Proyección anual: ${formatCurrency(annualCost)}.\n\n_Documento generado por el Centro de Excelencia de IA — Banco de Occidente_`;

  return { html, md };
}

/* --------------------------------------------------------------------------
   Builder: Batch CSV
   -------------------------------------------------------------------------- */
function _buildBatchReport() {
  const model = getSelectedModel('batch');
  if (!model) return {
    html: `<div class="empty"><div class="empty-icon">⚠️</div><div class="empty-text">Modelo no disponible</div><div class="empty-hint">No se puede generar el reporte — el modelo seleccionado no se encontró.</div></div>`,
    md:   '# Reporte — Batch CSV\n\nModelo no disponible.'
  };

  const skillTok   = getSkillsTokenCount('batch');
  const calls      = parseInt(document.getElementById('b-calls').value)   || 1000;
  const periodDays = parseInt(document.getElementById('b-period').value)  || 30;
  const period     = getPeriodLabel(periodDays);
  const prompts    = appState.batch.prompts;
  const defOut     = parseInt(document.getElementById('b-out-def').value) || 500;
  const tip        = _getOptimTip(model, 'batch');

  if (prompts.length === 0) {
    return {
      html: `<div style="text-align:center;padding:3rem;color:var(--t3);"><div style="font-size:32px;margin-bottom:12px;">📂</div><p>No hay prompts cargados.<br>Sube un CSV para generar el reporte.</p></div>`,
      md:   '# Reporte Batch\n\nNo hay prompts cargados.'
    };
  }

  const rows = prompts.map(p => {
    const pTok    = calculateTokens(p.prompt);
    const oTok    = p.outputTokens || defOut;
    const totIn   = pTok + skillTok;
    const cpc     = (totIn * model.input / 1e6) + (oTok * model.output / 1e6);
    return { name: p.name, pTok, oTok, totIn, cpc, costTotal: cpc * calls };
  });

  const grandTotal    = rows.reduce((a, r) => a + r.costTotal, 0);
  const grandTotalTok = rows.reduce((a, r) => a + (r.totIn + r.oTok) * calls, 0);
  const annualCost    = grandTotal / periodDays * 365;
  const topPrompts    = [...rows].sort((a, b) => b.costTotal - a.costTotal).slice(0, 3);

  const rowsHtml = rows.map((r, i) => {
    const pct = grandTotal > 0 ? (r.costTotal / grandTotal * 100).toFixed(1) : '0.0';
    return `<tr><td>${i+1}</td><td>${r.name}</td><td class="rpt-num">${formatNumber(r.totIn + r.oTok)}</td><td class="rpt-num">${formatCurrency(r.cpc)}</td><td class="rpt-green">${formatCurrency(r.costTotal)}</td><td class="rpt-num">${pct}%</td></tr>`;
  }).join('');

  const html = `
    <div class="rpt-section-title">Resumen del Lote</div>
    <table class="rpt-table">
      <thead><tr><th>Parámetro</th><th>Valor</th></tr></thead>
      <tbody>
        <tr><td>Modelo seleccionado</td><td class="rpt-num">${model.name} (${model.provider})</td></tr>
        <tr><td>Prompts procesados</td><td class="rpt-num">${rows.length}</td></tr>
        <tr><td>Tokens de skill compartido</td><td class="rpt-num">${formatNumber(skillTok)}</td></tr>
        <tr><td>Total tokens / ${period}</td><td class="rpt-num">${formatNumber(grandTotalTok)}</td></tr>
        <tr><td>Ejecuciones por prompt</td><td class="rpt-num">${formatNumber(calls)}</td></tr>
        <tr><td>Costo total / ${period}</td><td class="rpt-green">${formatCurrency(grandTotal)}</td></tr>
        <tr><td>Proyección anual</td><td class="rpt-green">${formatCurrency(annualCost)}</td></tr>
      </tbody>
    </table>
    <div class="rpt-section-title">Desglose por Prompt</div>
    <table class="rpt-table">
      <thead><tr><th>#</th><th>Nombre</th><th>Tokens/llamada</th><th>Costo/llamada</th><th>Costo total</th><th>Peso</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <div class="rpt-section-title">Hallazgos Técnicos</div>
    <ul class="rpt-list">
      <li>Prompt de mayor costo: <strong>${topPrompts[0]?.name || 'N/A'}</strong> (${formatCurrency(topPrompts[0]?.costTotal || 0)}).</li>
      ${topPrompts[1] ? `<li>Segundo más costoso: <strong>${topPrompts[1].name}</strong> (${formatCurrency(topPrompts[1].costTotal)}).</li>` : ''}
      <li>Costo promedio por prompt: <strong>${formatCurrency(grandTotal / rows.length)}</strong> / ${period}.</li>
      <li>Skill compartido añade <strong>${formatNumber(skillTok)} tokens</strong> a cada prompt del lote.</li>
    </ul>
    <div class="rpt-optim-box">
      <div class="rpt-optim-label">Optimización Sugerida</div>
      <div class="rpt-optim-text">${tip}</div>
    </div>
    <div class="rpt-roi-box">
      <div class="rpt-roi-label">Retorno de Inversión</div>
      <div class="rpt-roi-text">El procesamiento de <strong>${rows.length} prompts × ${formatNumber(calls)} ejecuciones/${period}</strong> sobre <strong>${model.name}</strong> tiene un costo total de <strong>${formatCurrency(grandTotal)}</strong>. La proyección anual de <strong>${formatCurrency(annualCost)}</strong> permite presupuestar con precisión la operación batch del banco.</div>
    </div>
    <p style="margin-top:1.5rem;font-size:10px;color:var(--t3);font-family:'Segoe UI Semibold','Segoe UI',Arial,sans-serif;text-align:center;text-transform:uppercase;letter-spacing:0.07em;">Documento generado por el Centro de Excelencia de IA — Banco de Occidente</p>`;

  const mdRows = rows.map((r, i) => {
    const pct = grandTotal > 0 ? (r.costTotal / grandTotal * 100).toFixed(1) : '0.0';
    return `| ${i+1} | ${r.name} | ${formatNumber(r.totIn + r.oTok)} | ${formatCurrency(r.cpc)} | ${formatCurrency(r.costTotal)} | ${pct}% |`;
  }).join('\n');

  const md = `# Reporte Ejecutivo — Batch CSV\n_Centro de Excelencia de IA · Banco de Occidente_\n\n## Resumen del Lote\n| Parámetro | Valor |\n|---|---|\n| Modelo | ${model.name} (${model.provider}) |\n| Prompts | ${rows.length} |\n| Skill tokens | ${formatNumber(skillTok)} |\n| Total tokens / ${period} | ${formatNumber(grandTotalTok)} |\n| Costo total / ${period} | ${formatCurrency(grandTotal)} |\n| Proyección anual | ${formatCurrency(annualCost)} |\n\n## Desglose por Prompt\n| # | Nombre | Tokens/llamada | Costo/llamada | Costo total | Peso |\n|---|---|---|---|---|---|\n${mdRows}\n\n## Optimización Sugerida\n${tip}\n\n## ROI\n${rows.length} prompts × ${formatNumber(calls)} ejecuciones/${period} = ${formatCurrency(grandTotal)}. Proyección anual: ${formatCurrency(annualCost)}.\n\n_Documento generado por el Centro de Excelencia de IA — Banco de Occidente_`;

  return { html, md };
}

/* --------------------------------------------------------------------------
   Builder: Prompt Caching
   -------------------------------------------------------------------------- */
function _buildCacheReport() {
  const model = MODELS.find(m => m.id === appState.cache.modelId);
  if (!model) return {
    html: `<div class="empty"><div class="empty-icon">⚠️</div><div class="empty-text">Modelo no disponible</div><div class="empty-hint">No se puede generar el reporte — el modelo seleccionado no se encontró.</div></div>`,
    md:   '# Reporte — Prompt Caching\n\nModelo no disponible.'
  };

  const skillTok   = parseInt(document.getElementById('cc-skill-tok').value)   || 0;
  const promptTok  = parseInt(document.getElementById('cc-prompt-tok').value)  || 200;
  const respTok    = parseInt(document.getElementById('cc-resp-tok').value)    || 500;
  const turns      = parseInt(document.getElementById('cc-turns').value)       || 8;
  const convos     = parseInt(document.getElementById('cc-convos').value)      || 500;
  const periodDays = parseInt(document.getElementById('cc-period').value)      || 30;
  const period     = getPeriodLabel(periodDays);
  const skillCache = document.getElementById('cc-skill-cache').value === '1';
  const histCache  = document.getElementById('cc-hist-cache').value  === '1';

  // Extraer valores ya calculados del DOM
  const metCards = document.querySelectorAll('#cc-metrics .met-val');
  const costWithout = metCards[0] ? metCards[0].textContent : 'N/A';
  const costWith    = metCards[1] ? metCards[1].textContent : 'N/A';
  const savingConvo = metCards[2] ? metCards[2].textContent : 'N/A';
  const savingPeriod= metCards[3] ? metCards[3].textContent : 'N/A';

  // Recalcular ahorro % desde los valores numéricos
  const rateInput     = model.input;
  const rateCacheRead = model.cacheRead !== null ? model.cacheRead : model.input;
  const cacheSupported = model.cacheRead !== null;
  const savingPct     = document.querySelector('#cc-savings-bar [style*="font-weight:600"]')?.textContent || 'N/A';
  const annualSaving  = cacheSupported
    ? parseFloat(savingPeriod.replace(/[^0-9.]/g,'')) / periodDays * 365
    : 0;

  const tip = _getOptimTip(model, 'cache');

  const html = `
    <div class="rpt-section-title">Parámetros de Simulación</div>
    <table class="rpt-table">
      <thead><tr><th>Parámetro</th><th>Valor</th></tr></thead>
      <tbody>
        <tr><td>Modelo seleccionado</td><td class="rpt-num">${model.name} (${model.provider})</td></tr>
        <tr><td>Soporte de Prompt Caching</td><td class="rpt-num">${cacheSupported ? '✓ Sí' : '✗ No'}</td></tr>
        <tr><td>Tokens del skill/contexto fijo</td><td class="rpt-num">${formatNumber(skillTok)}</td></tr>
        <tr><td>Tokens por prompt de usuario</td><td class="rpt-num">${formatNumber(promptTok)}</td></tr>
        <tr><td>Tokens por respuesta del modelo</td><td class="rpt-num">${formatNumber(respTok)}</td></tr>
        <tr><td>Turnos por conversación</td><td class="rpt-num">${turns}</td></tr>
        <tr><td>¿Skill cacheado?</td><td class="rpt-num">${skillCache ? 'Sí' : 'No'}</td></tr>
        <tr><td>¿Historial cacheado?</td><td class="rpt-num">${histCache ? 'Sí' : 'No'}</td></tr>
        <tr><td>Conversaciones / ${period}</td><td class="rpt-num">${formatNumber(convos)}</td></tr>
      </tbody>
    </table>
    <div class="rpt-section-title">Comparativa Con / Sin Caché</div>
    <table class="rpt-table">
      <thead><tr><th>Métrica</th><th>Sin Caché</th><th>Con Caché</th></tr></thead>
      <tbody>
        <tr><td>Costo / conversación</td><td class="rpt-num">${costWithout}</td><td class="rpt-green">${costWith}</td></tr>
        <tr><td>Ahorro / conversación</td><td class="rpt-num">—</td><td class="rpt-green">${savingConvo}</td></tr>
        <tr><td>Ahorro / ${period} (${formatNumber(convos)} conv.)</td><td class="rpt-num">—</td><td class="rpt-green">${savingPeriod}</td></tr>
        <tr><td>Reducción de costo</td><td class="rpt-num">—</td><td class="rpt-green">${savingPct}</td></tr>
        ${cacheSupported ? `<tr><td>Ahorro anual estimado</td><td class="rpt-num">—</td><td class="rpt-green">${formatCurrency(annualSaving)}</td></tr>` : ''}
      </tbody>
    </table>
    <div class="rpt-section-title">Hallazgos Técnicos</div>
    <ul class="rpt-list">
      <li>Tarifa de cache read: <strong>$${rateCacheRead}/1M</strong> vs input normal <strong>$${rateInput}/1M</strong> — ahorro del <strong>${rateInput > 0 ? ((1 - rateCacheRead/rateInput)*100).toFixed(0) : 0}% por token leído del caché</strong>.</li>
      <li>${skillCache ? `El skill de ${formatNumber(skillTok)} tokens se cachea desde el turno 1, reduciendo costo en cada turno subsiguiente.` : `El skill no está siendo cacheado — activarlo podría generar ahorros adicionales.`}</li>
      <li>${histCache ? `El historial de mensajes se cachea entre turnos, evitando re-procesar hasta ${formatNumber(turns * (promptTok + respTok))} tokens acumulados.` : `El historial no se cachea — activarlo en conversaciones largas puede reducir costos significativamente.`}</li>
    </ul>
    <div class="rpt-optim-box">
      <div class="rpt-optim-label">Optimización Sugerida</div>
      <div class="rpt-optim-text">${tip}</div>
    </div>
    <div class="rpt-roi-box">
      <div class="rpt-roi-label">Retorno de Inversión</div>
      <div class="rpt-roi-text">Implementar Prompt Caching en <strong>${formatNumber(convos)} conversaciones/${period}</strong> con <strong>${model.name}</strong> genera un ahorro de <strong>${savingPeriod}</strong> frente al modelo sin caché${cacheSupported ? `, equivalente a <strong>${formatCurrency(annualSaving)}/año</strong>` : ''}. Esto permite escalar el volumen de conversaciones sin incremento lineal del presupuesto.</div>
    </div>
    <p style="margin-top:1.5rem;font-size:10px;color:var(--t3);font-family:'Segoe UI Semibold','Segoe UI',Arial,sans-serif;text-align:center;text-transform:uppercase;letter-spacing:0.07em;">Documento generado por el Centro de Excelencia de IA — Banco de Occidente</p>`;

  const md = `# Reporte Ejecutivo — Prompt Caching\n_Centro de Excelencia de IA · Banco de Occidente_\n\n## Parámetros\n| Parámetro | Valor |\n|---|---|\n| Modelo | ${model.name} |\n| Soporte Caching | ${cacheSupported ? 'Sí' : 'No'} |\n| Turnos/conversación | ${turns} |\n| Conversaciones/${period} | ${formatNumber(convos)} |\n| Skill cacheado | ${skillCache ? 'Sí' : 'No'} |\n| Historial cacheado | ${histCache ? 'Sí' : 'No'} |\n\n## Comparativa\n| Métrica | Sin Caché | Con Caché |\n|---|---|---|\n| Costo/conversación | ${costWithout} | ${costWith} |\n| Ahorro/conversación | — | ${savingConvo} |\n| Ahorro/${period} | — | ${savingPeriod} |\n| Reducción | — | ${savingPct} |\n\n## Optimización Sugerida\n${tip}\n\n## ROI\nAhorro de ${savingPeriod}/${period}${cacheSupported ? ` = ${formatCurrency(annualSaving)}/año` : ''}. Permite escalar sin incremento lineal de costos.\n\n_Documento generado por el Centro de Excelencia de IA — Banco de Occidente_`;

  return { html, md };
}

/* --------------------------------------------------------------------------
   Builder: Comparativa de Modelos
   -------------------------------------------------------------------------- */
function _buildCompareReport() {
  const inputTok  = parseInt(document.getElementById('c-in').value)    || 200;
  const outputTok = parseInt(document.getElementById('c-out').value)   || 500;
  const skillTok  = parseInt(document.getElementById('c-skill').value) || 0;
  const calls     = parseInt(document.getElementById('c-calls').value) || 1000;
  const totalIn   = inputTok + skillTok;
  const sortBy    = compareState.sortBy;

  // Calcular costos y scores — reutiliza _calcScore() igual que calcCompare()
  const rows = MODELS.map(m => {
    const cpc   = (totalIn * m.input / 1e6) + (outputTok * m.output / 1e6);
    const total = cpc * calls;
    return { ...m, cpc, total };
  });
  const maxTotal = Math.max(...rows.map(r => r.total));
  const minTotal = Math.min(...rows.map(r => r.total));
  rows.forEach(r => { r.score = _calcScore(r, maxTotal, minTotal); });

  // Ordenar según criterio activo en la UI
  const ranked  = [...rows].sort((a, b) =>
    sortBy === 'score' ? b.score - a.score : a.total - b.total
  );

  const cheapest  = rows.reduce((a, b) => a.total < b.total ? a : b);
  const mostExp   = rows.reduce((a, b) => a.total > b.total ? a : b);
  const bestScore = rows.reduce((a, b) => a.score > b.score ? a : b);
  const diffRatio = cheapest.total > 0 ? (mostExp.total / cheapest.total).toFixed(1) : 'N/A';

  // Labels de velocidad
  const speedLabels = ['', 'Lento', 'Medio', 'Rápido'];

  const rowsHtml = ranked.map((m, i) => {
    const ratio      = cheapest.total > 0 ? (m.total / cheapest.total).toFixed(1) : '1.0';
    const costBadge  = m.id === cheapest.id
      ? ' <span style="background:#00A13A;color:#fff;font-size:9px;padding:1px 6px;border-radius:999px;margin-left:4px;">más barato</span>' : '';
    const scoreBadge = m.id === bestScore.id
      ? ' <span style="background:#003893;color:#fff;font-size:9px;padding:1px 6px;border-radius:999px;margin-left:4px;">mejor score</span>' : '';
    const scoreColor = m.score >= 70 ? '#008A4B' : m.score >= 50 ? '#D97706' : '#DC2626';
    return `<tr>
      <td>${m.name}${costBadge}${scoreBadge}</td>
      <td>${m.provider}</td>
      <td class="rpt-num">$${m.input}</td>
      <td class="rpt-num">$${m.output}</td>
      <td class="${m.id === cheapest.id ? 'rpt-green' : 'rpt-num'}">${formatCurrency(m.total)}</td>
      <td class="rpt-num">${ratio === '1.0' ? '—' : ratio + 'x'}</td>
      <td style="font-size:10px;color:var(--t2);">${speedLabels[m.speedTier || 1]}</td>
      <td class="rpt-num">${m.reasoning || 1}/5</td>
      <td style="font-weight:700;color:${scoreColor};">${m.score}</td>
    </tr>`;
  }).join('');

  const html = `
    <div class="rpt-section-title">Parámetros de Comparativa</div>
    <table class="rpt-table">
      <thead><tr><th>Parámetro</th><th>Valor</th></tr></thead>
      <tbody>
        <tr><td>Tokens de entrada (prompt)</td><td class="rpt-num">${formatNumber(inputTok)}</td></tr>
        <tr><td>Tokens de entrada (skill)</td><td class="rpt-num">${formatNumber(skillTok)}</td></tr>
        <tr><td>Tokens de salida</td><td class="rpt-num">${formatNumber(outputTok)}</td></tr>
        <tr><td>Llamadas totales</td><td class="rpt-num">${formatNumber(calls)}</td></tr>
        <tr><td>Modelos comparados</td><td class="rpt-num">${ranked.length}</td></tr>
        <tr><td>Ordenado por</td><td class="rpt-num">${sortBy === 'score' ? 'Score Global (Razonamiento 40% · Costo 35% · Velocidad 25%)' : 'Costo total'}</td></tr>
      </tbody>
    </table>
    <div class="rpt-section-title">Ranking de Modelos</div>
    <table class="rpt-table">
      <thead><tr><th>Modelo</th><th>Proveedor</th><th>Input/1M</th><th>Output/1M</th><th>Costo total</th><th>vs. barato</th><th>Velocidad</th><th>Razon.</th><th>Score</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <div class="rpt-section-title">Hallazgos Técnicos</div>
    <ul class="rpt-list">
      <li>Modelo más económico: <strong>${cheapest.name}</strong> (${cheapest.provider}) — ${formatCurrency(cheapest.total)} para ${formatNumber(calls)} llamadas.</li>
      <li>Mayor score global: <strong>${bestScore.name}</strong> — score ${bestScore.score}/100 (razonamiento ${bestScore.reasoning}/5 · velocidad ${speedLabels[bestScore.speedTier || 1]}).</li>
      <li>Modelo más costoso: <strong>${mostExp.name}</strong> — ${formatCurrency(mostExp.total)} (${diffRatio}x más caro que el más barato).</li>
      <li>Score = Razonamiento <strong>40%</strong> · Costo <strong>35%</strong> · Velocidad <strong>25%</strong> — ponderación visible en la herramienta.</li>
    </ul>
    <div class="rpt-optim-box">
      <div class="rpt-optim-label">Optimización Sugerida</div>
      <div class="rpt-optim-text">Para esta carga (<strong>${formatNumber(totalIn)} tokens entrada / ${formatNumber(outputTok)} salida</strong>), <strong>${cheapest.name}</strong> es la opción más eficiente en costo y <strong>${bestScore.name}</strong> la mejor en score global. Evalúa si el diferencial de <strong>${diffRatio}x en costo</strong> se justifica con la ganancia en razonamiento y velocidad según el caso de uso del banco.</div>
    </div>
    <div class="rpt-roi-box">
      <div class="rpt-roi-label">Retorno de Inversión</div>
      <div class="rpt-roi-text">Seleccionar <strong>${cheapest.name}</strong> frente a <strong>${mostExp.name}</strong> para ${formatNumber(calls)} llamadas representa un ahorro de <strong>${formatCurrency(mostExp.total - cheapest.total)}</strong>. El score global permite al banco comparar no solo precio sino capacidad, tomando decisiones de inversión informadas para cada tipo de iniciativa de IA.</div>
    </div>
    <p style="margin-top:1.5rem;font-size:10px;color:var(--t3);font-family:'Segoe UI Semibold','Segoe UI',Arial,sans-serif;text-align:center;text-transform:uppercase;letter-spacing:0.07em;">Documento generado por el Centro de Excelencia de IA — Banco de Occidente</p>`;

  const mdRows = ranked.map(m => {
    const ratio = cheapest.total > 0 ? (m.total / cheapest.total).toFixed(1) : '1.0';
    return `| ${m.name}${m.id === cheapest.id ? ' ✓' : ''} | ${m.provider} | $${m.input} | $${m.output} | ${formatCurrency(m.total)} | ${ratio === '1.0' ? '—' : ratio + 'x'} | ${speedLabels[m.speedTier||1]} | ${m.reasoning||1}/5 | ${m.score} |`;
  }).join('\n');

  const md = `# Reporte Ejecutivo — Comparativa de Modelos\n_Centro de Excelencia de IA · Banco de Occidente_\n\n## Parámetros\n| Parámetro | Valor |\n|---|---|\n| Tokens entrada | ${formatNumber(inputTok)} |\n| Tokens skill | ${formatNumber(skillTok)} |\n| Tokens salida | ${formatNumber(outputTok)} |\n| Llamadas | ${formatNumber(calls)} |\n| Ordenado por | ${sortBy === 'score' ? 'Score Global' : 'Costo'} |\n\n## Ranking\n| Modelo | Proveedor | Input/1M | Output/1M | Costo total | vs. barato | Velocidad | Razon. | Score |\n|---|---|---|---|---|---|---|---|---|\n${mdRows}\n\n## Score = Razonamiento 40% · Costo 35% · Velocidad 25%\n\n## Optimización Sugerida\nMás barato: ${cheapest.name}. Mejor score: ${bestScore.name} (${bestScore.score}/100). Diferencial de costo: ${diffRatio}x.\n\n## ROI\nElegir ${cheapest.name} vs ${mostExp.name} ahorra ${formatCurrency(mostExp.total - cheapest.total)} para ${formatNumber(calls)} llamadas.\n\n_Documento generado por el Centro de Excelencia de IA — Banco de Occidente_`;

  return { html, md };
}

/* --------------------------------------------------------------------------
   Builder: Bizagi BPUs
   -------------------------------------------------------------------------- */
function _buildBizagiReport() {
  // Consume el resultado ya calculado — sin releer DOM ni parsear strings formateados
  const r          = appState.bizagi.lastResult;
  const model      = appState.bizagi.pricingModel;
  const periodDays = appState.bizagi.periodDays || 365;
  const period     = getPeriodLabel(periodDays);
  const price      = BIZAGI_PRICING.pricePerBPU;
  const action     = BIZAGI_ACTIONS.find(a => a.id === appState.bizagi.actionId) || BIZAGI_ACTIONS[0];

  // Valores numéricos puros — sin parseo de strings
  const totalBPUsNum  = r.totalBPUs;
  const totalCostNum  = r.totalCost;
  const totalBPUs     = String(totalBPUsNum);
  const totalCost     = formatCurrency(totalCostNum);
  const daily         = formatCurrency(totalCostNum / periodDays);
  const monthly       = formatCurrency(totalCostNum / periodDays * 30);
  const annual        = formatCurrency(totalCostNum / periodDays * 365);

  // Filas del desglose según modelo activo
  let paramRows = '';
  let breakdownRows = '';
  let mdParams = '';
  let mdBreakdown = '';

  if (model === 'legacy') {
    const prompts    = r.prompts;
    const steps      = r.steps;
    const promptBPUs = r.promptBPUs;
    const stepBPUs   = r.stepBPUs;
    const usagePct   = r.promptUsagePct + '%';

    paramRows = `
      <tr><td>Modelo de precios</td><td class="rpt-num">Legacy (pre-2026)</td></tr>
      <tr><td>Acción de IA</td><td class="rpt-num">${action.name} — ${action.category}</td></tr>
      <tr><td>Prompts / ${period}</td><td class="rpt-num">${formatNumber(prompts)}</td></tr>
      <tr><td>Steps / ${period}</td><td class="rpt-num">${formatNumber(steps)}</td></tr>
      <tr><td>Unidad BPU (prompts)</td><td class="rpt-num">2,500 prompts / BPU</td></tr>
      <tr><td>Unidad BPU (steps)</td><td class="rpt-num">10,000 steps / BPU</td></tr>
      <tr><td>Precio por BPU</td><td class="rpt-num">$${price} USD</td></tr>
      <tr><td>Utilización BPU activo</td><td class="rpt-num">${usagePct}</td></tr>`;

    breakdownRows = `
      <tr><td>Prompts IA</td><td class="rpt-num">${formatNumber(prompts)}</td>
          <td class="rpt-num">${promptBPUs}</td><td class="rpt-green">${formatCurrency(promptBPUs * price)}</td></tr>
      <tr><td>Steps de automatización</td><td class="rpt-num">${formatNumber(steps)}</td>
          <td class="rpt-num">${stepBPUs}</td><td class="rpt-green">${formatCurrency(stepBPUs * price)}</td></tr>`;

    mdParams = `| Modelo | Legacy (pre-2026) |\n| Acción | ${action.name} |\n| Prompts/${period} | ${formatNumber(prompts)} |\n| Steps/${period} | ${formatNumber(steps)} |\n| Precio/BPU | $${price} USD |`;
    mdBreakdown = `| Prompts IA | ${formatNumber(prompts)} | ${promptBPUs} | ${formatCurrency(promptBPUs * price)} |\n| Steps auto | ${formatNumber(steps)} | ${stepBPUs} | ${formatCurrency(stepBPUs * price)} |`;

  } else {
    const aiTokens  = r.aiTokens;
    const autoSteps = r.autoSteps;
    const aiBPUs    = r.aiBPUs;
    const autoBPUs  = r.autoBPUs;

    paramRows = `
      <tr><td>Modelo de precios</td><td class="rpt-num">2026+</td></tr>
      <tr><td>Acción de IA</td><td class="rpt-num">${action.name} — ${action.category}</td></tr>
      <tr><td>Tokens IA / ${period} (input + output)</td><td class="rpt-num">${formatNumber(aiTokens)}</td></tr>
      <tr><td>Steps automatización / ${period}</td><td class="rpt-num">${formatNumber(autoSteps)}</td></tr>
      <tr><td>Unidad AI BPU</td><td class="rpt-num">50,000,000 tokens / BPU</td></tr>
      <tr><td>Unidad Automation BPU</td><td class="rpt-num">10,000 steps / BPU</td></tr>
      <tr><td>Precio por BPU</td><td class="rpt-num">$${price} USD</td></tr>
      <tr><td>Pools</td><td class="rpt-num">AI BPUs y Automation BPUs son independientes</td></tr>`;

    breakdownRows = `
      <tr><td>AI (tokens)</td><td class="rpt-num">${formatNumber(aiTokens)}</td>
          <td class="rpt-num">${aiBPUs}</td><td class="rpt-green">${formatCurrency(aiBPUs * price)}</td></tr>
      <tr><td>Automation (steps)</td><td class="rpt-num">${formatNumber(autoSteps)}</td>
          <td class="rpt-num">${autoBPUs}</td><td class="rpt-green">${formatCurrency(autoBPUs * price)}</td></tr>`;

    mdParams = `| Modelo | 2026+ |\n| Acción | ${action.name} |\n| Tokens IA/${period} | ${formatNumber(aiTokens)} |\n| Steps/${period} | ${formatNumber(autoSteps)} |\n| Precio/BPU | $${price} USD |`;
    mdBreakdown = `| AI (tokens) | ${formatNumber(aiTokens)} | ${aiBPUs} | ${formatCurrency(aiBPUs * price)} |\n| Automation (steps) | ${formatNumber(autoSteps)} | ${autoBPUs} | ${formatCurrency(autoBPUs * price)} |`;
  }

  const html = `
    <div class="rpt-section-title">Parámetros de la Simulación</div>
    <table class="rpt-table">
      <thead><tr><th>Parámetro</th><th>Valor</th></tr></thead>
      <tbody>${paramRows}</tbody>
    </table>

    <div class="rpt-section-title">Desglose de BPUs Consumidos</div>
    <table class="rpt-table">
      <thead><tr><th>Tipo</th><th>Volumen</th><th>BPUs</th><th>Costo (USD)</th></tr></thead>
      <tbody>${breakdownRows}</tbody>
      <tfoot>
        <tr style="font-weight:700;">
          <td colspan="2" style="padding:7px 12px;color:var(--t2);">Total / ${period}</td>
          <td style="padding:7px 12px;font-family:'Consolas','Courier New',monospace;">${totalBPUs}</td>
          <td style="padding:7px 12px;font-family:'Consolas','Courier New',monospace;color:#00A13A;">${totalCost}</td>
        </tr>
      </tfoot>
    </table>

    <div class="rpt-section-title">Hallazgos Técnicos</div>
    <ul class="rpt-list">
      <li>Modelo de facturación: <strong>${model === 'legacy' ? 'Legacy — prompts y steps comparten el mismo pool de BPUs' : '2026+ — AI BPUs y Automation BPUs son presupuestos independientes'}</strong>.</li>
      <li>Precio oficial por BPU: <strong>$${price} USD</strong> — independiente del volumen consumido dentro del BPU.</li>
      <li>Proyección anual: <strong>${annual}</strong> · mensual: <strong>${monthly}</strong> · diario: <strong>${daily}</strong>.</li>
      <li>Referencia iniciativa <strong>Tasas del Activo</strong>: 2,300 prompts/año → 1 BPU → $136.50 USD/año.</li>
    </ul>

    <div class="rpt-optim-box">
      <div class="rpt-optim-label">Optimización Sugerida</div>
      <div class="rpt-optim-text">${model === 'legacy'
        ? `En el modelo Legacy, cada BPU cubre 2,500 prompts. Si la iniciativa genera ${parseInt(document.getElementById('bz-prompts').value) || 0} prompts/${period}, quedan <strong>${Math.ceil((parseInt(document.getElementById('bz-prompts').value)||0)/2500)*2500 - (parseInt(document.getElementById('bz-prompts').value)||0)} prompts disponibles</strong> sin costo adicional en el BPU actual. Evalúa si otras iniciativas pueden aprovechar esa capacidad residual antes de adquirir BPUs adicionales.`
        : `En el modelo 2026+, los pools de AI BPUs (50M tokens/BPU) y Automation BPUs (10,000 steps/BPU) son independientes. Optimiza el volumen de tokens por llamada para maximizar la utilización de cada AI BPU antes de consumir el siguiente.`
      }</div>
    </div>

    <div class="rpt-roi-box">
      <div class="rpt-roi-label">Retorno de Inversión</div>
      <div class="rpt-roi-text">Con un costo proyectado de <strong>${totalCost} / ${period}</strong> (${annual}/año), la iniciativa <strong>${action.name}</strong> en Bizagi representa una inversión tecnológica predecible y controlable. La herramienta permite al banco calcular este valor en menos de 5 minutos, frente a la semana que tomaba el proceso manual anterior.</div>
    </div>
    <p style="margin-top:1.5rem;font-size:10px;color:var(--t3);font-family:'Segoe UI Semibold','Segoe UI',Arial,sans-serif;text-align:center;text-transform:uppercase;letter-spacing:0.07em;">Documento generado por el Centro de Excelencia de IA — Banco de Occidente</p>`;

  const md = `# Reporte Ejecutivo — Bizagi BPUs\n_Centro de Excelencia de IA · Banco de Occidente_\n\n## Parámetros\n| Parámetro | Valor |\n|---|---|\n${mdParams}\n\n## Desglose\n| Tipo | Volumen | BPUs | Costo |\n|---|---|---|---|\n${mdBreakdown}\n| **Total** | | **${totalBPUs}** | **${totalCost}** |\n\n## Proyecciones\n| Período | Costo |\n|---|---|\n| Diario | ${daily} |\n| Mensual | ${monthly} |\n| Anual | ${annual} |\n\n## ROI\nCosto ${totalCost}/${period} = ${annual}/año para ${action.name}. Calculado en < 5 minutos vs. 1 semana proceso manual.\n\n_Documento generado por el Centro de Excelencia de IA — Banco de Occidente_`;

  return { html, md };
}

/* --------------------------------------------------------------------------
   Sugerencia de optimización según modelo y contexto
   -------------------------------------------------------------------------- */
function _getOptimTip(model, ctx) {
  const hasCacheWrite = model.cacheWrite !== null;
  const hasCacheRead  = model.cacheRead  !== null;

  if (ctx === 'cache' && hasCacheRead) {
    return `${model.name} soporta Prompt Caching con lectura a $${model.cacheRead}/1M (${((1 - model.cacheRead / model.input) * 100).toFixed(0)}% más barato que input normal). Maximizar el cacheado del skill y del historial en conversaciones de más de 3 turnos es la estrategia de mayor impacto en reducción de costos.`;
  }
  if (ctx === 'cache' && !hasCacheRead) {
    return `${model.name} no soporta Prompt Caching oficial. Considera migrar conversaciones multi-turno a un modelo con soporte de caché como Claude Sonnet 4.6 o GPT-4o para reducir costos en escenarios de alto volumen.`;
  }
  if (hasCacheRead && (ctx === 'single' || ctx === 'batch')) {
    return `${model.name} soporta Prompt Caching (read: $${model.cacheRead}/1M${hasCacheWrite ? `, write: $${model.cacheWrite}/1M` : ''}). Si este prompt se ejecuta repetidamente con el mismo skill/contexto, activar caching en la pestaña "Prompt Caching" puede reducir el costo de entrada hasta en un ${((1 - model.cacheRead / model.input) * 100).toFixed(0)}%.`;
  }
  if (model.tier === 'Flagship' || model.tier === 'Premium') {
    return `${model.name} es un modelo de tier ${model.tier} con alto costo por token. Evalúa si la tarea requiere este nivel de capacidad o si un modelo Balanced como Claude Sonnet 4.6 puede ofrecer resultados equivalentes a menor costo.`;
  }
  if (model.tier === 'Fast') {
    return `${model.name} es un modelo de alta velocidad y bajo costo, ideal para tareas de clasificación, extracción o respuestas cortas. Si la calidad de respuesta es insuficiente, considera escalar a un modelo Balanced.`;
  }
  return `Revisa el balance entre costo y calidad del modelo seleccionado (${model.name}, tier: ${model.tier}) según los requisitos de cada caso de uso del banco.`;
}
