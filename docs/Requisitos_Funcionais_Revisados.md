# Requisitos Funcionais Revisados

**Projeto:** Tech Seven — Sistema Web de Agendamento de Manicure  
**Escopo:** levantamento revisado para uma aplicação web de agendamento administrada por Carol Nascimento.  
**Status:** versão para validação; decisões de negócio ainda não confirmadas estão marcadas como **PENDÊNCIA**.

## 1. Premissas e limites do escopo

O sistema recebe solicitações de atendimento, permite que a cliente escolha serviço, data e horário disponíveis e deixa a confirmação final sob análise de Carol. A área administrativa mantém agenda, bloqueios, serviços e histórico de clientes.

O guia de assistência técnica serviu somente de referência de organização e qualidade. Recursos como cadastro de dispositivos, orçamento de reparo, logística de coleta, pagamento integrado, avaliação de assistência, aplicativo Android/iOS e painel de parceiros não se aplicam ao projeto e foram excluídos.

Os requisitos descrevem comportamento observável e indicam as responsabilidades de interface, API e persistência quando isso ajuda a delimitar a implementação. Eles não fixam tecnologia ou arquitetura específica.

## 2. Requisitos funcionais

### 2.1 Acesso e solicitação de agendamento

**RF01 — Acessar a página de agendamento**  
A aplicação deve disponibilizar a página pública por URL direta, incluindo URL compartilhável pelo WhatsApp Business. O acesso não deve exigir instalação de aplicativo.

**Critério de aceite:** a página abre em navegador compatível ao acessar a URL direta e a mesma URL pode ser compartilhada em uma conversa.

**RF02 — Informar dados da cliente**  
A aplicação deve permitir iniciar uma solicitação informando nome completo e número de WhatsApp. Deve validar campos obrigatórios e formato plausível do telefone antes de enviar à API.

**Critério de aceite:** sem nome ou telefone válido, a solicitação não é enviada e o campo inválido recebe mensagem compreensível.

**RF03 — Identificar cliente existente**  
A aplicação deve comparar o telefone informado, em formato normalizado, com os telefones associados a clientes já registrados e usar o resultado na aplicação da regra de sinal definida em RF08. A consulta e a decisão devem ocorrer no servidor.

**Critério de aceite:** formatos equivalentes do mesmo número são tratados conforme a regra de normalização adotada; a interface não pode decidir sozinha se o sinal é devido.

**RF04 — Consultar catálogo de serviços**  
A aplicação deve exibir os serviços ativos com nome, descrição, preço e imagem quando houver imagem cadastrada. Serviços inativos não devem ser oferecidos para novas solicitações.

**Critério de aceite:** cada item visível corresponde aos dados ativos persistidos; ausência de imagem não impede a consulta.

**RF05 — Selecionar serviço ou procedimento**  
A cliente deve poder selecionar um serviço ativo para a solicitação. A API deve validar que o serviço ainda está ativo no momento do envio.

**Critério de aceite:** uma solicitação com serviço inexistente ou inativo é recusada com erro compreensível e não é persistida como válida.

**RF06 — Consultar datas disponíveis**  
Após a seleção do serviço, a aplicação deve apresentar datas com pelo menos um horário disponível, considerando agenda, bloqueios e duração do serviço quando essa duração estiver definida.

**Critério de aceite:** datas sem horário elegível não são oferecidas; a API é a fonte final de disponibilidade.

**PENDÊNCIA RF06:** confirmar horário de funcionamento, antecedência mínima/máxima para agendar, duração de cada serviço e fuso horário oficial.

**RF07 — Consultar e solicitar horário**  
A cliente deve poder consultar os horários disponíveis para uma data e enviar uma solicitação para um horário livre. A API deve revalidar disponibilidade de forma atômica no envio para evitar duas solicitações ocuparem a mesma vaga. A solicitação deve ser registrada como pendente, sem confirmar o atendimento automaticamente.

**Critério de aceite:** em tentativas concorrentes para a mesma vaga, no máximo uma obtém a reserva; as demais recebem indicação de indisponibilidade e não criam solicitação pendente para aquela vaga.

