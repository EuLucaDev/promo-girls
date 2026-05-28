/**
 * Rei do Garimpo - Backend Apps Script
 * API Routes:
 * - GET  ?route=bootstrap
 * - POST ?route=bootstrap
 * - POST ?route=ofertas/save
 * - POST ?route=ofertas/delete
 * - POST ?route=config/save
 * - POST ?route=import
 * - POST ?route=publish
 */

var ABA_PENDENTES = 'Pendentes';
var ABA_APROVADOS = 'Aprovados';
var ABA_REPROVADOS = 'Reprovados';
var ABA_CONFIG = 'Config';
var ABA_LOGS = 'Logs';

var COL_ID = 1;
var COL_DATA_CAPTURA = 2;
var COL_ORIGEM_API = 3;
var COL_LOJA = 4;
var COL_PRODUTO = 5;
var COL_CATEGORIA = 6;
var COL_PRECO_DE = 7;
var COL_PRECO_POR = 8;
var COL_CUPOM = 9;
var COL_FRETE = 10;
var COL_AVALIACAO = 11;
var COL_BENEFICIOS = 12;
var COL_OBSERVACAO = 13;
var COL_LINK_ORIGINAL = 14;
var COL_LINK_AFILIADO = 15;
var COL_IMAGEM = 16;
var COL_STATUS = 17;
var COL_PRIORIDADE = 18;
var COL_POSTADO = 19;
var COL_DATA_POSTAGEM = 20;
var COL_POST_TELEGRAM = 21;
var TOTAL_COLUNAS = 21;

var HEADERS = [
  'ID', 'Data captura', 'Origem/API', 'Loja', 'Produto', 'Categoria',
  'Preço De', 'Preço Por', 'Cupom', 'Frete', 'Avaliação', 'Benefícios',
  'Observação', 'Link original', 'Link afiliado', 'Imagem', 'Status',
  'Prioridade', 'Postado', 'Data postagem', 'Post Telegram'
];

var PROP_CONFIG_JSON = 'RDG_CONFIG_JSON';
var PROP_SPREADSHEET_ID = 'RDG_SPREADSHEET_ID';

function doGet(e) {
  return handleRequest_(e, 'GET');
}

function doPost(e) {
  return handleRequest_(e, 'POST');
}

function handleRequest_(e, method) {
  try {
    var body = parseBody_(e);
    var route = resolveRoute_(e, body);

    var result;
    if (route === 'bootstrap') {
      result = bootstrap_();
    } else if (route === 'ofertas/save') {
      result = saveOferta_(body.oferta || {});
    } else if (route === 'ofertas/delete') {
      result = deleteOferta_(body.uid || '');
    } else if (route === 'config/save') {
      result = saveConfig_(body.config || {});
    } else if (route === 'import') {
      result = importarProviders_();
    } else if (route === 'publish') {
      result = publicarAprovados_();
    } else {
      result = {
        message: 'Rota inválida: ' + route,
        ofertas: { pendentes: [], aprovados: [], reprovados: [] },
        config: configPadrao_()
      };
    }

    return jsonOut_(result);
  } catch (err) {
    logErro_('handleRequest', err);
    return jsonOut_({
      message: 'Erro interno: ' + (err && err.message ? err.message : String(err)),
      ofertas: { pendentes: [], aprovados: [], reprovados: [] },
      config: configPadrao_()
    });
  }
}

