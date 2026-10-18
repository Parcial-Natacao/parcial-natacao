# Início guiado, grupos privados e Saúde — validação e publicação

## Escopo e limites

Extensão do visual atual, não redesign: mesmos temas, tipografia, cards,
botões, navegação e folha modal. Primeiro viewport prioriza um próximo passo
claro; gestão explica limites antes de pedir dados. Atleta/PRO independentes
continuam funcionais. Sem migração de equipes legadas e sem chamadas de IA.

O algoritmo `g1` foi implementado, **não recebeu revisão científica/profissional
real**. Está bloqueado por padrão para atletas. Aprovações dos testes são
fictícias, exclusivamente em emuladores. Não usar isso como certificado.

## Reproduzir o QA sem tocar em produção

Requer Node, Java compatível com Firebase Emulator, Firebase CLI, Chrome e
Playwright. As dependências de teste ficam em `firebase/`, não no app:

```powershell
cd firebase
npm ci
# Se Playwright já estiver instalado em outro local, informar seu módulo:
$env:MEROS_PLAYWRIGHT = 'C:\caminho\node_modules\playwright'
firebase emulators:exec --config firebase.qa.json --project demo-meros-v174 --only firestore,auth "npm run test:rules && node ../tests/fluxos-v174.cjs"
```

Sem uma instalação prévia de Playwright, instalar em uma pasta de ferramentas
fora do repositório e apontar `MEROS_PLAYWRIGHT`. O QA usa Chrome instalado.
Portas locais: Firestore 8089, Auth 9099, servidor de teste 8018.
O harness substitui `projectId` por `demo-meros-v174` e exige a substituição;
não reutiliza sessão real nem faz alterações em `parcial-cdb0e`.

Resultados JSON e capturas ficam em `%TEMP%\meros-v174-qa` (ou
`MEROS_QA_OUT`). O teste offline corta a rede do navegador de verdade, verifica
fila antes da inicialização após recarga e confirma o peso no servidor ao voltar.

Cobertura: acesso sem equipe, Atleta com treino de piscina, PRO independente,
gerador bloqueado/liberado ficticiamente, grupo independente sem promoção,
convite/aceite, técnico pendente/habilitado, publicação/cópia planejada,
compartilhamento sem Saúde, backup/restauração, importação repetida/conta errada,
dois aparelhos, exclusão concorrente, offline e recarga, suíte interna completa,
console inicial e larguras de celular/desktop.

As regras exercitam também acesso indevido, autoaprovação, convites alheios,
expirados/revogados/reutilizados, troca de papel, transferência, revogação,
isolamento de Saúde e liberação administrativa do gerador.

## Bruno: além de revisar o PR

1. Conferir o resultado final do QA desta branch. Testar primeiro em ambiente
   de homologação; exportar um backup próprio antes do piloto.
2. Publicar **`firebase/firestore.rules.v2`**, em **Firestore Database › Regras**,
   não Storage. As novas regras são aditivas ao legado, cuja suíte segue sendo
   executada. Não copiar `firestore.rules`, que é rollback antigo.
3. Criar/conferir em Firestore › Índices os dois índices de
   **`firebase/firestore.indexes.json`**, coleção `group_members`, escopo coleção:
   `uid ASC + ativo ASC` e `groupId ASC + role ASC + ativo ASC`.
   Somente copiar regras não cria índices. Preservar os outros índices já
   existentes. Não executar deploy de índices com manifesto parcial sem antes
   reconciliá-lo com os índices do ambiente. Nada foi publicado pelo Codex.
4. Esperar os índices ficarem prontos; então fazer merge e aguardar o Pages.
   O deploy deve levar também os dois novos `.js` e `sw.js`.
5. Atualizar o app em Conta › Atualizar app. Confirmar a mesma versão no HTML e
   service worker. Em piloto, testar Atleta/PRO sem clube e sem técnico;
   criar grupo, convidar outra conta e validar permissão antes/depois de remover.
6. Para técnico: conferir registro em fonte oficial **e** identidade da conta
   por canal independente. A tela fornece o UID para conferir em Authentication.
   Aprovar em Conta › verificações administrativas; convite de grupo é separado.
7. Para liberar geração: profissional habilitado revisa algoritmo e combinações
   de nível/capacidade/tempo/piscina, registra eventuais ajustes, roda testes de
   novo e só depois Bruno libera a revisão `g1` na mesma área administrativa.
   Revogar o profissional ou suspender a versão bloqueia novas gerações.

Convites geram um link que o responsável envia ao destinatário; não foi criado
serviço automático de envio de e-mail. Grupos são privados e independentes,
não são uma lista pública de clubes. Não remover dados antigos nem conceder
propriedade de clube existente como parte desta publicação.

## Critério de aceite do piloto

Não autorizar divulgação ampla só pelo teste automatizado. Confirmar envio real
de verificação de e-mail, experiência em iPhone/Android instalados, atualização
do service worker, índices/regras no ambiente de destino e recuperação com
backup. Um teste em emulador não demonstra esses serviços em produção.

## Evidência de desenvolvimento — 18/10/2026

- Firestore Emulator: **72/72** testes de regras (inclui a suíte legada).
- Chrome com Auth/Firestore emulados: **27/27** cenários de uso.
- Suíte interna nas funções reais do navegador: **234/234** casos.
- Nenhuma exceção de página registrada; capturas em 390 e 1280 px.
- Corte real da rede: retorno em aproximadamente 5 segundos com uma pendência;
  pendência presente antes do login após recarga e confirmada ao reconectar.
- Revisão independente de interface Impeccable: `disposition: ship` para as
  superfícies novas no tema claro. Detector apontou somente padrões herdados;
  não foi feito redesign de telas antigas. Tema escuro usa tokens herdados,
  mas dispositivos físicos/iOS/Android não foram validados nesta execução.

Os números descrevem esta alteração, não são garantia de ausência de defeitos.
Dados, contas, credenciais e aprovações de QA são sintéticos. Não houve deploy,
publicação de regras/índices nem revisão profissional do treino em produção.
