# Importador Hourglass

[English](README.md) · **Português** · [Español](README.es.md)

Ferramenta local que lança no [Hourglass](https://hourglass-app.com) os relatórios mensais de serviço de campo a partir de uma planilha (exportação do Microsoft Forms ou a planilha modelo) e mostra quem ainda não entregou.

Tudo roda no seu computador. As únicas requisições externas vão para a API do Hourglass, usando a sua própria sessão.

## Funcionalidades

- Lê o Excel e identifica as colunas pelo título, em português, inglês ou espanhol.
- Permite mapear as colunas de qualquer planilha e lembra o formato para a próxima vez.
- Associa cada resposta ao publicador cadastrado no Hourglass (nome exato, apelidos salvos ou nome parecido).
- Entende horas, crédito de horas e estudos bíblicos escritos em texto livre ("29 horas", "30 + 25 crédito construção", "dois estudos").
- Gera uma **conferência** com alertas para tudo que é duvidoso antes de enviar.
- Simula o envio, exige confirmação explícita e envia relatório por relatório mostrando o progresso.
- Lista os relatórios em falta do mês em aberto por grupo, com uma mensagem pronta para colar.
- Interface, planilhas geradas, mensagens e linha de comando em **português, inglês e espanhol**.

## Requisitos

- [Node.js](https://nodejs.org) 20 ou superior
- Conta no Hourglass com permissão para lançar os relatórios da congregação

## Instalação

```bash
git clone https://github.com/willdenjohn/importador-hourglass.git
cd importador-hourglass
npm install
```

## Uso pela interface

```bash
npm start
```

O navegador abre em `http://localhost:3434` quando o servidor está pronto. No Windows, também dá para dar duplo clique em `start.bat`. Escolha o idioma na barra do topo; na primeira vez ele segue o idioma do sistema.

1. **Sessão** — com a [extensão do Chrome](#extensão-do-chrome) instalada, a conexão é automática. Sem ela, cole os cookies `hglogin` e `X-Hourglass-XSRF-Token` do Hourglass (no navegador logado: F12 → Application → Cookies → `https://app.hourglass-app.com`). A tela mostra os dados da conta lidos do Hourglass: usuário, congregação, mês em aberto, último mês enviado à filial, grupos e permissões.
2. **Importar planilha** — escolha o mês no calendário (o mês em aberto no Hourglass tem um ponto verde; meses já enviados à filial aparecem riscados), arraste a planilha, confira as colunas detectadas e a prévia e clique em *Processar planilha*. Nada é enviado nesta etapa.
3. **Conferência e envio** — revise as linhas:
   - `ENVIAR`: pronto para envio;
   - `REVISAR`: algo precisa de confirmação (veja a coluna *Alertas*);
   - `NÃO ENCONTRADO`: escolha o publicador ou cadastre-o no Hourglass;
   - `JÁ LANÇADO` e `IGNORAR`: não serão enviados.

   As edições são salvas automaticamente e dá para navegar entre os campos com Tab. Use a busca e os filtros por situação para encontrar linhas. Ao escolher um publicador manualmente, *Lembrar este nome* salva o apelido para os próximos meses. Clique em *Simular envio*, confira a lista e digite a palavra de confirmação para enviar.
4. **Faltantes** — consulta o Hourglass e mostra quem ainda não entregou o relatório do mês em aberto: totais, lista por grupo com dirigente e telefone, uma mensagem única pronta para copiar e download em Excel.

Ao reabrir a página, a conferência do mês em aberto é carregada automaticamente.

## Planilha

### Planilha modelo (recomendada)

Baixe pela tela de importação (*Baixar planilha modelo*) ou com `node cli.js template`. As colunas seguem os campos do relatório no Hourglass e saem no idioma escolhido:

| Coluna | O que preencher | Obrigatória |
|---|---|---|
| Nome | Nome completo como está no Hourglass | Sim |
| Participou no ministério | Sim ou Não (publicadores) | Sim, ou Horas |
| Estudos bíblicos | Número de estudos dirigidos | Não |
| Pioneiro auxiliar | Sim se foi pioneiro auxiliar no mês | Não |
| Horas | Número inteiro (pioneiros) | Sim, ou Participou |
| Horas de crédito | Só pioneiro regular; campo + crédito até 55h | Não |
| Observações | Vai para as observações do relatório | Não |

O modelo traz uma aba *Instruções*. Pioneiros regulares e auxiliares contínuos são reconhecidos pelo cadastro do Hourglass, por isso não há coluna de tipo.

### Outras planilhas

Qualquer Excel com uma linha de títulos funciona. Ao enviar o arquivo, a tela **Colunas da planilha** mostra cada campo do relatório com a coluna sugerida e exemplos de valores; ajuste o que for preciso e confira a prévia antes de processar. *Estudos bíblicos* e *Dirigiu estudo* aceitam mais de uma coluna (vale o primeiro valor preenchido), o que cobre formulários com perguntas separadas para publicadores e pioneiros. Marcando *Lembrar este formato*, o mapeamento fica salvo em `mappings.json`.

## Regras aplicadas

- **Pioneiro**: definido pelo cadastro no Hourglass (regular, auxiliar contínuo, especial). Se a planilha disser outra coisa, a linha vai para revisão. O pioneiro auxiliar de um mês vem da coluna *Pioneiro auxiliar*.
- **Publicador**: "participou" é enviado como 1 minuto e "não participou" como 0, como o próprio Hourglass faz.
- **Horas**: apenas horas inteiras.
- **Crédito de horas**: só para pioneiros regulares e especiais, limitado para que campo + crédito não passe de 55 horas no mês.
- **Duplicidade**: respostas repetidas do mesmo nome valem pela última; duas linhas enviando para o mesmo publicador bloqueiam o envio.
- **Já lançado**: quem já tem relatório no Hourglass é detectado antes de enviar e nunca é enviado de novo.

## Uso pela linha de comando

```bash
node cli.js prepare "Relatório de campo(SETEMBRO).xlsx" 9 2026
node cli.js send reviews/review-2026-09.xlsx
node cli.js send reviews/review-2026-09.xlsx --execute
node cli.js send reviews/review-2026-09.xlsx --execute --limit=1
node cli.js missing
node cli.js template
```

- Acrescente `--lang=pt-BR`, `--lang=en` ou `--lang=es` a qualquer comando; por padrão segue o idioma do sistema.
- `prepare` gera `reviews/review-AAAA-MM.xlsx`, que pode ser revisada no Excel (mude a coluna *Situação* para ENVIAR).
- `send` sem `--execute` apenas simula. Com `--execute`, pede que você digite a palavra de confirmação.
- `--limit=N` envia só os N primeiros — útil para um primeiro teste.
- A sessão é lida de `session.json` (veja `session.example.json`).

## Extensão do Chrome

A pasta `extension/` contém uma extensão que entrega a sessão do Hourglass ao importador automaticamente, sem copiar cookies.

**Instalação (uma vez):**

1. Abra `chrome://extensions` e ligue o **Modo do desenvolvedor**.
2. Clique em **Carregar sem compactação** e escolha a pasta `extension/`.
3. Fixe o ícone da ampulheta na barra do Chrome.

**Como funciona:**

- Só age quando a página do importador (`localhost:3434`) é aberta e a sessão está ausente ou expirada, quando uma consulta ao Hourglass falha por sessão expirada (a consulta é refeita sozinha) ou quando você clica em *Conectar pelo Chrome* / *Sincronizar agora*. Não fica monitorando nada em segundo plano.
- Lê cookies apenas de `app.hourglass-app.com` e envia apenas para `localhost:3434`.
- O ícone mostra **ON** ou **OFF**. A janela da extensão mostra se o Hourglass está logado neste Chrome, se o importador está aberto e conectado e o resultado da última sincronização.
- **Desativar** desliga a extensão: ela não lê cookies até ser ativada de novo.
- Os textos seguem o idioma do Chrome (português, inglês ou espanhol).

É preciso estar logado no Hourglass neste mesmo Chrome.

## Segurança e integridade dos envios

- O servidor escuta apenas em `127.0.0.1` e recusa requisições cujo `Host` não seja `localhost` ou `127.0.0.1`.
- Gravações (`POST`/`PUT`) só são aceitas da própria página do importador ou da extensão; outros sites abertos no navegador não conseguem alterar a sessão nem os dados.
- Só um envio roda por vez: a interface e a linha de comando compartilham uma trava (`.send.lock`). Uma trava abandonada há mais de 30 minutos é descartada.
- Antes de lançar cada relatório, o importador confere no Hourglass se ele já existe; se existir, não lança de novo.
- Chamadas ao Hourglass têm limite de 30 segundos. Consultas são repetidas uma vez em caso de instabilidade; a criação de relatório só é repetida depois de confirmar que o primeiro envio não chegou.
- Escolher um mês que o Hourglass já enviou à filial mostra um aviso: relatórios lançados nele entram como atrasados.
- Cada envio fica registrado em `reviews/submissions-AAAA-MM.log` (data, origem, publicador, valores e resultado).

## Arquivos locais (não versionados)

| Arquivo | Conteúdo |
|---|---|
| `session.json` | Cookies de sessão do Hourglass. Dá acesso à sua conta — não compartilhe. |
| `aliases.json` | Nomes do formulário associados a IDs do Hourglass (veja `aliases.example.json`). |
| `mappings.json` | Formatos de planilha lembrados (títulos das colunas). |
| `reviews/` | Conferências, planilhas de faltantes e registros de envio por mês. |

Todos contêm dados pessoais e estão no `.gitignore`.

**Atualizando da versão 1:** os arquivos criados pela versão 1 (`sessao.json`, `apelidos.json`, `mapeamentos.json`, `conferencias/`) são renomeados automaticamente na primeira execução, e as conferências antigas em português continuam abrindo. Recarregue a extensão do Chrome a partir da nova pasta `extension/`.

## Testes

```bash
npm test
```

Usa o executor de testes do próprio Node, sem dependências extras. Os testes usam apenas dados fictícios e um Hourglass simulado — nenhuma requisição real é feita.

## Como contribuir

- **Idioma:** código, identificadores, nomes de arquivos e mensagens de commit em inglês. Textos exibidos ao usuário ficam em `locales/*.json`; acrescente cada chave nos três arquivos (um teste confere que todos têm as mesmas chaves e parâmetros). Os textos da extensão ficam em `extension/_locales/*/messages.json`.
- **Commits:** seguem o [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`), com assunto curto no imperativo em inglês.
- **Sem dados reais:** nunca versione nomes, telefones, dados da congregação, IDs do Hourglass, cookies ou planilhas. Testes e exemplos usam apenas dados fictícios.
- **Antes de abrir um pull request:** rode `npm test`.

A estrutura do projeto e a API do Hourglass utilizada estão descritas no [README em inglês](README.md#project-structure).

## Licença

[MIT](LICENSE).

## Aviso

Projeto independente, sem vínculo com o Hourglass. Use por sua conta e confira os relatórios no Hourglass após o envio.
