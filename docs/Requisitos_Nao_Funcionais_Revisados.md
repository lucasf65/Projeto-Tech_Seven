# Requisitos Não Funcionais Revisados

**Projeto:** Tech Seven — Sistema Web de Agendamento de Manicure  
**Escopo:** critérios de qualidade verificáveis para a aplicação web pública e sua área administrativa.  
**Status:** versão para validação; metas propostas e decisões não confirmadas estão identificadas.

## 1. Premissas

A solução é um site acessado por navegador, inclusive por link compartilhado no WhatsApp Business. O sistema administra solicitações de manicure, agenda, serviços, clientes e situação de sinal, conforme os requisitos funcionais revisados.

Os guias de assistência técnica foram usados somente para orientar a estrutura. Requisitos de aplicativo Android/iOS, pagamentos integrados, parceiros, logística de coleta e expansão geográfica foram excluídos por não serem justificados pelo escopo atual.

As metas numéricas abaixo são critérios propostos para validação do projeto, não compromissos já aprovados. Não se presume infraestrutura, provedor ou arquitetura específica.

## 2. Desempenho

**RNF01 — Tempo de resposta das consultas**  
Em ambiente de referência acordado, 95% das consultas ao catálogo, às datas disponíveis e aos horários disponíveis devem responder em até 3 segundos, medidos do envio da requisição à API até a resposta completa, excluindo latência da rede do usuário.

**Verificação:** executar pelo menos 100 consultas por tipo de operação com dados representativos e registrar percentil 95.  
**PENDÊNCIA:** definir ambiente de referência, volume de dados e carga concorrente do teste.

**RNF02 — Resposta das ações comuns**  
Em ambiente de referência, 95% das ações comuns de envio de solicitação, consulta administrativa e alteração de estado devem responder em até 3 segundos, exceto operações externas de notificação, que devem ocorrer de forma assíncrona.

**Verificação:** medir pelo menos 100 execuções por operação e registrar percentil 95.  
**PENDÊNCIA:** validar a meta e os parâmetros de carga junto à equipe.

## 3. Integridade, confiabilidade e recuperação

**RNF03 — Exclusividade de horário**  
A persistência deve impedir que duas solicitações ativas incompatíveis reservem ou confirmem o mesmo horário. A validação deve ocorrer no servidor e ser protegida contra requisições simultâneas; a interface não é mecanismo suficiente de integridade.

**Verificação:** enviar pelo menos 20 requisições concorrentes para a mesma vaga; no máximo uma pode obter a reserva/confirmar, e as demais devem receber conflito sem gravação ativa duplicada.

**RNF04 — Persistência consistente**  
Uma operação de agendamento deve persistir seus dados relacionados de forma consistente: cliente, serviço, data/hora, estado e preço aplicável. Falha parcial não deve deixar o horário ocupado sem registro consultável correspondente.

**Verificação:** simular falha durante a gravação e confirmar que a operação é revertida ou recuperável sem estado parcial visível.

**RNF05 — Expiração de reserva (condicional)**  
Se Carol aprovar reserva temporária para solicitações pendentes, o sistema deve liberar automaticamente a vaga ao fim do prazo configurado e impedir que processo atrasado confirme uma solicitação já expirada.

**PENDÊNCIA:** o prazo de 15 minutos é apenas proposta presente em documento anterior. O requisito só entra em vigor após confirmação do prazo e da regra de expiração.

**RNF06 — Backup e restauração**  
A base de dados deve possuir cópias de segurança automáticas com periodicidade definida e procedimento documentado de restauração. Uma restauração de verificação deve ser realizada antes da entrada em produção e periodicamente conforme política aprovada.

**Critério de aceite:** documentar frequência, retenção, responsável e resultado de teste de restauração.  
**PENDÊNCIA:** definir frequência, retenção, RPO e RTO; não há metas confirmadas nos documentos atuais.

**RNF07 — Disponibilidade**  
A página pública e a área administrativa devem ter uma meta mensal de disponibilidade acordada, calculada como tempo em que as funções essenciais respondem corretamente dividido pelo tempo total do mês, excluindo apenas janelas de manutenção previamente comunicadas.

