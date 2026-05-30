# Rei do Garimpo - Sistema de Afiliados

## Estrutura
- `index.html`, `styles.css`, `app.js`: painel web (frontend)
- `gas/Code.gs`, `gas/appsscript.json`: backend Google Apps Script
- `.github/workflows/deploy.yml`: deploy automático (Pages + Apps Script)

## Deploy automático via Git
No GitHub, configure os secrets:
- `GAS_CLASP_JSON`: conteúdo completo do arquivo `~/.clasprc.json`
- `GAS_SCRIPT_ID`: Script ID do projeto Apps Script
- `GAS_DEPLOYMENT_ID`: deployment ID do Web App (ex.: `AKfycbz...`) para redeploy no mesmo URL

A cada push em `main`:
1. Publica frontend no GitHub Pages.
2. Executa `clasp push` para Apps Script.
3. Cria versão e deployment do Web App.

## Configuração de API no Frontend
No `index.html`, ajuste `window.RDG_CONFIG`:
- `mode`: `api`
- `apiBaseUrl`: URL do Web App Apps Script (`.../exec`)
- `enableLocalFallback`: `false` para produção

## Rotas esperadas (backend)
- `GET/POST ?route=bootstrap`
- `POST ?route=ofertas/save`
- `POST ?route=ofertas/delete`
- `POST ?route=config/save`
- `POST ?route=import`
- `POST ?route=publish`

## Configuração avançada no painel
- `Planilha e Tema`: Spreadsheet ID global, nome da planilha, preset e cores custom.
- `Canais de publicação`: Telegram, WhatsApp oficial e WhatsApp grupo manual.
- `Provedores`: Shopee, Amazon, Mercado Livre e `custom_json`.
- `Filtros`: preço mínimo/máximo, keywords e segmentos.

### Segredos recomendados
- Em canais/provedores, prefira preencher `tokenProperty`/`appIdProperty`/`appSecretProperty`.
- Cadastre os valores reais em **Script Properties** no Apps Script.

## Observação sobre WhatsApp
No modo híbrido:
- `whatsapp_oficial`: envio via Cloud API (número individual)
- `whatsapp_grupo_manual`: gera link/mensagem para encaminhamento manual em grupo