function resolveRoute_(e, body) {
  var p = e && e.parameter ? e.parameter : {};
  var route = String(p.route || body.route || 'bootstrap').trim();
  route = route.replace(/^\/+/, '');
  return route;
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  try {
    return JSON.parse(e.postData.contents);
  } catch (_) {
    return {};
  }
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function bootstrap_() {
  var ss = getSpreadsheet_();
  ensureStructure_(ss);

  var config = getConfig_();
  applySpreadsheetBranding_(ss, config);

  return {
    ofertas: listarOfertas_(ss),
    config: config,
    message: 'Bootstrap concluído.'
  };
}

function saveConfig_(configRaw) {
  var ss = getSpreadsheet_();
  ensureStructure_(ss);

  var config = normalizarConfig_(configRaw);

  if (config.planilha && config.planilha.spreadsheetId) {
    PropertiesService.getScriptProperties().setProperty(PROP_SPREADSHEET_ID, config.planilha.spreadsheetId);
    ss = SpreadsheetApp.openById(config.planilha.spreadsheetId);
    ensureStructure_(ss);
  }

  setConfig_(config);
  applySpreadsheetBranding_(ss, config);

  return {
    ofertas: listarOfertas_(ss),
    config: config,
    message: 'Configuração salva com sucesso.'
  };
}

function saveOferta_(ofertaRaw) {
  var ss = getSpreadsheet_();
  ensureStructure_(ss);

  var oferta = normalizarOferta_(ofertaRaw);
  var uid = String(oferta._uid || '');
  var targetSheetName = statusToSheet_(oferta.status);

  if (uid.indexOf(':') > 0) {
    var parts = uid.split(':');
    var sourceSheetName = parts[0];
    var sourceRow = Number(parts[1]);

    if (sourceRow >= 2) {
      var sourceSheet = ss.getSheetByName(sourceSheetName);
      if (sourceSheet && sourceSheet.getLastRow() >= sourceRow) {
        var linha = buildRowFromOferta_(oferta, sourceSheetName);

        if (sourceSheetName === targetSheetName) {
          sourceSheet.getRange(sourceRow, 1, 1, TOTAL_COLUNAS).setValues([linha]);
        } else {
          var targetSheet = ss.getSheetByName(targetSheetName);
          targetSheet.appendRow(linha);
          sourceSheet.deleteRow(sourceRow);
        }
      }
    }
  } else {
    var target = ss.getSheetByName(targetSheetName);
    target.appendRow(buildRowFromOferta_(oferta, targetSheetName));
  }

  return {
    ofertas: listarOfertas_(ss),
    config: getConfig_(),
    message: 'Oferta salva.'
  };
}

function deleteOferta_(uid) {
  var ss = getSpreadsheet_();
  ensureStructure_(ss);

  var parts = String(uid || '').split(':');
  if (parts.length !== 2) {
    throw new Error('UID inválido para exclusão.');
  }

  var sheetName = parts[0];
  var row = Number(parts[1]);
  if (row < 2) throw new Error('Linha inválida.');

  var sheet = ss.getSheetByName(sheetName);
  if (sheet && sheet.getLastRow() >= row) {
    sheet.deleteRow(row);
  }

  return {
    ofertas: listarOfertas_(ss),
    config: getConfig_(),
    message: 'Oferta excluída.'
  };
}

function importarProviders_() {
  var ss = getSpreadsheet_();
  ensureStructure_(ss);

  var config = getConfig_();
  var providers = config.providers || [];
  var active = providers.filter(function (p) { return !!p.ativo; });

  var all = listarTodasOfertasLista_(ss);
  var idMap = {};
  all.forEach(function (o) {
    var id = String(o.id || '').trim();
    if (id) idMap[id] = true;
  });

  var novos = [];
  for (var i = 0; i < active.length; i++) {
    var p = active[i];
    var result = importFromProvider_(p, config.filtros || {});
    for (var j = 0; j < result.length; j++) {
      var o = result[j];
      var oid = String(o.id || '').trim();
      if (!oid || idMap[oid]) continue;
      idMap[oid] = true;
      novos.push(o);
    }
  }

  if (novos.length) {
    var pend = ss.getSheetByName(ABA_PENDENTES);
    var rows = novos.map(function (o) {
      o.status = 'PENDENTE';
      o.postado = 'NÃO';
      return buildRowFromOferta_(o, ABA_PENDENTES);
    });
    pend.getRange(pend.getLastRow() + 1, 1, rows.length, TOTAL_COLUNAS).setValues(rows);
  }

  addLog_(ss, 'IMPORT', 'Novos itens: ' + novos.length);

  return {
    ofertas: listarOfertas_(ss),
    config: config,
    message: novos.length ? ('Importação concluída. Novos itens: ' + novos.length) : 'Nenhum item novo importado.'
  };
}

function publicarAprovados_() {
  var ss = getSpreadsheet_();
  ensureStructure_(ss);

  var config = getConfig_();
  var canaisAtivos = (config.canais || []).filter(function (c) { return !!c.ativo; });

  var aprovadosSheet = ss.getSheetByName(ABA_APROVADOS);
  var lastRow = aprovadosSheet.getLastRow();

  if (lastRow < 2) {
    return {
      ofertas: listarOfertas_(ss),
      config: config,
      message: 'Nenhuma oferta aprovada para publicar.'
    };
  }

  var values = aprovadosSheet.getRange(2, 1, lastRow - 1, TOTAL_COLUNAS).getValues();
  var enviados = 0;

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var rowNumber = i + 2;

    var status = String(row[COL_STATUS - 1] || '').toUpperCase();
    var postado = String(row[COL_POSTADO - 1] || '').toUpperCase();

    if (status !== 'APROVADO') continue;
    if (postado === 'SIM') continue;

    var oferta = rowToOferta_(row, ABA_APROVADOS, rowNumber);
    var mensagem = montarMensagemOferta_(oferta);

    var sucessoTotal = true;
    var manualLinks = [];

    if (canaisAtivos.length) {
      for (var c = 0; c < canaisAtivos.length; c++) {
        var canal = canaisAtivos[c];
        var resp = publicarNoCanal_(canal, oferta, mensagem);
        if (!resp.ok) {
          sucessoTotal = false;
        }
        if (resp.manualLink) {
          manualLinks.push(resp.manualLink);
        }
      }
    } else {
      sucessoTotal = false;
    }

    if (manualLinks.length) {
      oferta.postTelegram = manualLinks.join(' | ');
      aprovadosSheet.getRange(rowNumber, COL_POST_TELEGRAM).setValue(oferta.postTelegram);
    }

    if (sucessoTotal) {
      aprovadosSheet.getRange(rowNumber, COL_POSTADO).setValue('SIM');
      aprovadosSheet.getRange(rowNumber, COL_DATA_POSTAGEM).setValue(new Date());
      enviados += 1;
    } else {
      aprovadosSheet.getRange(rowNumber, COL_POSTADO).setValue('ERRO');
    }

    Utilities.sleep(1200);
  }

  addLog_(ss, 'PUBLISH', 'Enviados: ' + enviados);

  return {
    ofertas: listarOfertas_(ss),
    config: config,
    message: 'Publicação concluída. Enviados: ' + enviados
  };
}

