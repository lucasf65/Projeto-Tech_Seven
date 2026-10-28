# Requisitos Funcionais

**Projeto:** Tech Seven — Sistema Web de Agendamento de Manicure
**Status:** versão para validação e aprovação do professor e Carol; decisões de negócio ainda não confirmadas estão marcadas como **PENDÊNCIA**.

## 1. Requisitos funcionais

### 1.1 Acesso e solicitação de agendamento

#### RF01 — Acessar a página de agendamento
A aplicação deve disponibilizar a página pública por URL direta, permitindo o acesso via navegadores web modernos em dispositivos móveis e desktops sem exigir a instalação de aplicativos. A URL gerada deve ser compartilhável via WhatsApp Business.

**Critério de aceite:**
- A página abre corretamente em navegadores compatíveis (Chrome, Safari, Edge) via URL direta.
- A URL pode ser copiada e enviada em uma conversa de WhatsApp, direcionando o destinatário para a mesma página pública.

#### RF02 — Cadastro de cliente
A aplicação deve permitir iniciar uma solicitação de agendamento mediante o preenchimento obrigatório do nome completo e número de WhatsApp. O sistema deve validar a presença desses dados e o formato plausível do telefone (ex: quantidade de dígitos com DDD) no lado do cliente antes de disparar qualquer requisição para a API.

**Critério de aceite:**
- Se o nome estiver vazio ou o telefone for inválido, o envio é bloqueado no navegador.
- O campo com erro recebe um alerta visual e uma mensagem em linguagem clara e compreensível para o usuário.

#### RF03 — Identificar cliente existente
O servidor da aplicação deve receber o número de WhatsApp informado, aplicar uma regra de normalização (remover parênteses, espaços, traços e validar o DDD 55) e compará-lo com os telefones existentes no banco de dados. O resultado dessa busca (Cliente Novo vs. Cliente Existente) deve ser guardado na sessão/contexto para a aplicação da regra de cobrança de sinal (RF08).

**Critério de aceite:**
- A busca e a tomada de decisão ocorrem estritamente no servidor (API); a interface não expõe dados de outros clientes e não define sozinha se o sinal é devido.

#### RF04 — Exibir catálogo de serviços
A aplicação deve listar para a cliente os serviços cadastrados como ativos, exibindo nome, descrição, preço e imagem. Serviços marcados como inativos não devem ser exibidos na listagem pública.

**Critério de aceite:**
- A listagem exibe apenas registros com status ativo no banco de dados.
- Caso aconteça alguma inconsistência e tenha ausência de imagem de um serviço, não quebra o layout da página nem impede a sua exibição ou seleção.

#### RF05 — Selecionar serviço
A aplicação deve permitir que a cliente selecione um serviço ativo. No momento do envio do formulário de agendamento, a API deve revalidar no banco de dados se o serviço selecionado permanece com o status ativo.

**Critério de aceite:**
- Caso o serviço tenha sido desativado ou excluído pela administradora durante a sessão da cliente, a API recusa a gravação, bloqueia a persistência e retorna um erro compreensível na tela.

#### RF06 — Consultar datas disponíveis
Após a seleção do serviço, a aplicação deve exibir um calendário destacando as datas que possuem pelo menos um horário vago. Essa consulta deve cruzar os dados da agenda geral, os bloqueios automáticos e manuais inseridos pela administradora e a duração estimada do serviço.

**PENDÊNCIA RF06:** confirmar horário de funcionamento e duração de cada serviço.

#### RF07 — Consultar e solicitar horário
A aplicação deve exibir os horários disponíveis para a data selecionada. Ao clicar em enviar, a API deve realizar uma operação atômica de validação e reserva: se o horário ainda estiver livre, registra a solicitação com o estado "Pendente".

**Critério de aceite:**
- Em caso de cliques simultâneos de clientes diferentes para a mesma vaga, apenas a primeira requisição processada pelo servidor garante o horário.
- As requisições concorrentes recebem um aviso imediato de indisponibilidade e nenhuma solicitação duplicada é criada.

**PENDÊNCIA RF07:** Reserva temporária por 15 minutos durante o processo de comprovação do pagamento via PIX, para solicitações pendentes. Confirmar prazo e regra de expiração com Carol antes da implementação.

### 2.2 Sinal e confirmação

#### RF08 — Aplicar regra de sinal
O sistema deve aplicar uma cobrança fixa de R$ 30,00 a título de sinal apenas para clientes classificadas como "Cliente Nova" (RF03). Após a seleção do agendamento, o sistema deve exibir os dados de pagamento (Chave Pix ou QR Code) e fornecer um campo obrigatório para o upload do arquivo de comprovante.

**Critério de aceite:**
- O agendamento de uma cliente nova não pode ser salvo no estado "Pendente" sem um arquivo de imagem/PDF associado ao campo de comprovante.
- O valor gerado R$ 30,00 fica gravado de forma imutável junto ao registro do cliente e agendamento solicitado. Transformando em "Cliente Existente" (RF03).

#### RF09 — Registrar situação do sinal
A área administrativa deve permitir consultar o comprovante enviado e registrar manualmente a situação do sinal associada ao agendamento (Pendente, Confirmado ou Recusado), verificando no extrato bancário do(a) estabelecimento/administração. Cada mudança deve registrar a data/hora e o responsável logado.