**PENDÊNCIA RF07:** o documento anterior propõe reserva temporária por 15 minutos para solicitações pendentes. Confirmar prazo e regra de expiração com Carol antes de implementar. Enquanto isso, o prazo não é requisito fechado.

### 2.2 Sinal e confirmação

**RF08 — Aplicar regra de sinal**  
O sistema deve identificar se a cliente é nova ou existente e calcular o sinal conforme a regra de negócio confirmada. Os valores e a condição devem ser mantidos no servidor e associados à solicitação para consulta administrativa.

**PENDÊNCIA RF08:** os documentos anteriores propõem sinal de R$ 30,00 apenas para cliente nova. Confirmar valor, definição de “cliente nova”, exceções e se a regra se aplica a todos os serviços. Não presumir cobrança ou integração de pagamento.

**RF09 — Registrar situação do sinal**  
A área administrativa deve permitir consultar e registrar a situação do sinal associada ao agendamento. O registro deve incluir situação, valor aplicável e data/hora da alteração; quando aplicável, registrar o responsável.

**Critério de aceite:** a administradora consegue distinguir sinal não aplicável, pendente e confirmado, caso esses estados sejam aprovados na regra de negócio; cada mudança fica associada ao agendamento.

**PENDÊNCIA RF09:** aprovar lista de estados e definir como Carol confirmará o recebimento (registro manual ou integração externa). Pagamento dentro do site não está confirmado.

**RF10 — Consultar solicitações pendentes**  
A área administrativa deve listar solicitações aguardando análise e apresentar, no mínimo, cliente, telefone, serviço, data, horário, estado e situação do sinal, quando aplicável.

**Critério de aceite:** uma solicitação enviada aparece na lista pendente com os dados persistidos correspondentes.

**RF11 — Aprovar ou recusar solicitação**  
A administradora deve poder aprovar ou recusar uma solicitação pendente. Antes de aprovar, o servidor deve validar novamente a disponibilidade. Uma solicitação recusada não deve ocupar a vaga.

**Critério de aceite:** somente solicitação pendente pode ser aprovada ou recusada; aprovação concorrente não cria sobreposição; recusa registra estado e libera a vaga.

**RF12 — Consultar e gerenciar agenda**  
A administradora deve consultar agendamentos por data e visualizar a ocupação da agenda, distinguindo solicitações pendentes de atendimentos confirmados e demais estados definidos.

**Critério de aceite:** a visualização reflete os dados persistidos e permite identificar horário, serviço, cliente e estado de cada item.

**RF13 — Bloquear e liberar datas ou horários**  
A administradora deve poder bloquear e liberar datas ou intervalos de horário. O sistema não deve oferecer bloqueios para novas solicitações. Bloqueios incompatíveis com agendamentos existentes devem ser sinalizados antes da gravação.

**Critério de aceite:** bloqueio salvo deixa de aparecer como disponível; tentativa de bloquear período ocupado é informada e não altera silenciosamente um agendamento.

**RF14 — Manter estados do agendamento**  
O sistema deve persistir e exibir, no mínimo, os estados pendente, confirmado, recusado, cancelado e expirado. As transições devem ser validadas no servidor e cada alteração deve manter data/hora e responsável quando realizada por pessoa autenticada.

**Critério de aceite:** estados fora das transições permitidas são rejeitados; uma solicitação expirada ou recusada não pode ser confirmada sem nova regra explícita.

**PENDÊNCIA RF14:** confirmar se “expirado” será usado e como se relaciona à eventual reserva temporária de RF07.

### 2.3 Pós-agendamento e manutenção

**RF15 — Solicitar cancelamento**  
A cliente deve poder solicitar cancelamento de um agendamento confirmado. O sistema deve registrar a solicitação e a administradora deve poder decidir ou efetivar o cancelamento conforme a política aprovada.

**PENDÊNCIA RF15:** definir se cancelamento é automático ou depende de aprovação, prazo limite, efeitos sobre sinal e canal de identificação da cliente. Os documentos anteriores citam regras, mas não as especificam.

**RF16 — Solicitar reagendamento**  
A cliente deve poder solicitar outra data ou horário para um agendamento elegível. O sistema deve validar disponibilidade e permitir à administradora aprovar ou recusar a mudança. O horário original permanece associado ao agendamento até a alteração ser aceita.

