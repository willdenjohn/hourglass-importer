# Importador Hourglass

Ferramenta local para lançar no [Hourglass](https://hourglass-app.com) os relatórios mensais de serviço de campo coletados por um formulário do Microsoft Forms, e acompanhar quem ainda não entregou.

Roda inteiramente no seu computador. Nada é enviado a terceiros: as únicas requisições externas vão para a API do próprio Hourglass, usando a sua sessão.

## Funcionalidades

- Lê o Excel exportado do Forms e identifica as colunas pelo título.
- Associa cada resposta ao publicador cadastrado no Hourglass (nome exato, apelidos salvos ou nome parecido).
- Interpreta horas, crédito de horas e estudos escritos em texto livre ("29 horas", "30 + 25 crédito construção", "Dois estudos").
- Gera uma **conferência** para revisão antes de enviar, com alertas para tudo que é duvidoso.
- Simula o envio, exige confirmação explícita e envia relatório por relatório mostrando o progresso.
- Lista os relatórios em falta no mês, por grupo, com uma mensagem pronta para copiar no WhatsApp.

## Requisitos

- [Node.js](https://nodejs.org) 20 ou superior
- Conta no Hourglass com permissão para lançar relatórios da congregação

## Instalação

```bash
git clone <url-deste-repositorio>
cd importador-hourglass
npm install
```

## Uso pela interface

```bash
npm start
```

Abra `http://localhost:3434`. No Windows, também é possível dar duplo clique em `iniciar.bat`.

1. **Sessão** — com a [extensão do Chrome](#extensão-do-chrome) instalada, a conexão é automática. Sem ela, cole os cookies `hglogin` e `X-Hourglass-XSRF-Token` do Hourglass (no navegador logado: F12 → Application → Cookies → `https://app.hourglass-app.com`). O app testa a conexão, mostra até quando o login vale e preenche os dados da conta vindos do Hourglass: usuário, congregação, mês em aberto, último mês enviado à filial, grupos e permissões. O mês em aberto passa a ser o mês padrão da importação.
2. **Importar Forms** — escolha o mês no calendário do topo (o mês em aberto no Hourglass vem marcado com um ponto verde; meses posteriores ficam bloqueados), arraste o Excel do Forms e clique em *Processar*. Nesta etapa nada é enviado.
3. **Conferência e envio** — revise as linhas:
   - verde `ENVIAR`: pronto para envio;
   - amarelo `REVISAR`: algo precisa de confirmação (veja a coluna *Alertas*);
   - vermelho `NÃO ENCONTRADO`: escolha o publicador ou cadastre-o no Hourglass;
   - `JÁ LANÇADO` e `IGNORAR`: não serão enviados.

   Edições são salvas automaticamente. Ao escolher manualmente um publicador, use *Lembrar este nome* para que o apelido seja reconhecido nos próximos meses. Clique em *Simular envio*, confira a lista e digite `ENVIAR` para confirmar.
4. **Faltantes** — consulta o Hourglass e mostra quem ainda não entregou o relatório do mês em aberto, com totais, lista por grupo, mensagem pronta para copiar e download em Excel.

## Extensão do Chrome

A pasta `extensao/` contém uma extensão que entrega a sessão do Hourglass ao importador automaticamente, sem copiar cookies.

**Instalação (uma vez):**

1. Abra `chrome://extensions` e ligue o **Modo do desenvolvedor**.
2. Clique em **Carregar sem compactação** e escolha a pasta `extensao/`.
3. Fixe o ícone da ampulheta na barra do Chrome.

**Como funciona:**

- Só age quando a página do importador (`localhost:3434`) é aberta e a sessão está ausente ou expirada, quando uma consulta ao Hourglass falha por sessão expirada (a consulta é refeita sozinha) ou quando você clica em *Conectar pelo Chrome* / *Sincronizar agora*. Não fica monitorando nada em segundo plano.
- Lê apenas os cookies de `app.hourglass-app.com` e envia apenas para `localhost:3434`.
- O ícone mostra **ON** ou **OFF**. O popup mostra se o Hourglass está logado neste Chrome, se o importador está aberto e conectado, e o resultado da última sincronização.
- O botão **Desativar** desliga a extensão: ela deixa de ler cookies até ser ativada de novo. A página do importador mostra o estado da extensão na aba *Sessão*.

É preciso estar logado no Hourglass neste mesmo Chrome.

## Segurança

- O servidor escuta apenas em `127.0.0.1` e recusa requisições cujo `Host` não seja `localhost` ou `127.0.0.1`.
- Gravações (`POST`/`PUT`) só são aceitas da própria página do importador ou da extensão; outros sites abertos no navegador não conseguem alterar a sessão nem os dados.

## Uso pela linha de comando

```bash
node importar.js preparar "Relatório de campo(SETEMBRO).xlsx" 9 2026
node importar.js enviar conferencias/conferencia-2026-09.xlsx
node importar.js enviar conferencias/conferencia-2026-09.xlsx --executar
node importar.js enviar conferencias/conferencia-2026-09.xlsx --executar --limite=1
node importar.js faltantes
```

- `preparar` gera `conferencias/conferencia-AAAA-MM.xlsx`, que pode ser revisada no Excel (mude a coluna *Situação* para `ENVIAR`).
- `enviar` sem `--executar` apenas simula. Com `--executar`, pede que você digite `ENVIAR`.
- `--limite=N` envia só os N primeiros — útil para testar com um relatório.
- A sessão é lida de `sessao.json` (veja `sessao.exemplo.json`).

## Formato esperado do Forms

O importador procura as colunas pelo título (maiúsculas e acentos são ignorados):

| Conteúdo | Título deve conter |
|---|---|
| Nome do publicador | `nome completo` |
| Tipo (Publicador, Pioneiro(a) Regular, Pioneiro(a) Auxiliar) | `Você é:` |
| Participou no ministério (Sim/Não) | `participou` |
| Dirigiu estudo (Sim/Não) | `dirigiu` |
| Quantidade de estudos | `quantos estudos` |
| Horas | `quantidade de horas` |
| Crédito de horas (opcional, recomendado) | `crédito`, `LDC` ou `construção` |
| Observações (opcional) | `observa` |

Funciona tanto com a exportação completa do Forms (com colunas de ID, horários e e-mail) quanto com uma planilha só com as perguntas.

**Recomendações para o formulário:** use campos numéricos para horas e estudos e um campo separado para crédito de horas. Isso elimina a maior parte dos alertas.

## Regras aplicadas

- **Pioneiro**: definido pelo cadastro no Hourglass (regular, auxiliar contínuo, especial). Se o Forms disser outra coisa, a linha vai para revisão. Um pioneiro auxiliar do mês pode ser ajustado na conferência.
- **Publicador**: "participou" é enviado como 1 minuto e "não participou" como 0, como o próprio Hourglass faz.
- **Horas**: apenas horas inteiras.
- **Crédito de horas**: só para pioneiros regulares e especiais, limitado para que campo + crédito não passe de 55 horas no mês.
- **Duplicidade**: respostas repetidas do mesmo nome valem pela última; duas linhas enviando para o mesmo publicador bloqueiam o envio.
- **Já lançado**: quem já tem relatório no mês é detectado antes de enviar e nunca é enviado de novo.

## Arquivos locais (não versionados)

| Arquivo | Conteúdo |
|---|---|
| `sessao.json` | Cookies de sessão do Hourglass. Dá acesso à sua conta — não compartilhe. |
| `apelidos.json` | Nomes do formulário associados a IDs do Hourglass (veja `apelidos.exemplo.json`). |
| `conferencias/` | Conferências e relatórios de faltantes gerados por mês. |

Todos contêm dados pessoais e estão no `.gitignore`.

## Estrutura

```
importar.js            linha de comando
servidor.js            servidor da interface (http://localhost:3434)
lib/
  api.js               cliente da API do Hourglass
  formulario.js        leitura do Excel do Forms
  interpretar.js       horas, crédito, estudos e tipo de pioneiro
  correspondencia.js   associação de nomes a publicadores
  conferencia.js       planilha de conferência e montagem do relatório
  servico.js           fluxo compartilhado entre CLI e interface
  faltantes.js         relatório de faltantes e mensagem
  sessao.js            leitura e validação da sessão
public/                interface web (HTML, CSS e JavaScript sem dependências)
extensao/              extensão do Chrome para a sessão automática
```

## API do Hourglass utilizada

Base: `https://app.hourglass-app.com/api/v0.2`. Toda requisição envia os cookies de sessão e o cabeçalho `X-Hourglass-XSRF-Token`.

| Método | Rota | Uso |
|---|---|---|
| GET | `fsreport/startup` | Publicadores ativos e grupos de campo |
| GET | `fsreport/users/notpublishing` | Publicadores inativos |
| GET | `fsreport/summary/monthdetail/{ano}/{mes}` | Relatórios já lançados no mês |
| POST | `fsreport/reports/{idPublicador}` | Cria o relatório |
| GET | `fsreport/summary/missing` | Relatórios em falta |
| GET | `fsreport/summary/monthreporttotals` | Totais do mês em aberto |

Corpo enviado ao criar um relatório:

```json
{
  "id": 0,
  "user": { "id": 1000001 },
  "month": 9,
  "year": 2026,
  "minutes": 1800,
  "studies": 1,
  "credithours": null,
  "pioneer": "Regular",
  "remarks": null
}
```

`pioneer` aceita `"Regular"`, `"Auxiliary"`, `"Special"` ou `null`. `minutes` deve ser 0, 1, 15, 30, 45 ou múltiplo de 60.

Esta API não é pública nem documentada pelo Hourglass e pode mudar sem aviso.

## Aviso

Projeto independente, sem vínculo com o Hourglass. Use por sua conta e confira os relatórios no Hourglass após o envio.
