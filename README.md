# Nails by Nascimento — versão para homologação

Base GitHub: `40fd6805ed9305b84acb85e68e5c157568144d82` da `main`. O pacote contém o código executável, as configurações de exemplo e os testes.

O primeiro pedido prevê sinal de R$ 30. A Carol recebe o comprovante pelo WhatsApp e confirma o pagamento no painel. Uma cliente com cadastro anterior validado agenda sem sinal. A cliente confirma o telefone por SMS e usa a referência para acessar o seu horário. A troca conserva o horário anterior até a confirmação e respeita o limite de três reagendamentos.

## Testes locais

Use Node.js 22. Execute `npm ci` para instalar as dependências do servidor.

```sh
npm test
```

Para testar as transações com o Firestore Emulator, defina `BOOKING_TEST_EMULATOR=1` e `FIRESTORE_EMULATOR_HOST` com o endereço em loopback, depois execute `npm test`. A suíte usa projetos fictícios com prefixo `demo-booking-`. Para testar as permissões, inicie uma instância isolada do emulador com `firestore.rules` e execute `node --test tests/firestore.rules.test.mjs` com o endereço dessa instância em `FIRESTORE_EMULATOR_HOST`.

O teste de interface em `tests/browser-check.mjs` usa Playwright e Edge ou Chromium com Firebase Auth simulado. Informe um navegador instalado em `TECH_SEVEN_EDGE` ou instale um Chromium pelo Playwright. Instale o Playwright num diretório de testes e informe seu caminho em `TECH_SEVEN_PLAYWRIGHT` se o pacote não estiver acessível pela resolução local do Node. Gere `public/` com as variáveis de um projeto fictício e execute `node tests/browser-check.mjs` a partir da raiz. Os testes de navegador bloqueiam as conexões externas.

## Configuração

Configure `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID` e `FIREBASE_APP_ID` e execute `npm run build`.

A API usa `FIREBASE_ADMIN_SERVICE_ACCOUNT` como variável protegida do servidor. O projeto da conta do servidor e o projeto web devem coincidir. Em homologação, configure a autenticação por telefone, o domínio autorizado e a conta administrativa. As regras de Firestore ficam em `firestore.rules`.

No ambiente Preview da Vercel, confirme o ID do projeto de homologação em `STUDIO_PREVIEW_FIREBASE_PROJECT_ID`. O build e a API exigem que o ID corresponda a `FIREBASE_PROJECT_ID`. Use um projeto separado de produção para os testes.

`STUDIO_WHATSAPP` recebe o número do estúdio no formato internacional. Configure um número fictício válido para o teste de interface. Em homologação configure também `STUDIO_PIX_KEY` e, se aplicável, `STUDIO_PIX_NAME` e `STUDIO_PIX_CODE`. O QR é opcional e pode ser configurado com `STUDIO_USE_PIX_QR=true` e `assets/qr-pix.png`.

A Carol pode vincular um cadastro anterior em Clientes após conferir sua titularidade e pedir que a cliente confirme o telefone por SMS. Duplicatas exigem conciliação. Os horários criados no site anterior ficam acessíveis pela área administrativa e exigem atendimento pela Carol até a associação segura ou encerramento. Use somente dados fictícios em homologação.
