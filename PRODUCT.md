# Meros360

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Nadadores por saúde/lazer (Atleta), nadadores competitivos (PRO), técnicos e
responsáveis por grupos. Bruno é o administrador global configurado no projeto.

## Product Purpose

Organizar treinos, tempos e acompanhamento do atleta, inclusive sem equipe ou
técnico. O primeiro acesso deve explicar a próxima ação sem exigir conhecimento
dos termos técnicos de natação.

## Capabilities and Constraints

- PRO adiciona seus próprios treinos sem equipe/técnico; não recebe gestão por ser PRO.
- Atleta sem técnico ativo pode solicitar geração automática conforme experiência,
  capacidade declarada, piscina e tempo. A liberação depende de revisão profissional
  registrada da versão do gerador; não usa exames, prontidão ou IA externa.
- Afiliação pública não concede autoridade sobre um clube. Um novo grupo privado tem
  responsável próprio, convites individuais, técnicos autorizados e membros.
- Registro profissional, identidade da conta e autorização pelo grupo são verificações
  diferentes. Um número de CREF digitado não equivale a verificação.
- Dados médicos não são compartilhados ao entrar num grupo.
- PWA sem build; preservar identificadores de armazenamento e compatibilidade legada.
- IA externa continua desligada. Strava não integra o escopo.

## Brand Commitments

Preservar nome Meros360, temas claro/escuro, tipografia Barlow e componentes existentes.
Português direto, com explicação dos termos na primeira utilização.

## Product Principles

- Nunca confundir treino planejado com realizado.
- Acesso é confirmado pelo servidor, não por controles escondidos na interface.
- Backup e restauração incluem a Saúde e são verificados após releitura.
- Não declarar validação profissional ou publicação que não aconteceu.

## Evidence on Hand

SDD.md, ESPECIFICACAO.md, ARQUITETURA.md e a revisão de 18/10/2026, com
reproduções isoladas dos defeitos de persistência. Conteúdo do gerador ainda
precisa de revisão profissional externa; não há tal aprovação neste commit.
