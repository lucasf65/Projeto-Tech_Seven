# 💅 Nails by Nascimento — Sistema de Agendamento

> Protótipo web e documentação desenvolvidos como parte da AAP 4 do projeto **Tech Seven**[cite: 4, 5].

## 📋 Sobre o Projeto

O **Nails by Nascimento** é uma aplicação web voltada para a gestão de agendamentos de um estúdio de manicure profissional (Carol Nascimento). O sistema permite que clientes marquem horários de forma simples e rápida sem precisar criar senhas[cite: 4], enquanto a profissional gerencia a agenda, status de atendimento, disponibilidades e faturamento através de um painel administrativo protegido.

 🛠️ Tecnologias Utilizadas

Este projeto foi construído utilizando as seguintes tecnologias e ferramentas:

* **Front-end:** HTML5, CSS3 e JavaScript (Vanilla)[cite: 1, 4, 6]
* **Banco de Dados & Backend:** Firebase Firestore e Firebase Authentication[cite: 1, 2, 3]
* **Estilização:** Google Fonts (Cormorant Garamond e Poppins) e design responsivo customizado[cite: 4, 6]

## 🗂️ Estrutura do Repositório

A organização dos arquivos e pastas do projeto segue a seguinte estrutura:

```text
├── docs/
│   ├── 01-requisitos/    # Levantamento de requisitos do sistema
│   ├── 02-modelagem/     # Diagramas BPMN, DER e modelo de banco de dados
│   ├── 03-processo/      # Fluxo completo do processo (AS IS / TO BE)[cite: 5]
│   └── 04-entrega/       # Aplicação funcional e monografia[cite: 5]
├── index.html            # Página principal da aplicação web[cite: 4, 5]
├── app.js                # Lógica principal e integração com Firebase[cite: 1, 5]
├── styles.css            # Folha de estilos global[cite: 5, 6]
├── firebase-config.js    # Configuração de conexão com o Firebase[cite: 2, 5]
├── firestore.rules       # Regras de segurança do Firestore
├── logo.png              # Logotipo oficial da marca[cite: 4, 5]
└── README.md             # Documentação do projeto