**PENDÊNCIA:** 99% mensal aparece como sugestão em documento anterior, não como compromisso aprovado. Confirmar meta, método de monitoramento, manutenção e provedor antes de tratar como obrigação.

## 4. Segurança e privacidade

**RNF08 — Acesso à área administrativa**  
A área administrativa deve exigir autenticação. Requisições sem sessão válida ou sem autorização devem ser negadas no servidor, inclusive quando chamadas diretamente à API. No escopo atual, Carol é a única administradora prevista.

**Verificação:** testar acesso anônimo e chamadas diretas a cada operação administrativa; nenhuma deve retornar dados ou executar alterações.

**PENDÊNCIA:** definir mecanismo de autenticação, política de sessão e eventual inclusão de outros operadores.

**RNF09 — Proteção de credenciais e sessão**  
Senhas, se utilizadas, não devem ser armazenadas em texto puro; devem ser protegidas por função de hash apropriada e sal individual. Sessões devem usar transporte HTTPS e cookies com atributos de segurança adequados ao ambiente. A sessão deve expirar após período de inatividade configurado.

**Verificação:** inspecionar armazenamento de credenciais e cookies em ambiente publicado e confirmar expiração conforme configuração.  
**PENDÊNCIA:** definir o período de inatividade.

**RNF10 — Transporte e segredos**  
Em produção, páginas e APIs devem usar HTTPS. Segredos de integração e credenciais de serviço não devem ser expostos no código entregue ao navegador, no repositório ou em mensagens de erro.

**Verificação:** acessar por HTTP e confirmar redirecionamento para HTTPS; inspecionar artefatos publicados e respostas de erro quanto à exposição de segredos.

**RNF11 — Minimização e finalidade dos dados**  
O sistema deve coletar apenas dados necessários ao agendamento e apresentar, antes do envio, aviso claro sobre finalidade e contato do responsável pelo tratamento. O histórico de clientes deve ser restrito à área autenticada.

**Verificação:** comparar campos do formulário e dados persistidos com a finalidade declarada; confirmar que o histórico não é acessível pela área pública.

**PENDÊNCIA:** validar texto do aviso, base legal, canal de solicitações dos titulares, prazos de retenção e procedimento de correção ou exclusão com a responsável pelo projeto.

**RNF12 — Registro de alterações**  
Alterações administrativas em agendamentos e situação de sinal devem registrar ação e data/hora; quando houver usuário autenticado, registrar também o identificador desse usuário. Registros devem poder ser consultados por Carol e não devem ser alteráveis pela interface comum.

**Verificação:** executar aprovação, recusa, cancelamento, reagendamento e mudança de sinal; confirmar evento associado com os campos definidos.

## 5. Usabilidade, acessibilidade e compatibilidade

**RNF13 — Fluxo móvel de solicitação**  
Em teste com pelo menos 5 pessoas representativas do público-alvo, pelo menos 4 devem conseguir enviar uma solicitação válida sem ajuda em até 3 minutos cada, usando celular e dados de teste fornecidos.

**Verificação:** registrar tempo e conclusão de cada participante; avaliar dificuldades e corrigir bloqueios de conclusão.  
**PENDÊNCIA:** aprovar tamanho e perfil da amostra; a meta é proposta para o projeto.

**RNF14 — Layout responsivo**  
As funções de consulta de serviços, seleção de data/horário e envio de solicitação devem permanecer disponíveis sem rolagem horizontal em larguras de viewport a partir de 320 CSS pixels até telas desktop de 1920 CSS pixels.

**Verificação:** testar as larguras de 320, 375, 768, 1024 e 1920 CSS pixels, incluindo orientação retrato e paisagem em dispositivo móvel.

**RNF15 — Acessibilidade**  
Os fluxos essenciais devem atender aos critérios WCAG 2.2 nível AA aplicáveis, incluindo uso por teclado, foco visível, rótulos programáticos em campos, mensagens associadas aos erros, contraste e alternativas textuais para imagens informativas.