function publicarNoCanal_(canal, oferta, mensagem) {
  var tipo = String(canal.tipo || '');
  var auth = canal.configAuth || {};

  if (tipo === 'telegram') {
    return enviarTelegram_(canal, mensagem, oferta.imagem, auth);
  }

  if (tipo === 'whatsapp_oficial') {
    return enviarWhatsAppOficial_(canal, mensagem, auth);
  }

  if (tipo === 'whatsapp_grupo_manual') {
    var link = 'https://wa.me/?text=' + encodeURIComponent(mensagem);
    addLog_(getSpreadsheet_(), 'WHATSAPP_MANUAL', (canal.nome || canal.id) + ' -> ' + link);
    return { ok: true, manualLink: link };
  }

  return { ok: false, error: 'Tipo de canal não suportado.' };
}

function enviarTelegram_(canal, mensagem, imagem, auth) {
  try {
    var token = resolveSecret_(auth.token, auth.tokenProperty || 'TELEGRAM_BOT_TOKEN');
    var chatId = String(canal.destino || '').trim();
    if (!token || !chatId) {
      return { ok: false, error: 'Telegram sem token/chatId.' };
    }

    var okFoto = false;
    if (imagem) {
      var respFoto = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendPhoto', {
        method: 'post',
        muteHttpExceptions: true,
        payload: {
          chat_id: chatId,
          photo: imagem,
          caption: String(mensagem).slice(0, 900),
          parse_mode: 'HTML'
        }
      });

      okFoto = respFoto.getResponseCode() >= 200 && respFoto.getResponseCode() < 300;
    }

    if (!okFoto) {
      var respText = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
        method: 'post',
        muteHttpExceptions: true,
        payload: {
          chat_id: chatId,
          text: mensagem,
          parse_mode: 'HTML',
          disable_web_page_preview: false
        }
      });

      var okText = respText.getResponseCode() >= 200 && respText.getResponseCode() < 300;
      return { ok: okText, error: okText ? '' : respText.getContentText() };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function enviarWhatsAppOficial_(canal, mensagem, auth) {
  try {
    var token = resolveSecret_(auth.token, auth.tokenProperty || 'WHATSAPP_TOKEN');
    var phoneNumberId = resolveSecret_(auth.phoneNumberId, auth.phoneNumberIdProperty || 'WHATSAPP_PHONE_NUMBER_ID');
    var to = String(canal.destino || '').trim();
    var version = String(auth.version || 'v20.0');

    if (!token || !phoneNumberId || !to) {
      return { ok: false, error: 'WhatsApp sem token/phoneNumberId/destino.' };
    }

    var url = 'https://graph.facebook.com/' + version + '/' + phoneNumberId + '/messages';
    var payload = {
      messaging_product: 'whatsapp',
      to: to,
      type: 'text',
      text: { body: stripHtml_(mensagem).slice(0, 2000) }
    };

    var resp = UrlFetchApp.fetch(url, {
      method: 'post',
      muteHttpExceptions: true,
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + token
      },
      payload: JSON.stringify(payload)
    });

    var ok = resp.getResponseCode() >= 200 && resp.getResponseCode() < 300;
    return { ok: ok, error: ok ? '' : resp.getContentText() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function stripHtml_(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function montarMensagemOferta_(oferta) {
  var linhas = [];

  linhas.push('🔥 <b>ACHADO DO DIA</b>');
  linhas.push('');
  linhas.push('🛒 <b>' + escapeHtml_(oferta.produto || 'Produto') + '</b>');

  if (oferta.precoDe) {
    linhas.push('De: <s>' + escapeHtml_(String(oferta.precoDe)) + '</s>');
  }

  if (oferta.precoPor) {
    linhas.push('💸 Por: <b>' + escapeHtml_(String(oferta.precoPor)) + '</b>');
  }

  if (oferta.loja) {
    linhas.push('🏪 Loja: ' + escapeHtml_(oferta.loja));
  }

  if (oferta.cupom) {
    linhas.push('🎟 Cupom: ' + escapeHtml_(oferta.cupom));
  }

  if (oferta.frete) {
    linhas.push('🚚 Frete: ' + escapeHtml_(oferta.frete));
  }

  var link = oferta.linkAfiliado || oferta.linkOriginal;
  if (link) {
    linhas.push('');
    linhas.push('👉 <a href="' + escapeHtml_(link) + '">Comprar agora</a>');
  }

  linhas.push('');
  linhas.push('#Oferta #ReiDoGarimpo');

  return linhas.join('\n');
}

function importFromProvider_(provider, filtros) {
  var tipo = String(provider.tipo || 'custom_json');

  if (tipo === 'manual') return [];
  if (tipo === 'shopee') return importShopee_(provider, filtros);
  if (tipo === 'amazon') return importAmazon_(provider, filtros);
  if (tipo === 'mercadolivre') return importMercadoLivre_(provider, filtros);

  return importCustomJson_(provider, filtros);
}

function importShopee_(provider, filtros) {
  return importCustomJson_(provider, filtros, 'Shopee');
}

function importAmazon_(provider, filtros) {
  return importCustomJson_(provider, filtros, 'Amazon');
}

function importMercadoLivre_(provider, filtros) {
  return importCustomJson_(provider, filtros, 'Mercado Livre');
}

function importCustomJson_(provider, filtros, providerLabel) {
  var endpoint = String(provider.endpoint || '').trim();
  if (!endpoint) return [];

  var method = String(provider.method || 'GET').toUpperCase();
  var headers = {};

  var providerToken = resolveSecret_(provider.token, provider.tokenProperty || '');
  var providerAppId = resolveSecret_(provider.appId, provider.appIdProperty || '');
  var providerAppSecret = resolveSecret_(provider.appSecret, provider.appSecretProperty || '');

  if (provider.authType === 'bearer' && providerToken) {
    headers.Authorization = 'Bearer ' + providerToken;
  }

  if (provider.authType === 'app_keys') {
    if (providerAppId) headers['x-app-id'] = providerAppId;
    if (providerAppSecret) headers['x-app-secret'] = providerAppSecret;
  }

  if (provider.headersJson) {
    try {
      var extra = JSON.parse(provider.headersJson);
      var keys = Object.keys(extra);
      for (var i = 0; i < keys.length; i++) {
        headers[keys[i]] = extra[keys[i]];
      }
    } catch (_) {}
  }

  var bodyObj = null;
  if (provider.queryOrBody) {
    try {
      bodyObj = JSON.parse(provider.queryOrBody);
    } catch (_) {
      bodyObj = null;
    }
  }

  var url = endpoint;
  var options = {
    method: method,
    muteHttpExceptions: true,
    headers: headers
  };

  if (method === 'GET' && bodyObj) {
    var query = Object.keys(bodyObj).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(bodyObj[k]);
    }).join('&');

    if (query) {
      url += (url.indexOf('?') >= 0 ? '&' : '?') + query;
    }
  }

  if (method !== 'GET' && bodyObj) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(bodyObj);
  }

  var resp = UrlFetchApp.fetch(url, options);
  var code = resp.getResponseCode();

  if (code < 200 || code >= 300) {
    addLog_(getSpreadsheet_(), 'IMPORT_' + (provider.id || 'provider'), 'HTTP ' + code + ': ' + resp.getContentText());
    return [];
  }

  var json;
  try {
    json = JSON.parse(resp.getContentText());
  } catch (_) {
    return [];
  }

  var list = extractArray_(json);
  var mapped = list.map(function (item, idx) {
    return mapGenericItem_(item, providerLabel || provider.nome || provider.id || 'Provider', idx);
  });

  return applyImportFilters_(mapped, filtros || {});
}