**Critério de aceite:** recusa mantém data e horário originais; aprovação revalida e grava a nova vaga sem duplicidade.

**RF17 — Controlar limite de reagendamentos**  
O sistema deve contabilizar reagendamentos aceitos por agendamento e bloquear solicitações adicionais ao atingir o limite configurado.

**PENDÊNCIA RF17:** o limite de três consta nos documentos do projeto, mas precisa de confirmação de Carol. Confirmar também se solicitações recusadas contam (proposta: não) e se o limite é configurável.

**RF18 — Gerenciar serviços e pacotes**  
A administradora deve cadastrar, consultar, editar, ativar, desativar e excluir serviços e pacotes com nome, descrição, preço e imagem opcional. A exclusão não deve apagar referências históricas de agendamentos já registrados; quando houver referência, deve-se impedir exclusão física e permitir desativação.

**Critério de aceite:** alterações passam a valer para novas consultas; dados históricos mantêm o serviço e preço associados no momento do agendamento.

**PENDÊNCIA RF18:** confirmar se pacotes fazem parte do escopo inicial. Duração, preço promocional e composição de pacote também dependem de definição.

**RF19 — Consultar histórico de clientes**  
A administradora deve consultar clientes e seus atendimentos anteriores, incluindo data, serviço e estado do agendamento. O acesso deve ocorrer somente pela área autenticada.

**Critério de aceite:** o histórico apresenta somente registros associados ao cliente selecionado e não fica acessível pela página pública.

**RF20 — Registrar alterações administrativas**  
O sistema deve registrar alterações relevantes de agendamento e sinal, incluindo ação, data/hora e usuário responsável quando a ação for administrativa. Esse registro deve ser consultável por Carol para esclarecer o histórico.

**Critério de aceite:** aprovação, recusa, cancelamento, reagendamento e alteração da situação do sinal deixam registro associado ao item alterado.

### 2.4 Notificações

**RF21 — Enviar lembrete de atendimento**  
O sistema deve enviar lembrete à cliente pelo WhatsApp antes de atendimento confirmado, caso haja integração e autorização operacional. Falhas de envio não podem alterar o estado do agendamento.

**PENDÊNCIA RF21:** confirmar provedor/API do WhatsApp, consentimento e modelo de mensagem, antecedência (a proposta anterior é entre 1 e 2 dias), política de tentativas e custos. Sem essas decisões, lembrete automático é requisito condicionado, não funcionalidade garantida.

## 3. Regras de consistência e persistência

- O servidor deve ser a autoridade para validar disponibilidade, estado, regra de sinal e limite de reagendamento.
- Solicitações, serviços, bloqueios, estados, dados de cliente e alterações administrativas devem ser persistidos; recarregar a página não pode apagar registros válidos.
- Cada agendamento deve manter referências ao cliente e serviço, além de uma cópia do preço aplicável no momento da solicitação, para preservar o histórico após alterações no catálogo.
- A gravação de reserva/aprovação deve proteger a agenda contra concorrência. A estratégia de banco de dados é decisão de implementação, mas deve satisfazer os critérios de RF07, RF11 e RNF04.
- A interface web deve apresentar erros de validação e de disponibilidade sem expor detalhes internos da API ou do banco.

## 4. Decisões pendentes para validação com Carol

1. Horário de funcionamento, duração dos serviços, fuso, antecedência e horizonte de agendamento.
2. Reserva de horário pendente e eventual prazo de 15 minutos.
3. Regra do sinal de R$ 30,00, elegibilidade, exceções e confirmação do recebimento.
4. Fluxo e política de cancelamento.
5. Limite de três reagendamentos e critérios de contagem.
6. Inclusão de pacotes no escopo inicial.
7. WhatsApp: integração, consentimento, antecedência e política de reenvio.
8. Método de autenticação da administradora e necessidade futura de outros operadores.
9. Regras de retenção, correção e eventual exclusão de dados pessoais.

## 5. Rastreabilidade

Os requisitos funcionais foram consolidados a partir dos documentos próprios do Tech Seven sobre agendamento de manicure e do levantamento de requisitos do projeto. Os guias de assistência técnica foram usados apenas como referência de organização; suas funções específicas não foram transplantadas.