**Critério de aceite:**
- A administradora consegue visualizar a imagem/PDF do comprovante anexo diretamente no painel de gestão de agendamentos antes de alterar o estado do sinal.

#### RF10 — Consultar solicitações pendentes
A área administrativa deve listar solicitações aguardando análise e apresentar, no mínimo: cliente, telefone, serviço, data, horário, status do agendamento e visualização de comprovante.

**Critério de aceite:**
- Uma solicitação finalizada pela cliente aparece em tempo real nesta listagem com os dados correspondentes.

#### RF11 — Aprovar ou recusar solicitação
A administradora deve poder aprovar ou recusar uma solicitação pendente. Antes de efetivar a aprovação, o servidor deve validar novamente se o horário não sofreu bloqueios. Uma solicitação recusada libera a vaga imediatamente para o calendário.

**Critério de aceite:**
- Somente solicitações no estado "Pendente" podem ser alteradas por este comando.

#### RF12 — Consultar e gerenciar agenda
A administradora deve consultar agendamentos por data através de uma visualização unificada (grade ou calendário), permitindo diferenciar visualmente os horários vagos, os bloqueados, as solicitações pendentes e os atendimentos confirmados.

**Critério de aceite:**
- A interface reflete os dados reais persistidos e permite identificar horário, serviço, cliente e estado de cada item.

#### RF13 — Bloquear e liberar datas ou horários
A administradora deve poder criar bloqueios manuais de horários ou intervalos de dias. O sistema deve emitir um alerta visual listando conflitos existentes caso o período selecionado possua agendamentos confirmados ou pendentes antes de efetivar a gravação.

**Critério de aceite:**
- O bloqueio salvo remove os horários da visão do cliente.
- O sistema não cancela ou altera agendamentos existentes de forma silenciosa.

#### RF14 — Manter estados do agendamento
O sistema deve gerenciar e persistir o ciclo de vida de um agendamento através dos estados: Pendente, Confirmado e Cancelado. O servidor deve validar e impedir transições inválidas na API.

**Critério de aceite:**
- Transições fora das regras permitidas pela máquina de estados são rejeitadas com erro controlado pelo servidor.

### 2.3 Pós-agendamento e manutenção

#### RF15 — Solicitar cancelamento autônomo
A cliente deve poder realizar o cancelamento de um agendamento de forma autônoma diretamente pelo site, sem depender de aprovação manual, desde que respeitada a janela de tempo permitida. O sistema deve liberar a vaga no calendário instantaneamente e atualizar a situação do sinal para "Reembolso Pendente" se houver taxa de R$ 30,00 associada.

**Critério de aceite:**
- O cancelamento autônomo dispara uma flag visual na área administrativa para sinalizar à Carol que o reembolso daquele sinal precisa ser processado manualmente.

**PENDÊNCIA RF15:** Confirmar a janela de tempo permitida para cancelamento feito pelo cliente.

#### RF16 — Solicitar reagendamento
A cliente deve poder enviar uma solicitação de mudança de data/horário para um agendamento elegível. A API deve validar a disponibilidade da nova vaga.

**Critério de aceite:**
- A aprovação grava a nova vaga e libera a antiga simultaneamente.

#### RF17 — Controlar limite de reagendamentos
O sistema deve contabilizar os reagendamentos aceitos e bem-sucedidos por atendimento e bloquear novas solicitações adicionais na interface e na API ao atingir o limite estrito de 3 trocas.

**Critério de aceite:**
- A tentativa de submeter uma 4ª alteração de horário para o mesmo agendamento é bloqueada.

#### RF18 — Gerenciar serviços
A área administrativa deve permitir cadastrar, consultar, editar e desativar serviços avulsos (com nome, descrição, preço e imagem). Caso um serviço possua histórico de agendamentos associado, o sistema impede a sua exclusão física do banco de dados, permitindo apenas a sua desativação lógica (arquivamento).

**Critério de aceite:**
- Alterações de preços ou nomes não modificam retroativamente os dados gravados nos agendamentos passados (integridade de histórico).

#### RF19 — Consultar histórico de clientes
A administradora deve consultar clientes e seus atendimentos anteriores (data, serviço, valor cobrado e estados). O acesso deve ocorrer somente pela área autenticada.

**Critério de aceite:**
- O histórico de atendimentos de uma cliente não pode ser acessado de nenhuma forma pela rota pública do sistema.

#### RF20 — Registrar alterações administrativas
O sistema deve gerar logs de auditoria imutáveis para ações de alteração de sinal, aprovação, recusa, cancelamento manual e bloqueio de agenda, contendo: ação, data/hora e o ID da conta administrativa responsável.

### 2.4 Notificações

#### RF21 — Enviar lembrete de atendimento
Se a integração estiver ativa, o sistema deve disparar notificações automáticas de lembrete via WhatsApp para a cliente com 1 dia de antecedência do atendimento confirmado. Falhas de comunicação na API de terceiros não podem alterar ou corromper o estado do agendamento no sistema principal.

**Critério de aceite:**
- Erros no envio do WhatsApp mantêm o agendamento intacto como "Confirmado" e registram a falha em log de sistema.