function extractArray_(json) {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.items)) return json.items;
  if (json && Array.isArray(json.products)) return json.products;
  if (json && json.data && Array.isArray(json.data.items)) return json.data.items;
  if (json && json.data && Array.isArray(json.data.products)) return json.data.products;
  if (json && json.data && json.data.productOfferV2 && Array.isArray(json.data.productOfferV2.nodes)) {
    return json.data.productOfferV2.nodes;
  }
  return [];
}

function mapGenericItem_(item, providerName, index) {
  function pick(keys) {
    for (var i = 0; i < keys.length; i++) {
      var v = item[keys[i]];
      if (v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
    return '';
  }

  return {
    _uid: '',
    id: String(pick(['id', 'itemId', 'item_id', 'productId']) || ('IMP-' + Date.now() + '-' + index)),
    origemApi: providerName,
    loja: String(pick(['loja', 'shop', 'shopName', 'storeName']) || ''),
    produto: String(pick(['produto', 'name', 'title', 'itemName', 'productName']) || 'Produto sem nome'),
    categoria: String(pick(['categoria', 'category', 'categoryName']) || ''),
    precoDe: pick(['precoDe', 'priceBefore', 'originalPrice', 'price_max']),
    precoPor: pick(['precoPor', 'price', 'priceMin', 'offerPrice']),
    cupom: String(pick(['cupom', 'coupon']) || ''),
    frete: String(pick(['frete', 'shipping', 'shippingFee']) || ''),
    avaliacao: String(pick(['avaliacao', 'rating', 'score']) || ''),
    beneficios: String(pick(['beneficios', 'benefits']) || ''),
    observacao: String(pick(['observacao']) || ''),
    linkOriginal: String(pick(['linkOriginal', 'url', 'itemUrl', 'productUrl']) || ''),
    linkAfiliado: String(pick(['linkAfiliado', 'affiliateLink', 'trackingLink']) || ''),
    imagem: String(pick(['imagem', 'image', 'imageUrl']) || ''),
    status: 'PENDENTE',
    prioridade: 'MÉDIA',
    postado: 'NÃO',
    dataCaptura: new Date(),
    dataPostagem: '',
    postTelegram: '',
    aba: ABA_PENDENTES
  };
}

function applyImportFilters_(itens, filtros) {
  var min = toNumber_(filtros.precoMin);
  var max = toNumber_(filtros.precoMax);
  var kw = String(filtros.keywords || '').toLowerCase().trim();
  var segs = Array.isArray(filtros.segmentos) ? filtros.segmentos : [];
  segs = segs.map(function (s) { return String(s || '').toLowerCase(); }).filter(function (s) { return s; });

  return itens.filter(function (o) {
    var preco = toNumber_(o.precoPor);
    var texto = (String(o.produto || '') + ' ' + String(o.categoria || '')).toLowerCase();

    if (isFinite(min) && (!isFinite(preco) || preco < min)) return false;
    if (isFinite(max) && (!isFinite(preco) || preco > max)) return false;
    if (kw && texto.indexOf(kw) < 0) return false;

    if (segs.length) {
      var ok = segs.some(function (s) { return texto.indexOf(s) >= 0; });
      if (!ok) return false;
    }

    return true;
  });
}

function toNumber_(raw) {
  var n = Number(String(raw || '').replace(/[^0-9,.-]/g, '').replace(',', '.'));
  return isFinite(n) ? n : NaN;
}

function getSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = String(props.getProperty(PROP_SPREADSHEET_ID) || '').trim();

  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (_) {}
  }

  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    throw new Error('Nenhuma planilha ativa encontrada. Configure RDG_SPREADSHEET_ID.');
  }

  props.setProperty(PROP_SPREADSHEET_ID, active.getId());
  return active;
}

