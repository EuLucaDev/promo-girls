(function () {
  var APP_CONFIG = window.RDG_CONFIG || {};
  var STORAGE_KEY = APP_CONFIG.storageKey || 'rdg_web_state_v2';
  var BOOTSTRAP_CACHE_KEY = APP_CONFIG.bootstrapCacheKey || 'rdg_bootstrap_cache_v1';
  var CLICK_METRICS_KEY = APP_CONFIG.clickMetricsKey || 'rdg_click_metrics_v1';
  var DATA_MODE = APP_CONFIG.mode || 'api';
  var API_BASE_URL = APP_CONFIG.apiBaseUrl || 'http://localhost:8787';
  var ENABLE_LOCAL_FALLBACK = APP_CONFIG.enableLocalFallback !== false;

  var TAB_LABEL = {
    dashboard: 'Dashboard',
    pendentes: 'Pendentes',
    aprovados: 'Aprovados',
    reprovados: 'Reprovados'
  };

  var THEME_PRESETS = {
    rose: {
      bg: '#fff0f6',
      bgSoft: '#ffd9ea',
      panel: '#fff8fb',
      brand: '#d63384',
      ink: '#2b1d29',
      line: '#e9bfd4',
      muted: '#7e5870',
      tableHeadBg: '#ffe7f2'
    },
    purple: {
      bg: '#f3efff',
      bgSoft: '#e5dcff',
      panel: '#faf8ff',
      brand: '#6f42c1',
      ink: '#211a33',
      line: '#cdbef2',
      muted: '#5c5378',
      tableHeadBg: '#eee7ff'
    }
  };

  var state = {
    activeTab: 'pendentes',
    ofertas: { pendentes: [], aprovados: [], reprovados: [] },
    config: configPadrao_()
  };

  function byId(id) { return document.getElementById(id); }

  function uid_() {
    return 'of_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
  }

  function esc(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showToast(message) {
    var toast = byId('toast');
    toast.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(function () { toast.classList.add('hidden'); }, 2600);
  }

  function formatDate(value) {
    if (!value) return '-';
    var d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleString('pt-BR');
  }

  function normalizarStatus_(status) {
    var s = String(status || '').trim().toUpperCase();
    if (s === 'APROVADO') return 'APROVADO';
    if (s === 'REPROVADO') return 'REPROVADO';
    return 'PENDENTE';
  }

  function abaPorStatus_(status) {
    var s = normalizarStatus_(status);
    if (s === 'APROVADO') return 'aprovados';
    if (s === 'REPROVADO') return 'reprovados';
    return 'pendentes';
  }

  function badgeClass(status) {
    var s = normalizarStatus_(status);
    if (s === 'APROVADO') return 'aprovado';
    if (s === 'REPROVADO') return 'reprovado';
    return 'pendente';
  }

  function badgePostadoClass_(postado) {
    return String(postado || '').trim().toUpperCase() === 'SIM'
      ? 'postado-sim'
      : 'postado-nao';
  }

  function asArray_(value) {
    return Array.isArray(value) ? value : [];
  }

  function asObject_(value, fallback) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    return fallback;
  }

  function normalizeStateShape_(payload) {
    var data = asObject_(payload, {});
    return {
      ofertas: {
        pendentes: asArray_(data.ofertas && data.ofertas.pendentes),
        aprovados: asArray_(data.ofertas && data.ofertas.aprovados),
        reprovados: asArray_(data.ofertas && data.ofertas.reprovados)
      },
      config: normalizarConfig_(asObject_(data.config, configPadrao_()))
    };
  }

  function applyServerState_(payload) {
    var normalized = normalizeStateShape_(payload);
    state.ofertas = normalized.ofertas;
    state.config = normalized.config;
    aplicarTema_(state.config.theme || {});
    atualizarTituloApp_();
    persistBootstrapCache_();
  }

  function persistBootstrapCache_() {
    try {
      localStorage.setItem(BOOTSTRAP_CACHE_KEY, JSON.stringify({
        ofertas: state.ofertas,
        config: state.config,
        savedAt: new Date().toISOString()
      }));
    } catch (_) {}
  }

  function readClickMetrics_() {
    try {
      var raw = localStorage.getItem(CLICK_METRICS_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return asObject_(parsed, {});
    } catch (_) {
      return {};
    }
  }

  function writeClickMetrics_(data) {
    try {
      localStorage.setItem(CLICK_METRICS_KEY, JSON.stringify(asObject_(data, {})));
    } catch (_) {}
  }

  function registerClick_(oferta, source) {
    if (!oferta) return;
    var key = String(oferta.id || oferta._uid || '');
    if (!key) return;

    var all = readClickMetrics_();
    var current = asObject_(all[key], {
      id: oferta.id || key,
      produto: oferta.produto || 'Produto',
      origemApi: oferta.origemApi || 'N/A',
      count: 0,
      lastClick: '',
      source: source || 'link'
    });

    current.count = Number(current.count || 0) + 1;
    current.lastClick = new Date().toISOString();
    current.source = source || current.source || 'link';
    current.produto = oferta.produto || current.produto;
    current.origemApi = oferta.origemApi || current.origemApi;

    all[key] = current;
    writeClickMetrics_(all);
  }

  function hydrateBootstrapCache_() {
    try {
      var raw = localStorage.getItem(BOOTSTRAP_CACHE_KEY);
      if (!raw) return false;
      var payload = JSON.parse(raw);
      if (!payload || (!payload.ofertas && !payload.config)) return false;
      applyServerState_(payload);
      return true;
    } catch (_) {
      return false;
    }
  }

  function applyResponseState_(result) {
    var payload = asObject_(result, {});
    if (payload.ofertas || payload.config) {
      applyServerState_(payload);
      return;
    }

    if (payload.data && (payload.data.ofertas || payload.data.config)) {
      applyServerState_(payload.data);
    }
  }

  function todasOfertas_() {
    return []
      .concat(state.ofertas.pendentes || [])
      .concat(state.ofertas.aprovados || [])
      .concat(state.ofertas.reprovados || []);
  }

  function atualizarTituloApp_() {
    var nome = state.config && state.config.planilha && state.config.planilha.displayName
      ? String(state.config.planilha.displayName)
      : 'Rei do Garimpo';
    document.title = nome + ' | App Web';
    var h1 = document.querySelector('h1');
    if (h1) h1.textContent = nome;
  }

  function aplicarTema_(theme) {
    theme = asObject_(theme, {});
    var preset = String(theme.preset || 'rose');
    var colors = asObject_(theme.colors, {});
    var base = THEME_PRESETS[preset] || THEME_PRESETS.rose;

    if (preset === 'custom') {
      base = {
        bg: colors.bg || THEME_PRESETS.rose.bg,
        bgSoft: colors.bgSoft || THEME_PRESETS.rose.bgSoft,
        panel: colors.panel || THEME_PRESETS.rose.panel,
        brand: colors.brand || THEME_PRESETS.rose.brand,
        ink: colors.ink || THEME_PRESETS.rose.ink,
        line: colors.line || THEME_PRESETS.rose.line,
        muted: colors.muted || THEME_PRESETS.rose.muted,
        tableHeadBg: colors.tableHeadBg || THEME_PRESETS.rose.tableHeadBg
      };
    }

    var root = document.documentElement;
    root.style.setProperty('--bg', base.bg);
    root.style.setProperty('--bg-soft', base.bgSoft);
    root.style.setProperty('--panel', base.panel);
    root.style.setProperty('--brand', base.brand);
    root.style.setProperty('--ink', base.ink);
    root.style.setProperty('--line', base.line);
    root.style.setProperty('--muted', base.muted);
    root.style.setProperty('--table-head-bg', base.tableHeadBg);
  }

  function setActiveTab(tab) {
    state.activeTab = tab;

    var buttons = document.querySelectorAll('.tab-btn');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle('active', buttons[i].dataset.tab === tab);
    }

    var isConfig = tab === 'config';
    var isDashboard = tab === 'dashboard';

    byId('viewDashboard').classList.toggle('hidden', !isDashboard);
    byId('viewOfertas').classList.toggle('hidden', isConfig || isDashboard);
    byId('viewConfig').classList.toggle('hidden', !isConfig);

    if (isDashboard) {
      renderDashboard();
      return;
    }

    if (!isConfig) {
      byId('tituloAba').textContent = TAB_LABEL[tab] || 'Pendentes';
      renderTabela();
    }
  }

  function renderStats() {
    var pendentes = state.ofertas.pendentes.length;
    var aprovados = state.ofertas.aprovados.length;
    var reprovados = state.ofertas.reprovados.length;
    var postados = state.ofertas.aprovados.filter(function (o) {
      return String(o.postado || '').toUpperCase() === 'SIM';
    }).length;

    byId('stats').innerHTML = [
      cardStat('Pendentes', pendentes, 'pendentes'),
      cardStat('Aprovados', aprovados, 'aprovados'),
      cardStat('Reprovados', reprovados, 'reprovados'),
      cardStat('Postados', postados, 'postados')
    ].join('');

    revealStagger_(byId('stats').querySelectorAll('.stat'), 80);
  }

  function cardStat(label, value, kind) {
    return '<article class="stat stat-' + esc(kind || '') + '"><strong>' + value + '</strong><small>' + label + '</small></article>';
  }

  function renderDashboard() {
    var allOffers = todasOfertas_();
    var clickMap = readClickMetrics_();
    var clickRows = Object.keys(clickMap).map(function (k) { return clickMap[k]; });
    clickRows.sort(function (a, b) { return Number(b.count || 0) - Number(a.count || 0); });

    var total = allOffers.length;
    var aprovados = state.ofertas.aprovados.length;
    var reprovados = state.ofertas.reprovados.length;
    var postados = state.ofertas.aprovados.filter(function (o) {
      return String(o.postado || '').toUpperCase() === 'SIM';
    }).length;
    var totalClicks = clickRows.reduce(function (sum, row) { return sum + Number(row.count || 0); }, 0);
    var aprovacaoPct = total ? Math.round((aprovados / total) * 100) : 0;

    byId('dashStats').innerHTML = [
      cardStat('Total Ofertas', total, 'pendentes'),
      cardStat('Aprovação (%)', aprovacaoPct + '%', 'aprovados'),
      cardStat('Reprovadas', reprovados, 'reprovados'),
      cardStat('Cliques', totalClicks, 'postados')
    ].join('');
    revealStagger_(byId('dashStats').querySelectorAll('.stat'), 80);

    var topBox = byId('dashTopClicks');
    if (!clickRows.length) {
      topBox.innerHTML = '<p class="muted-note">Sem cliques registrados ainda.</p>';
    } else {
      var maxCount = Number(clickRows[0].count || 1);
      topBox.innerHTML = clickRows.slice(0, 8).map(function (item) {
        var widthPct = Math.max(8, Math.round((Number(item.count || 0) / maxCount) * 100));
        return '<div class="metric-row">' +
          '<div class="metric-row-head"><strong>' + esc(item.produto || item.id) + '</strong><span>' + Number(item.count || 0) + '</span></div>' +
          '<div class="metric-bar"><span style="width:' + widthPct + '%"></span></div>' +
        '</div>';
      }).join('');
    }

    var origemCount = {};
    for (var i = 0; i < allOffers.length; i++) {
      var origem = String(allOffers[i].origemApi || 'N/A');
      origemCount[origem] = Number(origemCount[origem] || 0) + 1;
    }

    var origemRows = Object.keys(origemCount).map(function (origem) {
      return { origem: origem, total: origemCount[origem] };
    }).sort(function (a, b) { return b.total - a.total; });

    var origemBox = byId('dashOrigens');
    if (!origemRows.length) {
      origemBox.innerHTML = '<p class="muted-note">Sem dados de origem ainda.</p>';
    } else {
      var maxOrigem = Number(origemRows[0].total || 1);
      origemBox.innerHTML = origemRows.map(function (item) {
        var widthPct = Math.max(8, Math.round((Number(item.total || 0) / maxOrigem) * 100));
        return '<div class="metric-row">' +
          '<div class="metric-row-head"><strong>' + esc(item.origem) + '</strong><span>' + Number(item.total || 0) + '</span></div>' +
          '<div class="metric-bar metric-bar-alt"><span style="width:' + widthPct + '%"></span></div>' +
        '</div>';
      }).join('');
    }
  }

  function renderTabela() {
    var rows = state.ofertas[state.activeTab] || [];
    var wrap = byId('tableWrap');

    if (!rows.length) {
      wrap.innerHTML = '<div style="padding:12px">Nenhuma oferta nessa aba.</div>';
      return;
    }

    var html = '<table><thead><tr>' +
      '<th>ID</th><th>Origem/API</th><th>Produto</th><th>Categoria</th><th>Preço Por</th><th>Status</th><th>Postado</th><th>Imagem</th><th>Data Captura</th><th>Ações</th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var productUrl = String(r.linkAfiliado || r.linkOriginal || '').trim();
      var produto = esc(r.produto);
      if (productUrl) {
        produto = '<a href="' + esc(productUrl) + '" target="_blank" rel="noopener" data-track-click="' + esc(r._uid || '') + '">' + produto + '</a>';
      }

      var img = r.imagem
        ? '<a href="' + esc(r.imagem) + '" target="_blank" rel="noopener" data-track-click-img="' + esc(r._uid || '') + '">ver</a>'
        : '-';

      html += '<tr>' +
        '<td>' + esc(r.id) + '</td>' +
        '<td>' + esc(r.origemApi) + '</td>' +
        '<td>' + produto + '</td>' +
        '<td>' + esc(r.categoria) + '</td>' +
        '<td>' + esc(r.precoPor) + '</td>' +
        '<td><span class="badge ' + badgeClass(r.status) + '">' + esc(r.status) + '</span></td>' +
        '<td><span class="badge ' + badgePostadoClass_(r.postado) + '">' + esc(r.postado || 'NÃO') + '</span></td>' +
        '<td>' + img + '</td>' +
        '<td>' + esc(formatDate(r.dataCaptura)) + '</td>' +
        '<td><button class="btn" data-edit="' + r._uid + '">Editar</button> <button class="btn" data-delete="' + r._uid + '">Excluir</button></td>' +
      '</tr>';
    }

    html += '</tbody></table>';
    wrap.innerHTML = html;

    revealStagger_(wrap.querySelectorAll('tbody tr'), 36);

    var editButtons = wrap.querySelectorAll('[data-edit]');
    for (var e = 0; e < editButtons.length; e++) {
      editButtons[e].addEventListener('click', function () {
        var uid = this.dataset.edit;
        abrirModal(buscarOfertaPorUid_(uid));
      });
    }

    var deleteButtons = wrap.querySelectorAll('[data-delete]');
    for (var d = 0; d < deleteButtons.length; d++) {
      deleteButtons[d].addEventListener('click', function () {
        excluirOferta(this.dataset.delete);
      });
    }

    var trackedProductLinks = wrap.querySelectorAll('[data-track-click]');
    for (var t = 0; t < trackedProductLinks.length; t++) {
      trackedProductLinks[t].addEventListener('click', function () {
        registerClick_(buscarOfertaPorUid_(this.dataset.trackClick), 'produto');
      });
    }

    var trackedImageLinks = wrap.querySelectorAll('[data-track-click-img]');
    for (var ti = 0; ti < trackedImageLinks.length; ti++) {
      trackedImageLinks[ti].addEventListener('click', function () {
        registerClick_(buscarOfertaPorUid_(this.dataset.trackClickImg), 'imagem');
      });
    }
  }

  function revealStagger_(nodeList, gapMs) {
    var items = Array.prototype.slice.call(nodeList || []);
    var gap = Number(gapMs || 60);
    for (var i = 0; i < items.length; i++) {
      (function (el, idx) {
        el.classList.remove('is-visible');
        setTimeout(function () {
          el.classList.add('is-visible');
        }, idx * gap);
      })(items[i], i);
    }
  }

  function buscarOfertaPorUid_(uid) {
    var all = todasOfertas_();
    for (var i = 0; i < all.length; i++) {
      if (all[i]._uid === uid) return all[i];
    }
    return null;
  }

  function preencherCampo(id, value) {
    byId(id).value = value == null ? '' : value;
  }

  function abrirModal(oferta) {
    var isEdit = !!oferta;
    var defaultStatus = state.activeTab === 'aprovados'
      ? 'APROVADO'
      : (state.activeTab === 'reprovados' ? 'REPROVADO' : 'PENDENTE');

    byId('modalTitulo').textContent = isEdit ? 'Editar Oferta' : 'Nova Oferta';

    preencherCampo('ofRow', isEdit ? oferta._uid : '');
    preencherCampo('ofAba', isEdit ? oferta.aba : '');
    preencherCampo('ofId', isEdit ? oferta.id : '');
    preencherCampo('ofOrigemApi', isEdit ? oferta.origemApi : 'Manual');
    preencherCampo('ofLoja', isEdit ? oferta.loja : '');
    preencherCampo('ofProduto', isEdit ? oferta.produto : '');
    preencherCampo('ofCategoria', isEdit ? oferta.categoria : '');
    preencherCampo('ofPrecoDe', isEdit ? oferta.precoDe : '');
    preencherCampo('ofPrecoPor', isEdit ? oferta.precoPor : '');
    preencherCampo('ofCupom', isEdit ? oferta.cupom : '');
    preencherCampo('ofFrete', isEdit ? oferta.frete : '');
    preencherCampo('ofAvaliacao', isEdit ? oferta.avaliacao : '');
    preencherCampo('ofBeneficios', isEdit ? oferta.beneficios : '');
    preencherCampo('ofObservacao', isEdit ? oferta.observacao : '');
    preencherCampo('ofLinkOriginal', isEdit ? oferta.linkOriginal : '');
    preencherCampo('ofLinkAfiliado', isEdit ? oferta.linkAfiliado : '');
    preencherCampo('ofImagem', isEdit ? oferta.imagem : '');
    preencherCampo('ofStatus', isEdit ? oferta.status : defaultStatus);
    preencherCampo('ofPrioridade', isEdit ? oferta.prioridade : 'MÉDIA');

    atualizarPreviewImagem();
    byId('modalOferta').classList.remove('hidden');
  }

  function fecharModal() {
    byId('modalOferta').classList.add('hidden');
  }

  function atualizarPreviewImagem() {
    var url = String(byId('ofImagem').value || '').trim();
    var box = byId('imagePreviewBox');

    if (!url) {
      box.innerHTML = 'Sem imagem. Você pode colar uma URL para pré-visualizar.';
      return;
    }

    box.innerHTML = '<a href="' + esc(url) + '" target="_blank">Abrir URL da imagem</a><img src="' + esc(url) + '" alt="preview" />';
  }

  function coletarPayloadOferta() {
    return {
      _uid: byId('ofRow').value || uid_(),
      id: byId('ofId').value,
      origemApi: byId('ofOrigemApi').value,
      loja: byId('ofLoja').value,
      produto: byId('ofProduto').value,
      categoria: byId('ofCategoria').value,
      precoDe: byId('ofPrecoDe').value,
      precoPor: byId('ofPrecoPor').value,
      cupom: byId('ofCupom').value,
      frete: byId('ofFrete').value,
      avaliacao: byId('ofAvaliacao').value,
      beneficios: byId('ofBeneficios').value,
      observacao: byId('ofObservacao').value,
      linkOriginal: byId('ofLinkOriginal').value,
      linkAfiliado: byId('ofLinkAfiliado').value,
      imagem: byId('ofImagem').value,
      status: normalizarStatus_(byId('ofStatus').value),
      prioridade: byId('ofPrioridade').value,
      postado: 'NÃO',
      dataCaptura: new Date().toISOString(),
      dataPostagem: '',
      postTelegram: ''
    };
  }

  async function salvarOferta(event) {
    event.preventDefault();
    try {
      var payload = coletarPayloadOferta();
      var result = await dataGateway.saveOferta(payload);
      applyResponseState_(result);
      renderStats();
      renderTabela();
      fecharModal();
      showToast(result.message || 'Oferta salva com sucesso.');
    } catch (err) {
      showToast('Erro ao salvar oferta: ' + err.message);
    }
  }

  async function excluirOferta(uid) {
    var oferta = buscarOfertaPorUid_(uid);
    if (!oferta) return;
    if (!confirm('Excluir oferta ' + (oferta.id || oferta.produto || '') + '?')) return;

    try {
      var result = await dataGateway.deleteOferta(uid);
      applyResponseState_(result);
      renderStats();
      renderTabela();
      showToast(result.message || 'Oferta excluída.');
    } catch (err) {
      showToast('Erro ao excluir oferta: ' + err.message);
    }
  }

  function channelRowHtml(c, index) {
    c = c || {};
    function v(x) { return esc(x == null ? '' : x); }
    function selected(value, option) { return value === option ? 'selected' : ''; }

    return '<tr data-channel-row="' + index + '">' +
      '<td><input type="checkbox" data-cfield="ativo" ' + (c.ativo ? 'checked' : '') + ' /></td>' +
      '<td><input type="text" class="c-input-sm" data-cfield="id" value="' + v(c.id) + '" /></td>' +
      '<td><select data-cfield="tipo">' +
      '<option value="telegram" ' + selected(c.tipo, 'telegram') + '>telegram</option>' +
      '<option value="whatsapp_oficial" ' + selected(c.tipo, 'whatsapp_oficial') + '>whatsapp_oficial</option>' +
      '<option value="whatsapp_grupo_manual" ' + selected(c.tipo, 'whatsapp_grupo_manual') + '>whatsapp_grupo_manual</option>' +
      '</select></td>' +
      '<td><input type="text" class="c-input-md" data-cfield="nome" value="' + v(c.nome) + '" /></td>' +
      '<td><input type="text" class="c-input-md" data-cfield="destino" value="' + v(c.destino) + '" /></td>' +
      '<td><textarea class="c-input-json" data-cfield="configAuthJson" rows="2" placeholder="{\"token\":\"...\"}">' + v(JSON.stringify(asObject_(c.configAuth, {}))) + '</textarea></td>' +
      '<td><button class="btn" data-remove-channel="' + index + '">Remover</button></td>' +
      '</tr>';
  }

  function providerRowHtml(provider, index) {
    provider = provider || {};

    function val(v) { return esc(v == null ? '' : v); }
    function selected(value, option) { return value === option ? 'selected' : ''; }

    return '<tr data-provider-row="' + index + '">' +
      '<td><input type="checkbox" data-pfield="ativo" ' + (provider.ativo ? 'checked' : '') + ' /></td>' +
      '<td><input type="text" class="p-input-sm" data-pfield="id" value="' + val(provider.id) + '" /></td>' +
      '<td><input type="text" class="p-input-md" data-pfield="nome" value="' + val(provider.nome) + '" /></td>' +
      '<td><select data-pfield="tipo">' +
      '<option value="shopee" ' + selected(provider.tipo, 'shopee') + '>shopee</option>' +
      '<option value="amazon" ' + selected(provider.tipo, 'amazon') + '>amazon</option>' +
      '<option value="mercadolivre" ' + selected(provider.tipo, 'mercadolivre') + '>mercadolivre</option>' +
      '<option value="custom_json" ' + selected(provider.tipo, 'custom_json') + '>custom_json</option>' +
      '<option value="mock" ' + selected(provider.tipo, 'mock') + '>mock</option>' +
      '<option value="manual" ' + selected(provider.tipo, 'manual') + '>manual</option>' +
      '</select></td>' +
      '<td><input type="text" class="p-input-lg" data-pfield="endpoint" value="' + val(provider.endpoint) + '" /></td>' +
      '<td><select data-pfield="method">' +
      '<option value="GET" ' + selected(provider.method, 'GET') + '>GET</option>' +
      '<option value="POST" ' + selected(provider.method, 'POST') + '>POST</option>' +
      '</select></td>' +
      '<td><select data-pfield="authType">' +
      '<option value="none" ' + selected(provider.authType, 'none') + '>none</option>' +
      '<option value="bearer" ' + selected(provider.authType, 'bearer') + '>bearer</option>' +
      '<option value="app_keys" ' + selected(provider.authType, 'app_keys') + '>app_keys</option>' +
      '</select></td>' +
      '<td><input type="password" class="p-input-md" data-pfield="token" value="' + val(provider.token) + '" /></td>' +
      '<td><input type="text" class="p-input-md" data-pfield="tokenProperty" value="' + val(provider.tokenProperty) + '" placeholder="AMAZON_TOKEN" /></td>' +
      '<td><input type="text" class="p-input-sm" data-pfield="appId" value="' + val(provider.appId) + '" /></td>' +
      '<td><input type="text" class="p-input-md" data-pfield="appIdProperty" value="' + val(provider.appIdProperty) + '" placeholder="AMAZON_APP_ID" /></td>' +
      '<td><input type="password" class="p-input-sm" data-pfield="appSecret" value="' + val(provider.appSecret) + '" /></td>' +
      '<td><input type="text" class="p-input-md" data-pfield="appSecretProperty" value="' + val(provider.appSecretProperty) + '" placeholder="AMAZON_APP_SECRET" /></td>' +
      '<td><textarea class="p-input-json" data-pfield="headersJson" rows="2" placeholder="{\"x-key\":\"abc\"}">' + val(provider.headersJson) + '</textarea></td>' +
      '<td><textarea class="p-input-json" data-pfield="queryOrBody" rows="2" placeholder="{\"keyword\":\"fone\"}">' + val(provider.queryOrBody) + '</textarea></td>' +
      '<td><button class="btn" data-remove-provider="' + index + '">Remover</button></td>' +
      '</tr>';
  }

  function renderConfig() {
    var cfg = normalizarConfig_(state.config);
    var filtros = cfg.filtros || {};
    var planilha = cfg.planilha || {};
    var theme = cfg.theme || {};
    var colors = theme.colors || {};

    byId('cfgSpreadsheetId').value = planilha.spreadsheetId || '';
    byId('cfgDisplayName').value = planilha.displayName || '';
    byId('cfgThemePreset').value = theme.preset || 'rose';
    byId('cfgSendAllActive').value = cfg.publicacao && cfg.publicacao.sendToAllActive ? 'true' : 'false';

    byId('cfgColorBg').value = colors.bg || '#fff0f6';
    byId('cfgColorPanel').value = colors.panel || '#fff8fb';
    byId('cfgColorBrand').value = colors.brand || '#d63384';
    byId('cfgColorInk').value = colors.ink || '#2b1d29';

    byId('cfgPrecoMin').value = filtros.precoMin || '';
    byId('cfgPrecoMax').value = filtros.precoMax || '';
    byId('cfgKeywords').value = filtros.keywords || '';
    byId('cfgSegmentos').value = (filtros.segmentos || []).join(',');

    var ctbody = byId('channelsTable').querySelector('tbody');
    var canais = cfg.canais || [];
    ctbody.innerHTML = canais.map(function (c, i) {
      return channelRowHtml(c, i);
    }).join('');
    if (!canais.length) {
      ctbody.innerHTML = '<tr><td colspan="7"><div class="empty-row">Nenhum canal cadastrado.</div></td></tr>';
    }

    var removeChannels = ctbody.querySelectorAll('[data-remove-channel]');
    for (var i = 0; i < removeChannels.length; i++) {
      removeChannels[i].addEventListener('click', function () {
        var idx = Number(this.dataset.removeChannel);
        state.config.canais.splice(idx, 1);
        renderConfig();
      });
    }

    var ptbody = byId('providersTable').querySelector('tbody');
    var providers = cfg.providers || [];
    ptbody.innerHTML = providers.map(function (p, i) {
      return providerRowHtml(p, i);
    }).join('');
    if (!providers.length) {
      ptbody.innerHTML = '<tr><td colspan="16"><div class="empty-row">Nenhum provedor cadastrado.</div></td></tr>';
    }

    var removeProviders = ptbody.querySelectorAll('[data-remove-provider]');
    for (var j = 0; j < removeProviders.length; j++) {
      removeProviders[j].addEventListener('click', function () {
        var idx = Number(this.dataset.removeProvider);
        state.config.providers.splice(idx, 1);
        renderConfig();
      });
    }
  }

  function parseJsonSafe_(raw, fallback) {
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch (_) { return fallback; }
  }

  function coletarConfigDaTela() {
    var canaisRows = byId('channelsTable').querySelectorAll('tbody tr');
    var canais = [];

    for (var i = 0; i < canaisRows.length; i++) {
      var crow = canaisRows[i];
      var channel = {};
      var cfields = crow.querySelectorAll('[data-cfield]');

      for (var cf = 0; cf < cfields.length; cf++) {
        var cel = cfields[cf];
        var ckey = cel.dataset.cfield;

        if (ckey === 'configAuthJson') {
          channel.configAuth = parseJsonSafe_(cel.value, {});
        } else {
          channel[ckey] = cel.type === 'checkbox' ? cel.checked : String(cel.value || '').trim();
        }
      }

      canais.push(channel);
    }

    var providerRows = byId('providersTable').querySelectorAll('tbody tr');
    var providers = [];

    for (var r = 0; r < providerRows.length; r++) {
      var row = providerRows[r];
      var provider = {};
      var fields = row.querySelectorAll('[data-pfield]');

      for (var f = 0; f < fields.length; f++) {
        var el = fields[f];
        var key = el.dataset.pfield;
        provider[key] = el.type === 'checkbox' ? el.checked : String(el.value || '').trim();
      }

      providers.push(provider);
    }

    return {
      planilha: {
        spreadsheetId: byId('cfgSpreadsheetId').value.trim(),
        displayName: byId('cfgDisplayName').value.trim()
      },
      theme: {
        preset: byId('cfgThemePreset').value,
        colors: {
          bg: byId('cfgColorBg').value,
          panel: byId('cfgColorPanel').value,
          brand: byId('cfgColorBrand').value,
          ink: byId('cfgColorInk').value
        }
      },
      filtros: {
        precoMin: byId('cfgPrecoMin').value,
        precoMax: byId('cfgPrecoMax').value,
        keywords: byId('cfgKeywords').value,
        segmentos: byId('cfgSegmentos').value.split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s; })
      },
      publicacao: {
        sendToAllActive: byId('cfgSendAllActive').value === 'true'
      },
      canais: canais,
      providers: providers
    };
  }

  async function salvarConfig() {
    try {
      var config = normalizarConfig_(coletarConfigDaTela());
      var result = await dataGateway.saveConfig(config);
      applyResponseState_(result);
      renderConfig();
      renderStats();
      renderTabela();
      renderDashboard();
      showToast(result.message || 'Configurações salvas.');
    } catch (err) {
      showToast('Erro ao salvar configurações: ' + err.message);
    }
  }

  function adicionarCanal() {
    state.config.canais = state.config.canais || [];
    state.config.canais.push({
      id: '', tipo: 'telegram', nome: '', destino: '', ativo: false, configAuth: {}
    });
    renderConfig();
  }

  function adicionarProvider() {
    state.config.providers = state.config.providers || [];
    state.config.providers.push({
      id: '', nome: '', ativo: false, tipo: 'custom_json', endpoint: '', method: 'GET', authType: 'none',
      token: '', tokenProperty: '', appId: '', appIdProperty: '', appSecret: '', appSecretProperty: '', headersJson: '', queryOrBody: ''
    });
    renderConfig();
  }

  async function importarAPIsAtivas() {
    try {
      var result = await dataGateway.importProviders();
      applyResponseState_(result);
      renderStats();
      renderTabela();
      renderDashboard();
      showToast(result.message || 'Importação concluída.');
    } catch (err) {
      showToast('Falha na importação: ' + err.message);
    }
  }

  async function publicarAprovados() {
    try {
      var result = await dataGateway.publishApproved();
      applyResponseState_(result);
      renderStats();
      renderTabela();
      renderDashboard();
      showToast(result.message || 'Publicação executada.');
    } catch (err) {
      showToast('Erro ao publicar aprovados: ' + err.message);
    }
  }

  async function refreshData() {
    try {
      var result = await dataGateway.bootstrap();
      applyResponseState_(result);
      renderStats();
      renderTabela();
      renderConfig();
      renderDashboard();
      showToast('Dados atualizados.');
    } catch (err) {
      showToast('Erro ao atualizar dados: ' + err.message);
    }
  }

  function renderTelaInicial_() {
    renderStats();
    renderDashboard();
    renderConfig();
    setActiveTab(state.activeTab || 'pendentes');
  }

  function unlockUi_() {
    if (document.body) document.body.classList.remove('app-loading');
  }

  function configPadrao_() {
    return {
      planilha: {
        spreadsheetId: '',
        displayName: 'Rei do Garimpo'
      },
      theme: {
        preset: 'rose',
        colors: {
          bg: '#fff0f6',
          panel: '#fff8fb',
          brand: '#d63384',
          ink: '#2b1d29'
        },
        sheetTheme: {
          pendentesBg: '#fff2cc',
          aprovadosBg: '#d9ead3',
          reprovadosBg: '#f4cccc',
          headerBg: '#f4c542'
        }
      },
      filtros: {
        precoMin: '',
        precoMax: '',
        segmentos: ['Eletrônicos', 'Casa'],
        keywords: ''
      },
      publicacao: {
        sendToAllActive: true
      },
      canais: [
        {
          id: 'telegram_main',
          tipo: 'telegram',
          nome: 'Telegram Principal',
          destino: '',
          ativo: false,
          configAuth: {
            token: ''
          }
        },
        {
          id: 'whatsapp_manual',
          tipo: 'whatsapp_grupo_manual',
          nome: 'WhatsApp Grupo Manual',
          destino: '',
          ativo: false,
          configAuth: {}
        }
      ],
      providers: [
        {
          id: 'shopee', nome: 'Shopee', ativo: true, tipo: 'shopee', endpoint: 'https://open-api.affiliate.shopee.com.br/graphql', method: 'POST',
          authType: 'app_keys', token: '', tokenProperty: '', appId: '', appIdProperty: 'SHOPEE_APP_ID', appSecret: '', appSecretProperty: 'SHOPEE_SECRET',
          headersJson: '{"Content-Type":"application/json"}',
          queryOrBody: '{"query":"{ productOfferV2(sortType:2,page:1,limit:20){ nodes { productId itemId productName itemName shopName categoryName price priceMin priceMax originalPrice commissionRate imageUrl productLink offerLink ratingStar } pageInfo { page limit hasNextPage } } }"}'
        },
        {
          id: 'amazon', nome: 'Amazon', ativo: false, tipo: 'amazon', endpoint: '', method: 'GET',
          authType: 'bearer', token: '', tokenProperty: 'AMAZON_TOKEN', appId: '', appIdProperty: '', appSecret: '', appSecretProperty: '', headersJson: '', queryOrBody: ''
        },
        {
          id: 'mercado_livre', nome: 'Mercado Livre', ativo: false, tipo: 'mercadolivre', endpoint: '', method: 'GET',
          authType: 'bearer', token: '', tokenProperty: 'MERCADOLIVRE_TOKEN', appId: '', appIdProperty: '', appSecret: '', appSecretProperty: '', headersJson: '', queryOrBody: ''
        },
        {
          id: 'custom_teste', nome: 'Custom Teste (DummyJSON)', ativo: false, tipo: 'custom_json', endpoint: 'https://dummyjson.com/products', method: 'GET',
          authType: 'none', token: '', tokenProperty: '', appId: '', appIdProperty: '', appSecret: '', appSecretProperty: '', headersJson: '', queryOrBody: '{"limit":20}'
        },
        {
          id: 'mock_teste', nome: 'Mock Teste (Interno)', ativo: false, tipo: 'mock', endpoint: '', method: 'GET',
          authType: 'none', token: '', tokenProperty: '', appId: '', appIdProperty: '', appSecret: '', appSecretProperty: '', headersJson: '', queryOrBody: '{"limit":10}'
        }
      ]
    };
  }

  function normalizarConfig_(cfg) {
    var c = asObject_(cfg, {});
    var d = configPadrao_();

    c.planilha = asObject_(c.planilha, {});
    c.theme = asObject_(c.theme, {});
    c.theme.colors = asObject_(c.theme.colors, {});
    c.theme.sheetTheme = asObject_(c.theme.sheetTheme, d.theme.sheetTheme);
    c.filtros = asObject_(c.filtros, {});
    c.publicacao = asObject_(c.publicacao, {});

    c.providers = asArray_(c.providers);
    c.canais = asArray_(c.canais);

    if (!Array.isArray(c.filtros.segmentos)) c.filtros.segmentos = [];

    if (!c.planilha.displayName) c.planilha.displayName = d.planilha.displayName;
    if (!c.theme.preset) c.theme.preset = d.theme.preset;

    if (!c.theme.colors.bg) c.theme.colors.bg = d.theme.colors.bg;
    if (!c.theme.colors.panel) c.theme.colors.panel = d.theme.colors.panel;
    if (!c.theme.colors.brand) c.theme.colors.brand = d.theme.colors.brand;
    if (!c.theme.colors.ink) c.theme.colors.ink = d.theme.colors.ink;

    if (typeof c.publicacao.sendToAllActive !== 'boolean') {
      c.publicacao.sendToAllActive = true;
    }

    return c;
  }

  function createApiGateway_() {
    function isAppsScriptWebAppUrl_() {
      return API_BASE_URL.indexOf('script.google.com/macros/s/') >= 0;
    }

    function resolveUrl_(path) {
      var route = String(path || '/bootstrap').replace(/^\//, '');
      if (API_BASE_URL.indexOf('/exec') >= 0 || API_BASE_URL.indexOf('/dev') >= 0) {
        return API_BASE_URL + '?route=' + encodeURIComponent(route);
      }

      return API_BASE_URL.replace(/\/$/, '') + '/' + route;
    }

    function request(path, options) {
      var url = resolveUrl_(path);
      var opt = options || {};
      var headers = opt.headers || {};

      // Avoid CORS preflight issues with Apps Script when frontend runs on GitHub Pages.
      // For Apps Script URLs, keep request as a simple POST (no explicit JSON content-type).
      if (!isAppsScriptWebAppUrl_() && !headers['Content-Type'] && opt.body) {
        headers['Content-Type'] = 'application/json';
      }

      return fetch(url, {
        method: opt.method || 'GET',
        headers: headers,
        body: opt.body
      }).then(function (res) {
        return res.text().then(function (text) {
          var json = {};
          try {
            json = text ? JSON.parse(text) : {};
          } catch (_) {
            json = {};
          }

          if (!res.ok) {
            var msg = json.message || ('HTTP ' + res.status + ' em ' + path);
            throw new Error(msg);
          }

          return json;
        });
      });
    }

    return {
      bootstrap: function () {
        return request('/bootstrap');
      },
      saveOferta: function (oferta) {
        return request('/ofertas/save', {
          method: 'POST',
          body: JSON.stringify({ oferta: oferta })
        });
      },
      deleteOferta: function (uid) {
        return request('/ofertas/delete', {
          method: 'POST',
          body: JSON.stringify({ uid: uid })
        });
      },
      saveConfig: function (config) {
        return request('/config/save', {
          method: 'POST',
          body: JSON.stringify({ config: config })
        });
      },
      importProviders: function () {
        return request('/import', { method: 'POST', body: JSON.stringify({}) });
      },
      publishApproved: function () {
        return request('/publish', { method: 'POST', body: JSON.stringify({}) });
      }
    };
  }

  function createLocalGateway_() {
    function loadState_() {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        var blank = {
          ofertas: { pendentes: [], aprovados: [], reprovados: [] },
          config: configPadrao_()
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(blank));
        return blank;
      }

      try {
        return normalizeStateShape_(JSON.parse(raw));
      } catch (_) {
        return {
          ofertas: { pendentes: [], aprovados: [], reprovados: [] },
          config: configPadrao_()
        };
      }
    }

    function saveState_(data) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    function response_(data, message) {
      return {
        ofertas: data.ofertas,
        config: data.config,
        message: message || ''
      };
    }

    return {
      bootstrap: function () {
        return Promise.resolve(response_(loadState_(), 'Modo local ativo.'));
      },
      saveOferta: function (oferta) {
        var data = loadState_();
        var payload = asObject_(oferta, {});

        ['pendentes', 'aprovados', 'reprovados'].forEach(function (aba) {
          data.ofertas[aba] = data.ofertas[aba].filter(function (o) {
            return o._uid !== payload._uid;
          });
        });

        var abaNova = abaPorStatus_(payload.status);
        data.ofertas[abaNova].unshift(payload);
        saveState_(data);
        return Promise.resolve(response_(data, 'Oferta salva (local).'));
      },
      deleteOferta: function (uid) {
        var data = loadState_();
        ['pendentes', 'aprovados', 'reprovados'].forEach(function (aba) {
          data.ofertas[aba] = data.ofertas[aba].filter(function (o) {
            return o._uid !== uid;
          });
        });
        saveState_(data);
        return Promise.resolve(response_(data, 'Oferta excluída (local).'));
      },
      saveConfig: function (config) {
        var data = loadState_();
        data.config = normalizarConfig_(config);
        saveState_(data);
        return Promise.resolve(response_(data, 'Configurações salvas (local).'));
      },
      importProviders: function () {
        var data = loadState_();
        return Promise.resolve(response_(data, 'Importação local simulada.'));
      },
      publishApproved: function () {
        var data = loadState_();
        var enviados = 0;

        for (var i = 0; i < data.ofertas.aprovados.length; i++) {
          if (String(data.ofertas.aprovados[i].postado || '').toUpperCase() === 'SIM') continue;
          data.ofertas.aprovados[i].postado = 'SIM';
          data.ofertas.aprovados[i].dataPostagem = new Date().toISOString();
          enviados += 1;
        }

        saveState_(data);
        return Promise.resolve(response_(data, 'Publicação local simulada: ' + enviados));
      }
    };
  }

  function createDataGateway_() {
    var local = createLocalGateway_();
    if (DATA_MODE === 'local') return local;

    var api = createApiGateway_();
    if (!ENABLE_LOCAL_FALLBACK) return api;

    return {
      bootstrap: function () { return api.bootstrap().catch(function () { showToast('API indisponível, fallback local.'); return local.bootstrap(); }); },
      saveOferta: function (x) { return api.saveOferta(x).catch(function () { return local.saveOferta(x); }); },
      deleteOferta: function (x) { return api.deleteOferta(x).catch(function () { return local.deleteOferta(x); }); },
      saveConfig: function (x) { return api.saveConfig(x).catch(function () { return local.saveConfig(x); }); },
      importProviders: function () { return api.importProviders().catch(function () { return local.importProviders(); }); },
      publishApproved: function () { return api.publishApproved().catch(function () { return local.publishApproved(); }); }
    };
  }

  function bindEvents() {
    var tabs = document.querySelectorAll('.tab-btn');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () {
        setActiveTab(this.dataset.tab);
      });
    }

    byId('btnNovaOferta').addEventListener('click', function () { abrirModal(null); });
    byId('btnFecharModal').addEventListener('click', fecharModal);
    byId('formOferta').addEventListener('submit', salvarOferta);
    byId('ofImagem').addEventListener('input', atualizarPreviewImagem);

    byId('btnRefresh').addEventListener('click', refreshData);
    byId('btnImport').addEventListener('click', importarAPIsAtivas);
    byId('btnPublicar').addEventListener('click', publicarAprovados);

    byId('btnAddCanal').addEventListener('click', adicionarCanal);
    byId('btnAddProvider').addEventListener('click', adicionarProvider);
    byId('btnSalvarConfig').addEventListener('click', salvarConfig);

    byId('cfgThemePreset').addEventListener('change', function () {
      var preset = this.value;
      var base = THEME_PRESETS[preset] || THEME_PRESETS.rose;
      if (preset !== 'custom') {
        byId('cfgColorBg').value = base.bg;
        byId('cfgColorPanel').value = base.panel;
        byId('cfgColorBrand').value = base.brand;
        byId('cfgColorInk').value = base.ink;
      }

      aplicarTema_({
        preset: preset,
        colors: {
          bg: byId('cfgColorBg').value,
          panel: byId('cfgColorPanel').value,
          brand: byId('cfgColorBrand').value,
          ink: byId('cfgColorInk').value
        }
      });

      state.config.theme = state.config.theme || {};
      state.config.theme.preset = preset;
    });

    ['cfgColorBg', 'cfgColorPanel', 'cfgColorBrand', 'cfgColorInk'].forEach(function (id) {
      byId(id).addEventListener('input', function () {
        byId('cfgThemePreset').value = 'custom';
        aplicarTema_({
          preset: 'custom',
          colors: {
            bg: byId('cfgColorBg').value,
            panel: byId('cfgColorPanel').value,
            brand: byId('cfgColorBrand').value,
            ink: byId('cfgColorInk').value
          }
        });
      });
    });
  }

  var dataGateway = createDataGateway_();

  hydrateBootstrapCache_();
  bindEvents();
  renderTelaInicial_();
  unlockUi_();
  refreshData();
})();
