**Projeto:** Tech Seven — Sistema Web de Agendamento de Manicure
**Escopo:** Critérios de qualidade verificáveis para a aplicação web pública e sua área administrativa.
**Status:** Versão corrigida com numeração estrita e regras de sinal/Pix integradas.

## 1. Desempenho

### RNF01 — Tempo de resposta das consultas

Em ambiente de referência acordado, 95% das consultas ao catálogo, às datas disponíveis e aos horários disponíveis devem responder em até 3 segundos, medidos do envio da requisição à API até a resposta completa, excluindo latência da rede do usuário.
- **Verificação:** Executar pelo menos 100 consultas por tipo de operação com dados representativos e registrar percentil 95.

### RNF02 — Resposta das ações comuns

Em ambiente de referência, 95% das ações comuns de envio de solicitação, consulta administrativa e alteração de estado devem responder em até 3 segundos, exceto operações externas de notificação e o processamento do upload do comprovante Pix, que devem ocorrer de forma assíncrona.
- **Verificação:** Medir pelo menos 100 execuções por operação e registrar percentil 95.

## 2. Integridade, Confiabilidade e Recuperação

### RNF03 — Exclusividade de horário

A persistência deve impedir que duas solicitações ativas incompatíveis reservem ou confirmem o mesmo horário. A validação deve ocorrer no servidor e ser protegida contra requisições simultâneas por meio de travas transacionais; a interface não é mecanismo suficiente de integridade.
- **Verificação:** Enviar pelo menos 20 requisições concorrentes para a mesma vaga; no máximo uma pode obter a reserva/confirmar, e as demais devem receber erro de conflito (HTTP 409) sem gravação ativa duplicada.

### RNF04 — Persistência consistente

Uma operação de agendamento deve persistir seus dados relacionados de forma consistente: cliente, serviço, data/hora, estado e preço aplicável. Falha parcial não deve deixar o horário ocupado sem registro consultável correspondente.
- **Verificação:** Simular falha durante a gravação e confirmar que a operação é revertida (rollback) ou recuperável sem estado parcial visível.

### RNF05 — Expiração de reserva (Destravado)

Com a aprovação da Carol, o sistema deve iniciar um cronômetro de 15 minutos assim que a vaga for selecionada. Caso o upload do comprovante do Pix não seja concluído e enviado dentro deste prazo, o servidor deve liberar automaticamente a vaga e impedir que processos atrasados confirmem uma solicitação já expirada.
- **Verificação:** Iniciar fluxo, aguardar 15 minutos sem anexar o arquivo e validar a liberação automática do horário no calendário público.

### RNF06 — Backup e restauração

A base de dados deve possuir cópias de segurança automáticas diárias armazenadas em ambiente de nuvem fisicamente isolado. O procedimento de restauração deve ser documentado. Uma restauração de verificação deve ser realizada antes da entrada em produção e periodicamente.
- **Meta Proposta:** Tempo máximo de perda de dados tolerado (RPO) de 24 horas e tempo de recuperação do sistema (RTO) de até 4 horas.

### RNF07 — Disponibilidade

A página pública e a área administrativa devem ter uma meta mensal de disponibilidade (Uptime) de 99,5%, calculada como o tempo em que as funções essenciais respondem corretamente dividido pelo tempo total do mês, excluindo apenas janelas de manutenção previamente comunicadas com 48h de antecedência.

## 3. Segurança e Privacidade

### RNF08 — Acesso à área administrativa

A área administrativa deve exigir autenticação estrita. Requisições sem sessão válida ou sem autorização devem ser negadas no servidor com código HTTP 401 ou 403, inclusive quando chamadas diretamente à API. No escopo atual, Carol Nascimento é a única administradora prevista.
- **Verificação:** Testar acesso anônimo e chamadas diretas a cada operação administrativa; nenhuma deve retornar dados ou executar alterações.

### RNF09 — Proteção de credenciais e sessão

Senhas não devem ser armazenadas em texto puro; devem ser protegidas por função de hash apropriada (ex: BCrypt ou Argon2id) e sal individual. Sessões devem usar transporte HTTPS e cookies com atributos de segurança (HttpOnly, Secure, SameSite). A sessão administrativa deve expirar por inatividade após 60 minutos.

### RNF10 — Transporte e segredos

