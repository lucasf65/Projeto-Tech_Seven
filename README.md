# 💅 Nails by Nascimento — Sistema de Agendamento

![Status do Projeto](https://img.shields.io/badge/status-conclu%C3%ADdo-success)
![Versão](https://img.shields.io/badge/vers%C3%A3o-1.1.0-blue)
![Licença](https://img.shields.io/badge/licen%C3%A7a-Acad%C3%AAmica-lightgrey)

Sistema web completo e responsivo para gestão de agendamentos de um estúdio de manicure. Desenvolvido para otimizar o fluxo de trabalho da profissional (Carol) e proporcionar uma experiência de agendamento premium e sem fricção para as clientes.

---

## 📑 Índice

- [✨ Funcionalidades](#-funcionalidades)
- [🔄 Fluxo de um agendamento](#-fluxo-de-um-agendamento)
- [🛠️ Tecnologias Utilizadas](#️-tecnologias-utilizadas)
- [📂 Estrutura do Projeto](#-estrutura-do-projeto)
- [🗄️ Modelo de dados (Firestore)](#️-modelo-de-dados-firestore)
- [🚀 Como Executar e Configurar](#-como-executar-e-configurar)
- [☁️ Deploy na Vercel](#️-deploy-na-vercel)
- [🔒 Segurança (Firestore Rules)](#-segurança-firestore-rules)
- [🎨 Design System](#-design-system)
- [📝 Licença](#-licença)

---

## ✨ Funcionalidades

O sistema é dividido em duas grandes áreas: **Área da Cliente** e **Área Administrativa**.

### 👩‍🦰 Área da Cliente (Público)

- **Site Institucional:** Início, Serviços, Preços, Galeria e Sobre, todas alimentadas dinamicamente pelo banco de dados.
- **Agendamento Inteligente:** Fluxo em 4 etapas (Serviço → Data/Hora → Dados → Sinal PIX), sem cadastro nem senha.
- **Calendário Customizado:** Escolha de data com seletores de mês/ano, bloqueio de dias passados e de horários já ocupados ou fechados pela Carol.
- **Pagamento de Sinal:** Sinal de **R$ 30,00** via PIX, com chave copiável e botão "Já realizei o pagamento".
- **Cliente fidelizada:** quem já teve atendimento confirmado ou concluído não precisa pagar o sinal novamente (`deposito: nao-aplicavel`).
- **Consulta de Horários:** Em "Meus horários", a cliente consulta, cancela ou reagenda usando apenas o WhatsApp (limite de **3 reagendamentos** por agendamento).
- **Galeria Dinâmica:** Portfólio em grade responsiva, com fotos locais de reserva caso o banco esteja vazio.
- **Transições entre páginas:** Tela de carregamento com a logo e animação de entrada ao navegar.
- **Design Responsivo:** Experiência fluida em computadores, tablets e celulares.

### 👑 Área Administrativa (Carol)

Acesso restrito: login via Firebase Authentication **e** verificação na coleção `admins`.

- **Painel (`admin.html`):**
  - Indicadores rápidos de solicitações pendentes, aguardando sinal e confirmadas.
  - Gestão de solicitações com filtro por status e por data: aprovar, recusar, cobrar sinal via WhatsApp, confirmar e concluir.
  - **Gestão de Agenda:** modal com calendário para bloquear ou liberar horários de qualquer data.
  - **Gestão de Catálogo:** criar, editar e excluir serviços (nome, descrição, duração, preço e emoji).
  - **Gestão de Galeria:** adicionar e remover fotos do portfólio.
  - Resumo de faturamento com atalho para o dashboard.
- **Dashboard (`dashboard.html`):**
  - Visão geral do estúdio atualizada em tempo real, com navegação por mês.
  - **Resumo da semana:** faturamento e atendimentos concluídos, com comparação com a semana anterior.
  - **KPIs do mês** com indicadores de variação.
  - **Gráficos próprios em SVG/HTML** (sem bibliotecas externas): faturamento por dia e acumulado, situação das solicitações (rosca), tendência dos últimos 6 meses, serviços mais realizados e ocorrências (reagendamentos e cancelamentos por semana), com tooltips, legendas clicáveis e animações.
- **Carteira de Clientes (`clientes.html`):**
  - Busca por nome ou WhatsApp, ordenação (mais recentes, maior gasto, mais visitas, nome) e filtros (fidelizadas, novas, inativas há mais de 60 dias).
  - KPIs: receita total, número de clientes, fidelizadas e ticket médio.
  - Ficha da cliente com histórico em linha do tempo, total gasto, ticket médio, reagendamentos e cancelamentos feitos por ela.
  - Atalho de WhatsApp e opções para **apagar histórico** ou **apagar cadastro**, ambas com diálogo de confirmação.

---

## 🔄 Fluxo de um agendamento

1. A cliente escolhe serviço, data e horário e informa nome e WhatsApp.
2. A solicitação é criada com status `pendente` (e `deposito: pendente`, exceto para clientes fidelizadas).
3. A cliente paga o sinal via PIX e avisa pelo botão; o depósito passa a `pago`.
4. Carol revisa e muda o status: `aguardando-sinal`, `confirmado`, `recusado`, `cancelado` ou `concluido`.
5. Atendimentos `concluido` entram no faturamento do dashboard e na carteira de clientes.

Horários ocupados são os que têm agendamento em qualquer status diferente de `recusado` e `cancelado`.

---

## 🛠️ Tecnologias Utilizadas

O projeto usa tecnologias web nativas (Vanilla), sem frameworks, para manter leveza e performance.

| Camada | Tecnologia | Descrição |
|---|---|---|
| **Frontend** | HTML5 | Estrutura semântica das páginas |
| **Frontend** | CSS3 | Design System próprio com CSS Variables |
| **Frontend** | JavaScript (ES6+) | Lógica do lado do cliente, módulos reutilizáveis |
| **BaaS** | [Firebase](https://firebase.google.com/) (SDK 9.22 compat) | Backend as a Service |
| **Banco de Dados** | Firestore | Banco NoSQL em tempo real |
| **Autenticação** | Firebase Auth | Login seguro do painel admin |
| **Build/Deploy** | Node.js + Vercel | `build.js` gera a configuração do Firebase a partir de variáveis de ambiente |
| **Tipografia** | Google Fonts | Cormorant Garamond + Poppins / Inter |

---

## 📂 Estrutura do Projeto

```text
/
├── index.html              # Página inicial
├── servicos.html           # Catálogo de serviços
├── precos.html             # Tabela de preços
├── galeria.html            # Portfólio
├── sobre.html              # História da Carol
├── agendamento.html        # Fluxo de agendamento (Cliente)
├── meus-horarios.html      # Consulta de agendamentos (Cliente)
├── admin.html              # Painel da Carol (Admin)
├── dashboard.html          # Dashboard de faturamento e agenda (Admin)
├── clientes.html           # Carteira de clientes (Admin)
│
├── /css
│   ├── styles.css          # Design System global
│   ├── dashboard.css       # Estilos do dashboard e dos gráficos
│   └── clientes.css        # Estilos da carteira de clientes
│
├── /js
│   ├── firebase-config.js          # Gerado pelo build.js (não versionado)
│   ├── firebase-config.example.js  # Modelo da configuração do Firebase
│   ├── app-core.js         # Constantes, utilitários, acesso a dados, UI comum e transições
│   ├── calendar.js         # Componente de calendário único (cliente e admin)
│   ├── modal.js            # Componente de modal único (abrir/fechar, ESC, scroll-lock)
│   ├── site.js             # Renderização das páginas públicas
│   ├── booking.js          # Lógica do agendamento
│   ├── lookup.js           # Consulta, cancelamento e reagendamento ("Meus horários")
│   ├── admin.js            # Painel administrativo
│   ├── dashboard.js        # Indicadores e gráficos
│   └── clientes.js         # Carteira de clientes
│
├── /assets
│   ├── logo.png
│   ├── hero.jpg
│   ├── carol.jpg
│   └── /gallery            # Fotos de reserva do portfólio (01.jpg a 08.jpg)
│
├── build.js                # Gera js/firebase-config.js a partir das variáveis de ambiente
├── firestore.rules         # Regras de segurança do banco de dados
└── .gitignore
```

---

## 🗄️ Modelo de dados (Firestore)

| Coleção | Documento | Campos principais |
|---|---|---|
| `servicos` | `id` numérico | `id`, `name`, `description`, `duration`, `price`, `icon` |
| `agendamentos` | automático | `clienteId`, `nome`, `telefone`, `servico`, `servicoId`, `preco`, `data` (AAAA-MM-DD), `horario`, `status`, `deposito`, `pixStatus`, `reagendamentos`, `isLoyal`, `canceladoPor`, `criadoEm` |
| `clientes` | automático | `nome`, `telefone` (somente dígitos), `criadoEm` |
| `disponibilidades` | data (AAAA-MM-DD) | `closed`: lista de horários bloqueados |
| `galeria` | automático | `url`, `alt`, `ordem` |
| `admins` | UID do usuário | Presença do documento autoriza o acesso ao painel |

**Status:** `pendente`, `aguardando-sinal`, `confirmado`, `concluido`, `recusado`, `cancelado`.
**Horários oferecidos:** 09:00, 10:00, 11:00, 14:00, 15:00 e 16:00.

> Os serviços iniciais (Manicure simples, Alongamento em gel e Pacote mãos + pés) são criados automaticamente na primeira carga caso a coleção esteja vazia.

---

## 🚀 Como Executar e Configurar

### 1. Pré-requisitos

- Um projeto no [Firebase](https://console.firebase.google.com/) com **Firestore** e **Authentication (E-mail/Senha)** ativados.
- Node.js (apenas para rodar o `build.js`) e qualquer servidor estático para servir os arquivos.

### 2. Configurar o Firebase

Escolha uma das opções:

**a) Manualmente (desenvolvimento local):** copie `js/firebase-config.example.js` para `js/firebase-config.js` e preencha com as credenciais do seu projeto.

**b) Via variáveis de ambiente:** defina as variáveis abaixo e rode `node build.js`, que gera o `js/firebase-config.js`. O script falha com a lista de variáveis ausentes se alguma não estiver definida.

```text
FIREBASE_API_KEY
FIREBASE_AUTH_DOMAIN
FIREBASE_PROJECT_ID
FIREBASE_STORAGE_BUCKET
FIREBASE_MESSAGING_SENDER_ID
FIREBASE_APP_ID
```

### 3. Personalizar os dados do estúdio

Em `js/app-core.js`, edite:

```js
const PIX_KEY        = '+5511932298711';   // chave PIX (celular)
const PIX_KEY_LABEL  = '(11) 93229-8711';  // como a chave aparece na tela
const PIX_FAVORECIDA = 'Carol Nascimento';
const PIX_COPIA_COLA = '00020101...';      // código "copia e cola" completo do PIX
const WHATSAPP = '5511999999999';     // número usado nos links de WhatsApp
const SLOTS    = ['09:00','10:00','11:00','14:00','15:00','16:00'];
const SINAL    = 30;                  // valor do sinal em reais
```

> O QR Code do PIX fica em `assets/qr-pix.png`. Se trocar a chave PIX, gere um novo QR no app do banco e substitua a imagem junto com `PIX_COPIA_COLA`.

> Se alterar o valor do sinal, atualize também os textos em `agendamento.html`, `index.html` e `precos.html`, que mencionam R$ 30.

### 4. Criar o acesso da Carol

1. No Firebase Authentication, crie o usuário (e-mail e senha) da Carol.
2. No Firestore, crie o documento `admins/{UID do usuário}` (pode estar vazio). Sem ele, o login é recusado no painel, no dashboard e na carteira de clientes.

### 5. Rodar localmente

Sirva a pasta com qualquer servidor estático, por exemplo:

```bash
npx serve .
```

---

## ☁️ Deploy na Vercel

1. Importe o repositório na Vercel.
2. Em **Environment Variables**, cadastre as seis variáveis `FIREBASE_*` listadas acima.
3. Defina o **Build Command** como `node build.js` e o diretório de saída como a raiz do projeto.
4. Em Authentication → Settings → Authorized domains, adicione o domínio da Vercel.

O arquivo `js/firebase-config.js` não deve ser versionado (está no `.gitignore`); ele é gerado a cada build.

---

## 🔒 Segurança (Firestore Rules)

As regras ficam em `firestore.rules` e devem ser publicadas no Firebase (Console ou `firebase deploy --only firestore:rules`).

Pontos de atenção:

- O painel, o dashboard e a carteira de clientes só abrem para usuários autenticados que tenham documento em `admins/{uid}`.
- As clientes não têm login: elas criam agendamentos e consultam pelo WhatsApp. Por isso, as regras de `agendamentos` e `clientes` precisam equilibrar o acesso público necessário ao fluxo com a proteção dos dados pessoais. Revise-as antes de ir para produção.
- Operações de gestão (serviços, galeria, disponibilidades, apagar histórico ou cadastro) devem ficar restritas à administradora.
- Não versione credenciais: use o `build.js` com variáveis de ambiente.

---

## 🎨 Design System

O visual é definido por CSS Variables em `css/styles.css`, compartilhadas pelo dashboard e pela carteira de clientes.

- **Tipografia:** Cormorant Garamond nos títulos e Poppins/Inter no texto.
- **Cores:** paleta neutra e quente com tons `--ink`, `--soft`, `--mist` e `--line`, além de `--ok` e `--bad` para estados positivo e negativo.
- **Componentes:** botões (`btn-primary`, `btn-ghost`, `btn-gold`, `btn-danger`), cards, chips, badges de status, calendário, modais e toasts.
- **Acessibilidade:** foco visível, rótulos ARIA e respeito a `prefers-reduced-motion`.

---

## 📝 Licença

Projeto de uso acadêmico.
