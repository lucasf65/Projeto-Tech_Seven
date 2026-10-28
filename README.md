# 💅 Nails by Nascimento — Sistema de Agendamento

![Status do Projeto](https://img.shields.io/badge/status-conclu%C3%ADdo-success)
![Versão](https://img.shields.io/badge/vers%C3%A3o-1.0.0-blue)
![Licença](https://img.shields.io/badge/licen%C3%A7a-Acad%C3%AAmica-lightgrey)

Sistema web completo e responsivo para gestão de agendamentos de um estúdio de manicure. Desenvolvido para otimizar o fluxo de trabalho da profissional (Carol) e proporcionar uma experiência de agendamento premium e sem fricção para as clientes.

---

## 📑 Índice

- [✨ Funcionalidades](#-funcionalidades)
- [🛠️ Tecnologias Utilizadas](#️-tecnologias-utilizadas)
- [📂 Estrutura do Projeto](#-estrutura-do-projeto)
- [🚀 Como Executar e Configurar](#-como-executar-e-configurar)
- [🔒 Segurança (Firestore Rules)](#-segurança-firestore-rules)
- [🎨 Design System](#-design-system)
- [📝 Licença](#-licença)

---

## ✨ Funcionalidades

O sistema foi dividido em duas grandes áreas: **Área da Cliente** e **Área Administrativa**.

### 👩‍🦰 Área da Cliente (Público)

- **Site Institucional:** Páginas de Início, Serviços, Preços, Galeria e Sobre, todas alimentadas dinamicamente pelo banco de dados.
- **Agendamento Inteligente:** Fluxo em 4 etapas (Serviço → Data/Hora → Dados → Sinal PIX).
- **Calendário Customizado:** Interface elegante para escolha de datas, bloqueando dias passados e horários já ocupados.
- **Pagamento de Sinal:** Integração visual com chave PIX para reserva do horário.
- **Consulta de Horários:** Área "Meus Horários" onde a cliente pode consultar, cancelar ou reagendar seu atendimento usando apenas o WhatsApp.
- **Galeria Dinâmica:** Portfólio com suporte a até 9 fotos (ou mais) exibidas em uma grade responsiva.
- **Design Responsivo:** Experiência fluida em computadores, tablets e celulares.

### 👑 Área Administrativa (Carol)

- **Autenticação Segura:** Login exclusivo via Firebase Authentication (E-mail/Senha).
- **Dashboard Inteligente:** Visualização rápida de solicitações pendentes, aguardando sinal e confirmadas no dia.
- **Gestão de Solicitações:** Aprovar, recusar, cobrar sinal via WhatsApp, confirmar e concluir atendimentos.
- **Gestão de Agenda:** Modal interativo para bloquear ou liberar horários específicos em qualquer data.
- **Gestão de Catálogo:** Criar, editar e excluir serviços (Nome, Descrição, Duração, Preço e Emoji).
- **Gestão de Galeria:** Adicionar e remover fotos do portfólio dinamicamente.
- **Relatório de Faturamento:** Cálculo automático da receita baseada nos atendimentos concluídos.

---

## 🛠️ Tecnologias Utilizadas

O projeto foi construído utilizando tecnologias web nativas (Vanilla) para garantir máxima performance e leveza, sem a necessidade de frameworks complexos.

| Camada | Tecnologia | Descrição |
|---|---|---|
| **Frontend** | HTML5 | Estrutura semântica das páginas |
| **Frontend** | CSS3 | Design System próprio com CSS Variables |
| **Frontend** | JavaScript (ES6+) | Lógica do lado do cliente |
| **BaaS** | [Firebase](https://firebase.google.com/) | Backend as a Service |
| **Banco de Dados** | Firestore | Banco NoSQL em tempo real |
| **Autenticação** | Firebase Auth | Login seguro do painel admin |
| **Tipografia** | Google Fonts | Cormorant Garamond + Poppins |

---

## 📂 Estrutura do Projeto

A arquitetura foi pensada para ser modular e de fácil manutenção:

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
│
├── /css
│   └── styles.css          # Design System global (13 seções organizadas)
│
├── /js
│   ├── firebase-config.js  # Credenciais do Firebase
│   ├── app-core.js         # Funções utilitárias e globais
│   ├── site.js             # Renderização das páginas públicas
│   ├── booking.js          # Lógica do agendamento e calendário
│   ├── lookup.js           # Lógica da consulta "Meus Horários"
│   └── admin.js            # Lógica do painel administrativo
│
├── /assets
│   ├── logo.png
│   ├── hero.jpg
│   ├── carol.jpg
│   └── /gallery            # Fotos do portfólio (01.jpg a 09.jpg)
│
└── firestore.rules         # Regras de segurança do banco de dados