function ensureStructure_(ss) {
  ensureSheetWithHeaders_(ss, ABA_PENDENTES, HEADERS);
  ensureSheetWithHeaders_(ss, ABA_APROVADOS, HEADERS);
  ensureSheetWithHeaders_(ss, ABA_REPROVADOS, HEADERS);

  var configSheet = ss.getSheetByName(ABA_CONFIG);
  if (!configSheet) configSheet = ss.insertSheet(ABA_CONFIG);

  if (configSheet.getLastRow() < 1) {
    configSheet.getRange(1, 1, 1, 2).setValues([['KEY', 'VALUE']]);
  }

  var logs = ss.getSheetByName(ABA_LOGS);
  if (!logs) logs = ss.insertSheet(ABA_LOGS);
  if (logs.getLastRow() < 1) {
    logs.getRange(1, 1, 1, 4).setValues([['Data', 'Tipo', 'Mensagem', 'Detalhe']]);
  }
}

function ensureSheetWithHeaders_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  var row1 = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  var mismatch = false;

  for (var i = 0; i < headers.length; i++) {
    if (String(row1[i] || '').trim() !== headers[i]) {
      mismatch = true;
      break;
    }
  }

  if (mismatch) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  sheet.setFrozenRows(1);
}

function getConfig_() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty(PROP_CONFIG_JSON);

  if (!raw) {
    var cfg = configPadrao_();
    props.setProperty(PROP_CONFIG_JSON, JSON.stringify(cfg));
    return cfg;
  }

  try {
    return normalizarConfig_(JSON.parse(raw));
  } catch (_) {
    var fallback = configPadrao_();
    props.setProperty(PROP_CONFIG_JSON, JSON.stringify(fallback));
    return fallback;
  }
}