Em produção, páginas e APIs devem usar obrigatoriamente HTTPS. Segredos de integração, chaves privadas e credenciais de serviço não devem ser expostos no código entregue ao navegador, no repositório de código ou em mensagens de erro exibidas ao usuário.
- **Verificação:** Acessar por HTTP e confirmar redirecionamento automático para HTTPS; inspecionar respostas de erro para garantir o mascaramento de logs internos do banco.

### RNF11 — Minimização e finalidade dos dados (LGPD)

O sistema deve coletar apenas o nome completo e o WhatsApp, estritamente necessários ao agendamento, e apresentar, antes do envio, um aviso claro sobre a finalidade do tratamento de dados. O histórico de clientes deve ser restrito exclusivamente à área autenticada.
- **Verificação:** Confirmar que o histórico e os dados pessoais das clientes não são indexáveis ou acessíveis por rotas públicas sem token de administradora.

### RNF12 — Registro de alterações (Trilha de Auditoria)

Alterações administrativas em agendamentos e situação de sinal devem registrar a ação realizada, o ID do registro modificado e o carimbo de data/hora. Como Carol é a única operadora autenticada, o sistema deve vincular o identificador dela a cada log gerado. Os registros não podem ser alterados ou apagados pela interface comum.

## 4. Usabilidade, Acessibilidade e Compatibilidade

### RNF13 — Fluxo móvel de solicitação (Teste de Usabilidade)

Em teste com pelo menos 5 pessoas representativas do público-alvo, pelo menos 4 devem conseguir enviar uma solicitação válida (incluindo a etapa de upload do comprovante Pix) sem ajuda em até 3 minutos cada, usando celular e dados de teste fornecidos.
- **Verificação:** Registrar tempo e conclusão de cada participante; avaliar dificuldades e corrigir bloqueios antes do lançamento.

### RNF14 — Layout responsivo

As funções de consulta de serviços, seleção de data/horário e envio de solicitação devem permanecer disponíveis sem quebras ou necessidade de rolagem horizontal em larguras de viewport a partir de 320 CSS pixels até telas desktop de 1920 CSS pixels.

### RNF15 — Acessibilidade

Os fluxos essenciais devem atender aos critérios WCAG 2.2 nível AA aplicáveis, incluindo navegabilidade total por teclado, foco visual ativo, rótulos programáticos em todos os campos de formulário, leitor de tela para mensagens de erro, contraste de cores adequado e textos alternativos (alt) nas imagens do catálogo.

### RNF16 — Clareza de mensagens

Mensagens de validação, indisponibilidade e falha devem explicar a ação necessária em linguagem compreensível para o usuário leigo e nunca exibir stack traces, códigos internos de erro SQL ou detalhes da infraestrutura do servidor.

### RNF17 — Navegadores suportados

As funções essenciais devem operar nas versões estáveis atuais e nas duas versões principais anteriores de Chrome, Edge, Firefox e Safari, em desktop e dispositivos móveis. A abertura por link compartilhado do WhatsApp Business deve funcionar perfeitamente no navegador padrão configurado no dispositivo da cliente.

## 5. Manutenibilidade e Operação

### RNF18 — Separação de responsabilidades (Arquitetura)

A implementação deve isolar rigidamente as validações de negócio no servidor/API, a persistência na camada de dados (banco de dados) e a apresentação na interface web (front-end). A interface não deve ser a autoridade isolada por regras de disponibilidade, autorização, cálculo de sinal ou reagendamentos.

### RNF19 — Erros operacionais e notificações externas

Falhas de envio de lembretes pelo WhatsApp ou quedas na API do fornecedor de mensagens não podem, sob hipótese alguma, corromper, modificar ou cancelar um agendamento confirmado no sistema principal. O sistema deve registrar a falha em log e disponibilizar o status do envio para a administradora.

### RNF20 — Compatibilidade de migração

Alterações no esquema da base de dados devem ser estritamente versionadas por arquivos de migração (database migrations) e reproduzíveis em ambiente limpo, sem depender de edições manuais em registros de produção.

### RNF21 — Armazenamento seguro de uploads 

Os arquivos de comprovante Pix enviados pelas clientes novas devem ser salvos em um repositório de objetos privado (ex: AWS S3). O servidor da API deve validar os arquivos recebidos aceitando estritamente os formatos .jpg, .jpeg, .png e .pdf, aplicando um limite máximo de tamanho de 5MB por arquivo para mitigar ataques de negação de serviço (DoS).
