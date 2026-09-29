/**
 * Lógica interactiva para el visor de Rutas de Tacna
 * Arquitectura modular con gestión de estado centralizada, PWA y Geolocalización GPS
 */

document.addEventListener('DOMContentLoaded', () => {
  // =========================================================================
  // 1. Configuración y Estado de la Aplicación
  // =========================================================================
  const CONFIG = {
    tacnaCoords: [-18.014, -70.251],
    defaultZoom: 13,
    geojsonPath: './RT_001.geojson',
    routeColors: {
      'Ruta 14': '#f97316',  // Naranja vibrante
      'Ruta 1': '#10b981',   // Verde esmeralda
      'Ruta 101': '#6366f1', // Índigo moderno
      'Ruta 102': '#06b6d4', // Cian brillante
      'Ruta 202': '#ec4899', // Rosa vibrante
      'Ruta 10B': '#f59e0b', // Ámbar cálido
      'Ruta 11': '#3b82f6',  // Azul eléctrico
      'Ruta 13': '#14b8a6',  // Turquesa / Teal
      'Ruta 15': '#ef4444',  // Rojo coral
      'Ruta 16': '#84cc16'   // Lima fresco
    },
    fallbackColors: ['#3b82f6', '#ec4899', '#f59e0b', '#06b6d4', '#6366f1', '#10b981', '#f97316', '#8b5cf6', '#14b8a6', '#ef4444']
  };

  const state = {
    map: null,
    routes: {}, // Diccionario: { [rutaId]: { layer, color, active, bounds } }
    isPanelMinimized: false,
    userMarker: null,
    userAccuracyCircle: null
  };

  // Elementos del DOM
  const dom = {
    routesPanel: document.getElementById('routesPanel'),
    routesList: document.getElementById('routesList'),
    activeBadge: document.getElementById('activeBadge'),
    btnEnableAll: document.getElementById('btnEnableAll'),
    btnDisableAll: document.getElementById('btnDisableAll'),
    btnCollapse: document.getElementById('btnCollapse'),
    locateBtn: document.getElementById('locateBtn')
  };

  // =========================================================================
  // 2. Inicialización del Mapa Leaflet
  // =========================================================================
  function initMap() {
    state.map = L.map('map', {
      zoomControl: true
    }).setView(CONFIG.tacnaCoords, CONFIG.defaultZoom);

    // Reubicar controles de zoom en la esquina inferior izquierda
    state.map.zoomControl.setPosition('bottomleft');

    // Capa base Carto Voyager (ligera y optimizada para móviles)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap'
    }).addTo(state.map);
  }

  // =========================================================================
  // 3. Funciones de Apoyo y Asignación de Colores
  // =========================================================================
  function getRouteColor(routeId, index = 0) {
    if (CONFIG.routeColors[routeId]) {
      return CONFIG.routeColors[routeId];
    }
    return CONFIG.fallbackColors[index % CONFIG.fallbackColors.length];
  }

  function escapeId(str) {
    return str.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  // =========================================================================
  // 4. Carga y Procesamiento de Datos GeoJSON
  // =========================================================================
  async function loadRoutes() {
    try {
      const response = await fetch(CONFIG.geojsonPath);
      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status} al cargar ${CONFIG.geojsonPath}`);
      }

      const geojsonData = await response.json();
      processRoutesData(geojsonData);
    } catch (error) {
      console.error('Error al cargar las rutas:', error);
      showErrorMessage();
    }
  }

  function processRoutesData(data) {
    // Agrupar features por ruta_id
    const groups = {};
    data.features.forEach(feature => {
      const id = feature.properties?.ruta_id || 'Ruta Desconocida';
      if (!groups[id]) groups[id] = [];
      groups[id].push(feature);
    });

    const routeIds = Object.keys(groups);

    routeIds.forEach((id, index) => {
      const color = getRouteColor(id, index);
      const layer = createRouteLayer(id, groups[id], color);

      // Agregar capa inicialmente al mapa
      layer.addTo(state.map);

      // Almacenar en el estado
      state.routes[id] = {
        layer: layer,
        color: color,
        active: true,
        bounds: layer.getBounds()
      };
    });

    // Renderizar controles visuales
    renderRouteControls();
    updateCounterBadge();

    // Ajustar el mapa para encuadrar todas las rutas
    fitAllRoutes();
  }

  function createRouteLayer(id, features, color) {
    return L.geoJSON({
      type: 'FeatureCollection',
      features: features
    }, {
      style: () => ({
        color: color,
        weight: 5,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      }),
      onEachFeature: (feature, featLayer) => {
        // Popup descriptivo
        featLayer.bindPopup(`
          <div class="route-popup-card">
            <div class="route-popup-header">
              <span class="route-popup-dot" style="background:${color}"></span>
              <strong class="route-popup-title">${id}</strong>
            </div>
            <span class="route-popup-desc">Transporte Urbano de Tacna</span>
          </div>
        `);

        // Efectos al pasar el cursor sobre la línea en el mapa
        featLayer.on('mouseover', function () {
          this.setStyle({ weight: 8, opacity: 1 });
          this.bringToFront();
        });

        featLayer.on('mouseout', function () {
          this.setStyle({ weight: 5, opacity: 0.9 });
        });
      }
    });
  }

  function fitAllRoutes() {
    const allLayers = Object.values(state.routes).map(r => r.layer);
    if (allLayers.length > 0) {
      const groupBounds = L.featureGroup(allLayers).getBounds();
      if (groupBounds.isValid()) {
        state.map.fitBounds(groupBounds, { padding: [40, 40] });
      }
    }
  }

  function showErrorMessage() {
    if (!dom.routesList) return;
    dom.routesList.innerHTML = `
      <div style="padding: 12px; color: #ef4444; font-size: 13px; text-align: center;">
        No se pudo cargar el archivo <code>${CONFIG.geojsonPath}</code>.<br>
        Verifica que el archivo esté en la misma carpeta o ruta relativa.
      </div>
    `;
  }

  // =========================================================================
  // 5. Renderizado y Gestión de Controles del DOM
  // =========================================================================
  function renderRouteControls() {
    if (!dom.routesList) return;
    dom.routesList.innerHTML = '';

    Object.keys(state.routes).forEach(id => {
      const route = state.routes[id];
      const itemEl = document.createElement('div');
      itemEl.className = `route-item ${route.active ? 'active' : 'inactive'}`;
      itemEl.id = `route-item-${escapeId(id)}`;
      itemEl.style.setProperty('--route-color', route.color);

      itemEl.innerHTML = `
        <div class="route-info">
          <span class="route-color-dot" style="background-color: ${route.color}"></span>
          <span class="route-name">${id}</span>
        </div>
        <div class="route-actions">
          <button class="btn-focus" title="Enfocar en el mapa" data-id="${id}" aria-label="Enfocar ${id}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </button>
          <label class="switch" aria-label="Alternar ruta ${id}">
            <input type="checkbox" ${route.active ? 'checked' : ''} data-id="${id}">
            <span class="slider"></span>
          </label>
        </div>
      `;

      // Clic en toda la fila para alternar estado
      itemEl.addEventListener('click', (e) => {
        if (e.target.closest('.btn-focus')) return;
        toggleRoute(id);
      });

      // Botón de enfoque (🎯)
      const focusBtn = itemEl.querySelector('.btn-focus');
      focusBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        focusRoute(id);
      });

      dom.routesList.appendChild(itemEl);
    });
  }

  // =========================================================================
  // 6. Manipulación de Rutas (Activar, Desactivar, Enfocar)
  // =========================================================================
  function toggleRoute(id, forceState = null) {
    const route = state.routes[id];
    if (!route) return;

    const nextState = forceState !== null ? forceState : !route.active;
    route.active = nextState;

    if (nextState) {
      if (!state.map.hasLayer(route.layer)) {
        state.map.addLayer(route.layer);
      }
    } else {
      if (state.map.hasLayer(route.layer)) {
        state.map.removeLayer(route.layer);
      }
    }

    updateRouteItemUI(id);
    updateCounterBadge();
  }

  function setAllRoutes(enable) {
    Object.keys(state.routes).forEach(id => {
      toggleRoute(id, enable);
    });
  }

  function focusRoute(id) {
    const route = state.routes[id];
    if (!route) return;

    // Si estaba desactivada, la activamos automáticamente
    if (!route.active) {
      toggleRoute(id, true);
    }

    if (route.bounds && route.bounds.isValid()) {
      state.map.fitBounds(route.bounds, {
        padding: [60, 60],
        maxZoom: 16
      });
    }
  }

  function updateRouteItemUI(id) {
    const route = state.routes[id];
    const itemEl = document.getElementById(`route-item-${escapeId(id)}`);
    if (!itemEl || !route) return;

    if (route.active) {
      itemEl.classList.remove('inactive');
      itemEl.classList.add('active');
    } else {
      itemEl.classList.remove('active');
      itemEl.classList.add('inactive');
    }

    const checkbox = itemEl.querySelector('input[type="checkbox"]');
    if (checkbox) {
      checkbox.checked = route.active;
    }
  }

  function updateCounterBadge() {
    if (!dom.activeBadge) return;

    const total = Object.keys(state.routes).length;
    const activeCount = Object.values(state.routes).filter(r => r.active).length;
    dom.activeBadge.textContent = `${activeCount}/${total} activas`;

    if (activeCount === total) {
      dom.activeBadge.style.background = '#dcfce7';
      dom.activeBadge.style.color = '#15803d';
    } else if (activeCount === 0) {
      dom.activeBadge.style.background = '#fee2e2';
      dom.activeBadge.style.color = '#b91c1c';
    } else {
      dom.activeBadge.style.background = '#eff6ff';
      dom.activeBadge.style.color = '#2563eb';
    }
  }

  // =========================================================================
  // 7. Geolocalización (GPS del dispositivo)
  // =========================================================================
  function setupGeolocation() {
    if (!dom.locateBtn) return;

    dom.locateBtn.addEventListener('click', () => {
      dom.locateBtn.classList.add('locating');
      state.map.locate({
        setView: true,
        maxZoom: 16,
        enableHighAccuracy: true
      });
    });

    state.map.on('locationfound', (e) => {
      dom.locateBtn.classList.remove('locating');
      dom.locateBtn.classList.add('active');

      const radius = e.accuracy / 2;

      // Crear o actualizar marcador de ubicación del usuario
      if (!state.userMarker) {
        state.userAccuracyCircle = L.circle(e.latlng, {
          radius: radius,
          color: '#2563eb',
          fillColor: '#3b82f6',
          fillOpacity: 0.15,
          weight: 1.5
        }).addTo(state.map);

        state.userMarker = L.circleMarker(e.latlng, {
          radius: 9,
          fillColor: '#2563eb',
          color: '#ffffff',
          weight: 3,
          opacity: 1,
          fillOpacity: 0.95
        }).addTo(state.map);

        state.userMarker.bindPopup(`
          <div style="font-family:'Plus Jakarta Sans',sans-serif; text-align:center; padding:4px;">
            <strong style="color:#0f172a; font-size:14px;">📍 Tu ubicación</strong>
            <p style="margin:4px 0 0; font-size:12px; color:#64748b;">Precisión: ±${Math.round(e.accuracy)} m</p>
          </div>
        `).openPopup();
      } else {
        state.userMarker.setLatLng(e.latlng);
        if (state.userAccuracyCircle) {
          state.userAccuracyCircle.setLatLng(e.latlng);
          state.userAccuracyCircle.setRadius(radius);
        }
      }
    });

    state.map.on('locationerror', (err) => {
      dom.locateBtn.classList.remove('locating');
      dom.locateBtn.classList.remove('active');
      console.warn('Error de geolocalización:', err.message);
      alert('No se pudo obtener la ubicación GPS. Asegúrate de otorgar permisos de localización.');
    });
  }

  // =========================================================================
  // 8. Registro del Service Worker (PWA)
  // =========================================================================
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then(reg => {
            console.log('Service Worker registrado con éxito:', reg.scope);
            // Actualizar si hay nueva versión
            reg.update();
          })
          .catch(err => {
            console.warn('Error al registrar Service Worker:', err);
          });
      });
    }
  }

  // =========================================================================
  // 9. Eventos de la Interfaz
  // =========================================================================
  function setupEventListeners() {
    // Activar todas
    if (dom.btnEnableAll) {
      dom.btnEnableAll.addEventListener('click', () => setAllRoutes(true));
    }

    // Desactivar todas
    if (dom.btnDisableAll) {
      dom.btnDisableAll.addEventListener('click', () => setAllRoutes(false));
    }

    // Minimizar / Expandir panel
    if (dom.btnCollapse && dom.routesPanel) {
      dom.btnCollapse.addEventListener('click', () => {
        state.isPanelMinimized = !state.isPanelMinimized;
        dom.routesPanel.classList.toggle('minimized', state.isPanelMinimized);

        dom.btnCollapse.innerHTML = state.isPanelMinimized
          ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`
          : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>`;
      });
    }
  }

  // =========================================================================
  // 10. Inicialización General
  // =========================================================================
  initMap();
  setupGeolocation();
  setupEventListeners();
  loadRoutes();
  registerServiceWorker();
});