function setConfig_(cfg) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty(PROP_CONFIG_JSON, JSON.stringify(normalizarConfig_(cfg)));
}

function configPadrao_() {
  return {
    planilha: {
      spreadsheetId: '',
      displayName: 'Rei do Garimpo'
    },
    theme: {
      preset: 'amber',
      colors: {
        bg: '#f6f2e6',
        panel: '#fffdf8',
        brand: '#cd4d17',
        ink: '#1f1e1a'
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
    canais: [],
    providers: []
  };
}

function normalizarConfig_(cfgRaw) {
  var cfg = cfgRaw || {};
  var d = configPadrao_();

  cfg.planilha = cfg.planilha || {};
  cfg.theme = cfg.theme || {};
  cfg.theme.colors = cfg.theme.colors || {};
  cfg.theme.sheetTheme = cfg.theme.sheetTheme || {};
  cfg.filtros = cfg.filtros || {};
  cfg.publicacao = cfg.publicacao || {};

  cfg.canais = Array.isArray(cfg.canais) ? cfg.canais : [];
  cfg.providers = Array.isArray(cfg.providers) ? cfg.providers : [];

  if (!cfg.planilha.displayName) cfg.planilha.displayName = d.planilha.displayName;
  if (!cfg.theme.preset) cfg.theme.preset = d.theme.preset;

  if (!cfg.theme.colors.bg) cfg.theme.colors.bg = d.theme.colors.bg;
  if (!cfg.theme.colors.panel) cfg.theme.colors.panel = d.theme.colors.panel;
  if (!cfg.theme.colors.brand) cfg.theme.colors.brand = d.theme.colors.brand;
  if (!cfg.theme.colors.ink) cfg.theme.colors.ink = d.theme.colors.ink;

  if (!cfg.theme.sheetTheme.pendentesBg) cfg.theme.sheetTheme.pendentesBg = d.theme.sheetTheme.pendentesBg;
  if (!cfg.theme.sheetTheme.aprovadosBg) cfg.theme.sheetTheme.aprovadosBg = d.theme.sheetTheme.aprovadosBg;
  if (!cfg.theme.sheetTheme.reprovadosBg) cfg.theme.sheetTheme.reprovadosBg = d.theme.sheetTheme.reprovadosBg;
  if (!cfg.theme.sheetTheme.headerBg) cfg.theme.sheetTheme.headerBg = d.theme.sheetTheme.headerBg;

  if (!Array.isArray(cfg.filtros.segmentos)) cfg.filtros.segmentos = d.filtros.segmentos;

  if (typeof cfg.publicacao.sendToAllActive !== 'boolean') {
    cfg.publicacao.sendToAllActive = true;
  }

  return cfg;
}

function applySpreadsheetBranding_(ss, config) {
  try {
    var nome = config && config.planilha ? config.planilha.displayName : '';
    if (nome) {
      ss.rename(nome);
    }
  } catch (_) {}

  var theme = (config && config.theme && config.theme.sheetTheme) ? config.theme.sheetTheme : {};
  applySheetColors_(ss, ABA_PENDENTES, theme.pendentesBg || '#fff2cc', theme.headerBg || '#f4c542');
  applySheetColors_(ss, ABA_APROVADOS, theme.aprovadosBg || '#d9ead3', theme.headerBg || '#f4c542');
  applySheetColors_(ss, ABA_REPROVADOS, theme.reprovadosBg || '#f4cccc', theme.headerBg || '#f4c542');
}

function applySheetColors_(ss, sheetName, bodyColor, headerColor) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;

  var maxRows = Math.max(sheet.getMaxRows(), 2);
  var maxCols = Math.max(sheet.getMaxColumns(), TOTAL_COLUNAS);

  sheet.getRange(1, 1, maxRows, maxCols).setBackground(bodyColor);
  sheet.getRange(1, 1, 1, maxCols)
    .setBackground(headerColor)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');
}

function listarOfertas_(ss) {
  return {
    pendentes: listarOfertasAba_(ss, ABA_PENDENTES),
    aprovados: listarOfertasAba_(ss, ABA_APROVADOS),
    reprovados: listarOfertasAba_(ss, ABA_REPROVADOS)
  };
}

function listarTodasOfertasLista_(ss) {
  return listarOfertasAba_(ss, ABA_PENDENTES)
    .concat(listarOfertasAba_(ss, ABA_APROVADOS))
    .concat(listarOfertasAba_(ss, ABA_REPROVADOS));
}

function listarOfertasAba_(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var values = sheet.getRange(2, 1, lastRow - 1, TOTAL_COLUNAS).getValues();
  var out = [];

  for (var i = 0; i < values.length; i++) {
    out.push(rowToOferta_(values[i], sheetName, i + 2));
  }

  return out;
}

function rowToOferta_(row, sheetName, rowNumber) {
  return {
    _uid: sheetName + ':' + rowNumber,
    aba: sheetName,
    id: row[COL_ID - 1],
    dataCaptura: row[COL_DATA_CAPTURA - 1],
    origemApi: row[COL_ORIGEM_API - 1],
    loja: row[COL_LOJA - 1],
    produto: row[COL_PRODUTO - 1],
    categoria: row[COL_CATEGORIA - 1],
    precoDe: row[COL_PRECO_DE - 1],
    precoPor: row[COL_PRECO_POR - 1],
    cupom: row[COL_CUPOM - 1],
    frete: row[COL_FRETE - 1],
    avaliacao: row[COL_AVALIACAO - 1],
    beneficios: row[COL_BENEFICIOS - 1],
    observacao: row[COL_OBSERVACAO - 1],
    linkOriginal: row[COL_LINK_ORIGINAL - 1],
    linkAfiliado: row[COL_LINK_AFILIADO - 1],
    imagem: row[COL_IMAGEM - 1],
    status: row[COL_STATUS - 1],
    prioridade: row[COL_PRIORIDADE - 1],
    postado: row[COL_POSTADO - 1],
    dataPostagem: row[COL_DATA_POSTAGEM - 1],
    postTelegram: row[COL_POST_TELEGRAM - 1]
  };
}

function normalizarOferta_(o) {
  o = o || {};
  return {
    _uid: String(o._uid || ''),
    aba: String(o.aba || ''),
    id: String(o.id || '').trim(),
    dataCaptura: o.dataCaptura || new Date(),
    origemApi: String(o.origemApi || 'Manual').trim(),
    loja: String(o.loja || '').trim(),
    produto: String(o.produto || '').trim(),
    categoria: String(o.categoria || '').trim(),
    precoDe: o.precoDe || '',
    precoPor: o.precoPor || '',
    cupom: String(o.cupom || '').trim(),
    frete: String(o.frete || '').trim(),
    avaliacao: String(o.avaliacao || '').trim(),
    beneficios: String(o.beneficios || '').trim(),
    observacao: String(o.observacao || '').trim(),
    linkOriginal: String(o.linkOriginal || '').trim(),
    linkAfiliado: String(o.linkAfiliado || '').trim(),
    imagem: String(o.imagem || '').trim(),
    status: normalizeStatus_(o.status),
    prioridade: String(o.prioridade || 'MÉDIA').trim(),
    postado: String(o.postado || 'NÃO').trim(),
    dataPostagem: o.dataPostagem || '',
    postTelegram: String(o.postTelegram || '').trim()
  };
}

function buildRowFromOferta_(o, sheetName) {
  var status = normalizeStatus_(o.status);

  var postado = String(o.postado || 'NÃO').toUpperCase();
  var dataPostagem = o.dataPostagem || '';

  if (status !== 'APROVADO') {
    postado = 'NÃO';
    dataPostagem = '';
  }

  return [
    o.id || ('OF-' + new Date().getTime()),
    o.dataCaptura || new Date(),
    o.origemApi || 'Manual',
    o.loja || '',
    o.produto || '',
    o.categoria || '',
    o.precoDe || '',
    o.precoPor || '',
    o.cupom || '',
    o.frete || '',
    o.avaliacao || '',
    o.beneficios || '',
    o.observacao || '',
    o.linkOriginal || '',
    o.linkAfiliado || '',
    o.imagem || '',
    status,
    o.prioridade || 'MÉDIA',
    postado,
    dataPostagem,
    o.postTelegram || ''
  ];
}

function normalizeStatus_(status) {
  var s = String(status || '').toUpperCase().trim();
  if (s === 'APROVADO') return 'APROVADO';
  if (s === 'REPROVADO') return 'REPROVADO';
  return 'PENDENTE';
}

function statusToSheet_(status) {
  status = normalizeStatus_(status);
  if (status === 'APROVADO') return ABA_APROVADOS;
  if (status === 'REPROVADO') return ABA_REPROVADOS;
  return ABA_PENDENTES;
}

function escapeHtml_(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function addLog_(ss, type, message, detail) {
  var sheet = ss.getSheetByName(ABA_LOGS);
  if (!sheet) return;
  sheet.appendRow([new Date(), type || '', message || '', detail || '']);
}

function resolveSecret_(directValue, propertyKey) {
  var direct = String(directValue || '').trim();
  if (direct) return direct;

  var key = String(propertyKey || '').trim();
  if (!key) return '';

  return String(PropertiesService.getScriptProperties().getProperty(key) || '').trim();
}

function logErro_(ctx, err) {
  try {
    var ss = getSpreadsheet_();
    addLog_(ss, 'ERRO:' + ctx, err && err.message ? err.message : String(err), err && err.stack ? err.stack : '');
  } catch (_) {}
}

function setupExemploScriptProperties() {
  var props = PropertiesService.getScriptProperties();
  props.setProperties({
    RDG_SPREADSHEET_ID: SpreadsheetApp.getActiveSpreadsheet().getId(),
    TELEGRAM_BOT_TOKEN: 'COLE_SEU_TOKEN_TELEGRAM',
    WHATSAPP_TOKEN: 'COLE_SEU_TOKEN_WHATSAPP',
    WHATSAPP_PHONE_NUMBER_ID: 'COLE_SEU_PHONE_NUMBER_ID'
  }, false);
}