**Verificação:** revisão automatizada complementar e inspeção manual por teclado e leitor de tela nos fluxos de solicitação e administração. Ferramenta automatizada isolada não comprova conformidade.

**RNF16 — Clareza de mensagens**  
Mensagens de validação, indisponibilidade e falha devem explicar a ação necessária em linguagem compreensível e não exibir stack traces, códigos internos, consultas ou detalhes de infraestrutura.

**Verificação:** provocar erros de validação, conflito de horário e falha do servidor; confirmar orientação para a pessoa usuária e ausência de detalhes técnicos sensíveis.

**RNF17 — Navegadores suportados**  
As funções essenciais devem operar nas versões estáveis atuais e nas duas versões principais anteriores de Chrome, Edge, Firefox e Safari, em desktop e dispositivos móveis quando o navegador estiver disponível. A abertura por link do WhatsApp deve funcionar no navegador padrão do dispositivo.

**Verificação:** executar o fluxo completo de solicitação e o fluxo administrativo nos navegadores e versões definidos na data de cada ciclo de validação.  
**PENDÊNCIA:** confirmar os navegadores prioritários do público e a disponibilidade de ambientes para teste.

## 6. Manutenibilidade e operação

**RNF18 — Separação de responsabilidades**  
A implementação deve manter validações de negócio no servidor/API, persistência em camada de dados e apresentação na interface web. A interface não deve ser a única responsável por regras de disponibilidade, autorização, sinal ou reagendamento.

**Verificação:** revisar os fluxos de criação/aprovação e confirmar que as regras são aplicadas mesmo em chamadas diretas à API.

**RNF19 — Erros operacionais e notificações externas**  
Falha de envio de lembrete ou de serviço externo não deve modificar nem cancelar agendamento. Quando a integração de lembretes for aprovada, o sistema deve registrar o resultado da tentativa e disponibilizar a falha à administradora; novas tentativas devem respeitar política configurada.

**PENDÊNCIA:** depende de confirmação e contratação/configuração de integração WhatsApp, além de política de tentativas. Não pressupõe envio em tempo real.

**RNF20 — Compatibilidade de migração**  
Alterações no esquema da base de dados devem ser versionadas e reproduzíveis em ambiente limpo, sem depender de edição manual de registros de produção.

**Verificação:** aplicar todas as migrações em banco vazio e confirmar criação do esquema esperado; documentar procedimento de reversão ou recuperação para mudanças incompatíveis.

## 7. Itens intencionalmente excluídos

- Disponibilidade 24x7 ou tempo real sem meta e infraestrutura aprovadas.
- Aplicativos nativos Android/iOS; o escopo é aplicação web responsiva.
- Pagamento integrado e comprovantes financeiros; a regra e o método de confirmação do sinal ainda dependem de decisão.
- Escalabilidade para grande número de regiões, parceiros ou operadores não prevista no projeto atual.
- Garantias genéricas como “ser simples”, “ser seguro” ou “suportar muitos usuários” sem cenário ou critério de medição.

## 8. Pendências prioritárias

1. Confirmar meta mensal de disponibilidade e ambiente de referência de desempenho.
2. Definir política de backup, retenção, RPO e RTO.
3. Definir autenticação administrativa e duração de sessão.
4. Validar aviso de privacidade, retenção e atendimento a solicitações sobre dados.
5. Confirmar reserva temporária, prazo e regra de expiração.
6. Confirmar integração WhatsApp, consentimento, antecedência e tentativas.
7. Definir navegadores prioritários e parâmetros do teste de usabilidade.

## 9. Referências de elaboração

Os requisitos foram revisados a partir dos documentos próprios do projeto Tech Seven sobre agendamento de manicure e do levantamento de requisitos do projeto. Os exemplos do grupo de assistência técnica foram usados apenas para orientar organização e tornar critérios verificáveis; funcionalidades incompatíveis foram removidas. A referência de acessibilidade é WCAG 2.2 nível AA; obrigações de privacidade devem ser validadas pela equipe responsável à luz da LGPD.

