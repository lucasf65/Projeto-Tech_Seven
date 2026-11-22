# 💅 Nails by Nascimento — Sistema de Agendamento

![Status do Projeto](https://img.shields.io/badge/status-em%20teste-blue)
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
- **Calendário:** Consulta por serviço e data. A API considera a duração do serviço, os horários de atendimento e os bloqueios da Carol.
- **Pagamento de Sinal:** A cliente informa o pagamento do sinal de **R$ 30,00** via Pix. A Carol verifica o recebimento e confirma manualmente.
- **Cliente fidelizada:** quem já teve atendimento confirmado ou concluído pode ter o sinal dispensado pelo fluxo de aprovação.
- **Consulta de Horários:** Em "Meus horários", a cliente consulta, cancela ou reagenda com WhatsApp e a referência exibida ao enviar a solicitação. O limite é de **três reagendamentos**. Para registros anteriores à versão, a consulta continua com a Carol.
- **Galeria Dinâmica:** Portfólio em grade responsiva, com fotos locais de reserva caso o banco esteja vazio.
- **Transições entre páginas:** Tela de carregamento com a logo e animação de entrada ao navegar.
- **Design Responsivo:** Experiência fluida em computadores, tablets e celulares.

### 👑 Área Administrativa (Carol)

Acesso restrito: login via Firebase Authentication **e** verificação na coleção `admins`.

- **Painel (`admin.html`):**
  - Indicadores rápidos de solicitações pendentes, aguardando sinal e confirmadas.
  - Gestão de solicitações com filtro por status e por data: aprovar, recusar, cobrar sinal via WhatsApp, confirmar e concluir.
  - **Gestão de Agenda:** horários semanais, horários especiais, bloqueios por data e aviso de conflitos.
  - **Gestão de Catálogo:** criar, editar, arquivar ou reativar serviços e pacotes sem apagar o histórico.
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
2. A API confere duração, agenda e conflitos, registra a solicitação `pendente` e retorna a referência de consulta. Repetir o mesmo envio após uma falha de rede retorna a solicitação existente.
3. A cliente pode informar o Pix quando o sinal é aplicável e a chave está configurada. O aviso fica registrado para análise.
4. Carol aprova, recusa ou cancela a solicitação. Se o sinal se aplicar, a confirmação exige a ação manual após verificar o recebimento. As ações registram responsável e data.
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
| **Persistência** | [Firebase](https://firebase.google.com/) (SDK cliente 9.22 compat e Firebase Admin na API) | Firestore e transações de agenda |
| **Banco de Dados** | Firestore | Banco NoSQL em tempo real |
| **Autenticação** | Firebase Auth | Login seguro do painel admin |
| **Build/Deploy** | Node.js 22 + Vercel | API em `/api/booking` e site estático em `public/` |
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
├── api/booking.mjs         # Entrada da API na Vercel
├── server/                 # Regras de agenda, catálogo, clientes e agendamento
├── tests/                  # Testes da API com banco em memória ou emulador
├── build.js                # Gera public/ e a configuração do Firebase para o navegador
├── firestore.rules         # Regras de segurança do banco de dados
└── .gitignore
```

---

## 🗄️ Modelo de dados (Firestore)

| Coleção | Documento | Campos principais |
|---|---|---|
| `servicos` | `id` numérico | `id`, `name`, `description`, `duration`, `durationMinutes`, `price`, `icon`, `kind`, `active` |
| `agendamentos` | referência UUID para novos registros | Dados da cliente, cópia do serviço/preço/duração, data, horário, estado, sinal, referência anterior e contagem de reagendamentos |
| `clientes` | telefone normalizado para novos registros | `nome`, `nomeBusca`, `telefone`, `criadoEm` |
| `disponibilidades` | data (AAAA-MM-DD) | Janelas especiais e horários bloqueados |
| `configuracoes` | `agenda` e `catalogo` | Janelas semanais e sequência do catálogo |
| `agendaLocks` | data (AAAA-MM-DD) | Marcador para serializar alterações simultâneas da agenda |
| `agendaAuditoria` | automático | Ação, identificador do agendamento, responsável, estado anterior/novo e data |
| `galeria` | automático | `url`, `alt`, `ordem` |
| `admins` | UID do usuário | Presença do documento autoriza o acesso ao painel |

**Status:** `pendente`, `aguardando-sinal`, `confirmado`, `concluido`, `recusado`, `cancelado`.
**Agenda inicial:** janelas das 09:00 às 12:30 e das 14:00 às 17:30, derivadas dos seis horários do ZIP. O cálculo usa `America/Sao_Paulo`. Valide as janelas e durações com a Carol antes de ativar para clientes.

> Se a coleção estiver vazia, a Carol pode carregar os três serviços iniciais pela seção de catálogo do painel.

---

## 🚀 Como Executar e Configurar

### 1. Pré-requisitos

- Node.js 22, seguido de `npm ci` para instalar as dependências.
- Um projeto de homologação no [Firebase](https://console.firebase.google.com/) com **Firestore** e **Authentication (E-mail/Senha)** ativados para testar com contas reais de homologação.

### 2. Configurar o Firebase

Defina as variáveis públicas abaixo e rode `npm run build`. A saída do navegador fica em `public/`.

```text
FIREBASE_API_KEY
FIREBASE_AUTH_DOMAIN
FIREBASE_PROJECT_ID
FIREBASE_STORAGE_BUCKET
FIREBASE_MESSAGING_SENDER_ID
FIREBASE_APP_ID
```

Configure `FIREBASE_SERVICE_ACCOUNT_JSON` somente no ambiente da função na Vercel. Use uma conta de serviço do mesmo projeto com acesso aos dados do Firestore, em uma variável sensível. A aplicação local pode usar `GOOGLE_APPLICATION_CREDENTIALS` ou `FIRESTORE_EMULATOR_HOST`.

### 3. Personalizar os dados do estúdio

Em `js/app-core.js`, edite:

```js
const PIX_KEY  = 'carol@exemplo.com'; // chave PIX exibida no agendamento
const WHATSAPP = '5511999999999';     // número usado nos links de WhatsApp
```

Cadastre as janelas e exceções pelo painel. O sinal de R$ 30 é definido pela API e a tela de agendamento usa o valor retornado. Com a chave de exemplo, a tela orienta tratar o Pix com a Carol.

### 4. Criar o acesso da Carol

1. No Firebase Authentication, crie o usuário (e-mail e senha) da Carol.
2. No Firestore, crie o documento `admins/{UID do usuário}` (pode estar vazio). Sem ele, o login é recusado no painel, no dashboard e na carteira de clientes.

### 5. Rodar localmente

Execute o serviço com `vercel dev` para disponibilizar a API e as páginas no mesmo domínio. Para executar somente os testes da API, sem configuração da Vercel:

```bash
npm test
```

O roteiro de homologação e os cenários exercitados estão em [docs/HOMOLOGACAO.md](docs/HOMOLOGACAO.md).

---

## ☁️ Deploy na Vercel

1. Importe o repositório na Vercel.
2. Cadastre as variáveis públicas de configuração e a credencial sensível na Vercel em Preview, apontando para o projeto de homologação.
3. Use o `vercel.json` do projeto. O build gera `public/`, e a Vercel empacota o ponto de entrada em `api/`.
4. Em Authentication → Settings → Authorized domains, adicione o domínio de homologação.
5. Publique as regras com `firebase deploy --only firestore:rules --project ID_DO_FIREBASE_DE_HOMOLOGACAO`. Faça a troca das regras e do site em conjunto, pois as telas antigas enviavam o agendamento diretamente ao Firestore.

---

## 🔒 Segurança (Firestore Rules)

As regras ficam em `firestore.rules` e devem ser publicadas no Firebase (Console ou `firebase deploy --only firestore:rules`).

Pontos de atenção:

- O painel, o dashboard e a carteira de clientes só abrem para usuários autenticados que tenham documento em `admins/{uid}`.
- As clientes enviam solicitações pela API. A consulta pública exige referência aleatória e WhatsApp correspondente. As coleções pessoais são restritas ao painel autenticado.
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
