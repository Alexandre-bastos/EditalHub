# EditalHub

## Objetivo

Plataforma inteligente para:
- coleta de editais;
- processamento automático;
- extração IA;
- matching de concursos por perfil.

---

# MVP

## Entrada

Organizadoras:
- FGV
- Cebraspe
- FCC
- Vunesp

## Saída

API com:
- concursos abertos;
- filtros;
- links oficiais;
- matching usuário.

---

# Arquitetura

```txt
Organizadora
    ↓
Collector
    ↓
Download PDF
    ↓
OCR / IA
    ↓
Banco Dados
    ↓
API
    ↓
Web / Mobile
```

---

# Stack

## Backend
- com o nosso skill

## Banco
- SQL Server

## Coleta
- Playwright
- HtmlAgilityPack

## IA
- OpenAI
- OCR

---

# Estrutura Projeto

```txt
/src
  /collector
  /processor
  /api
/storage
/logs
/docs
```

---

# Banco Dados

## organizadora

| campo | tipo |
|---|---|
| id | uuid |
| nome | varchar |
| site_url | varchar |
| ativo | bool |
| data_criacao | datetime |

---

## edital

| campo | tipo |
|---|---|
| id | uuid |
| organizadora_id | fk |
| nome_edital | varchar |
| url_edital | varchar |
| nome_arquivo | varchar |
| hash_arquivo | varchar |
| data_download | datetime |
| status_processamento | varchar |
| texto_extraido | text |

---

## concurso

| campo | tipo |
|---|---|
| id | uuid |
| edital_id | fk |
| nome_concurso | varchar |
| estado | varchar |
| escolaridade | varchar |
| formacao | varchar |
| profissao | varchar |
| registro_profissional | varchar |
| salario_inicial | decimal |
| idade_minima | int |
| idade_maxima | int |
| inscricao_inicio | datetime |
| inscricao_fim | datetime |
| link_inscricao | varchar |

---

# Fluxo Coleta

## 1. Crawling

Acessar:
- https://conhecimento.fgv.br/concursos

Capturar:
- nome;
- edital;
- pdf;
- datas;
- inscrição.

---

## 2. Download

Salvar:

```txt
/storage/editais/{organizadora}/{ano}
```

---

## 3. Processamento

Extrair:
- texto;
- tabelas;
- requisitos;
- salários;
- cargos.

---

# Pipeline IA

```txt
PDF
 ↓
OCR
 ↓
Texto
 ↓
LLM
 ↓
JSON
 ↓
Banco
```

---

# JSON Esperado

```json
{
  "nome_concurso": "TJ-RJ",
  "estado": "RJ",
  "profissao": "Analista Sistemas",
  "escolaridade": "Superior",
  "salario_inicial": 12000,
  "idade_minima": 18
}
```

---

# Serviços

## editalhub.collector
Responsável:
- scraping;
- download;
- scheduler.

## editalhub.processor
Responsável:
- OCR;
- IA;
- parsing.

## editalhub.api
Responsável:
- autenticação;
- filtros;
- endpoints.

---

# Scheduler

```txt
Execução:
- a cada 1h
- verificar novos editais
- baixar arquivos
- iniciar processamento
```

---

# Roadmap

## Fase 1
- FGV
- download PDFs
- persistência

## Fase 2
- IA
- matching usuário

## Fase 3
- notificações
- WhatsApp
- analytics

---

# Naming

## Produto
EditalHub

## Slogan
"Seu hub inteligente de concursos."

---

# Próximos Arquivos

- arquitetura.md
- api.md
- database.md
- crawler.md
- ai-processing.md
- roadmap.md
