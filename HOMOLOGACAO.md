# Homologação do agendamento

Versão entregue em 22 de novembro de 2026 a partir de `Projeto-Tech_Seven-main.zip`. Os testes usaram dados fictícios e Firestore Emulator 1.22.0 em loopback. Os testes no navegador usaram Microsoft Edge, com autenticação administrativa simulada e persistência no emulador.

## Cards do Trello

| Card | Entrega e verificação |
| --- | --- |
| [#136 Integração do fluxo da cliente](https://trello.com/c/bucOcLk4) | Formulário consulta a API, valida dados e grava a solicitação pendente. O resumo usa o serviço, o valor e a data retornados pela API. Reenvio após perder a resposta reutiliza a mesma referência. |
| [#12 Bloqueio de horários ocupados](https://trello.com/c/hoYaxMEJ) | Disponibilidade respeita sobreposição pela duração. De vinte solicitações concorrentes para a mesma vaga, uma foi registrada e dezenove receberam indisponibilidade. |
| [#57 API de clientes](https://trello.com/c/ysJPGptF) | Telefones brasileiros são normalizados. Envio repetido com e sem `+55` reaproveita o cadastro. Consultas por nome e telefone exigem acesso administrativo. |
| [#58 API de serviços e pacotes](https://trello.com/c/GF3CJMwP) | Catálogo público retorna itens ativos. O painel cria, edita, arquiva e reativa serviços e pacotes. Agendamentos mantêm seus dados históricos. |
| [#59 Telas públicas da solicitação](https://trello.com/c/p19yfKz9) | Seleção, calendário, horário, identificação e resumo foram exercitados no navegador, incluindo viewport de 320 px. |
| [#60 Mensagens acessíveis](https://trello.com/c/xfIOIz1v) | Validação associa rótulos, erros e foco aos campos. Carregamento, datas sem horário e indisponibilidade apresentam mensagens e opção de tentar novamente quando aplicável. |
| [#61 Disponibilidade e exceções](https://trello.com/c/54Z2AybI) | Painel configura janelas semanais, horários especiais, datas fechadas e bloqueios pontuais. O servidor rejeita alterações conflitantes com agendamentos existentes. |
| [#62 Estados e aprovação manual](https://trello.com/c/anZetPs1) | A API restringe transições por estado e registra a decisão, a data e o responsável. A Carol verifica o sinal antes de confirmar quando ele é aplicável. |
| [#67 Testes de integração](https://trello.com/c/MssApBvR) | Testado da escolha do serviço até aprovação, consulta e histórico. As capturas e os registros técnicos reproduzem a execução local. |
| [#144 Horários livres por serviço e data](https://trello.com/c/mFyJgse5) | `GET /api/booking?action=availability&serviceId=1&date=AAAA-MM-DD` retorna `{ "slots": ["09:00", "11:00"] }` ou `{ "slots": [] }`. As evidências incluem chamadas reais ao ambiente local. |

## Reproduzir os testes

Com Node.js 22 e as dependências instaladas por `npm ci`, execute `npm test`. Essa execução usa um banco em memória e testa o mesmo código da API utilizado na Vercel.

Para executar os mesmos casos com persistência no emulador, inicie `firebase emulators:start --only firestore --project demo-tech-seven` e depois execute no PowerShell:

```powershell
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8087'
$env:BOOKING_TEST_EMULATOR = '1'
npm test
```

O roteiro elimina apenas as bases descartáveis que cria no emulador. O resultado esperado da suíte é **8 casos aprovados**. O build estático foi verificado com credenciais públicas fictícias. As regras foram verificadas separadamente por chamadas diretas ao emulador, que negou leituras anônimas de agendamentos, clientes, serviços e auditoria e negou a criação direta de agendamentos.

## Evidências

- [Formulário móvel](evidencias-homologacao/01-formulario-mobile.png) e [solicitação pendente](evidencias-homologacao/02-solicitacao-pendente.png).
- [Painel após confirmação](evidencias-homologacao/03-painel-confirmado.png), [histórico da cliente](evidencias-homologacao/04-historico-cliente.png) e [consulta com referência](evidencias-homologacao/05-consulta-confirmada.png).
- [Requisições e respostas](evidencias-homologacao/requisicoes-de-teste.json) e [registros persistidos](evidencias-homologacao/registro-de-teste.json).

## Validação no ambiente da equipe

Antes de disponibilizar esta versão às clientes, valide no Preview da Vercel com um Firebase de homologação, habilite o acesso da Carol e configure a chave Pix do estúdio. Confirme com ela os horários e as durações iniciais. A versão mantém o fluxo de aviso de Pix seguido de conferência manual. A política de expiração das reservas pendentes e a janela mínima de cancelamento seguem pendentes de decisão. A consulta pública usa WhatsApp mais a referência da nova solicitação. Horários antigos continuam visíveis à Carol no painel.
