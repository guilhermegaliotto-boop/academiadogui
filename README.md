# Academia do Gui

Web app (PWA) de academia para iPhone: checklist dos treinos A/B/C com foto de cada máquina (catálogo Cimerian), cronômetro do treino e de cada exercício, peso e repetições gravados por série (pré-preenchidos com a última vez), substitutos, aba de Dados com progressão de carga e análise por grupo muscular.

## Como usar no iPhone
1. Abra o link do app no **Safari**.
2. Compartilhar → **Adicionar à Tela de Início**. Ele abre em tela cheia, como um app, e funciona offline.

## Como funciona o cronômetro
- **Iniciar treino** começa o relógio geral e o primeiro exercício.
- Cada exercício conta do momento em que começa até você dar o check. Ao marcar, o próximo começa sozinho.
- Para mudar a ordem, abra outro exercício e toque em **Fazer agora**.
- Em cada série você coloca o peso (kg) e as repetições e marca ✓. O peso da última vez já vem preenchido, e o descanso desde a última série aparece no topo.
- Quando todas as séries estão marcadas, o exercício é concluído sozinho.
- **Pular**: marca o exercício como não feito no dia (não entra nas estatísticas).
- **Trocar**: escolhe um substituto (ex.: face pull → crucifixo inverso no voador). Cada substituto tem seu próprio histórico.

## Aba Dados
- Por exercício: carga da série mais pesada, 1RM estimado (Epley), tempo por exercício, tabela de sessões e recomendação de progressão (subir carga quando bater o topo da faixa de reps em todas as séries).
- Por grupo muscular: séries por semana (principal = 1, secundário = ½) comparadas à faixa de 10–20, equilíbrio puxar/empurrar e quadríceps/posteriores.

## Nuvem (Supabase)
O app já vem ligado ao projeto Supabase `paorlkgemjqklsruvrsf`. Configuração (uma vez só):
1. Supabase → **SQL Editor** → cole e rode `supabase/schema.sql`.
2. Supabase → **Authentication → Sign In / Providers → Email** → desligue **Confirm email** (ou confirme pelo e-mail que chegar).
3. No app: **Ajustes → Conta na nuvem** → e-mail e senha → **Entrar**. A conta é criada na primeira vez.

Os dados ficam numa linha por usuário, protegida por RLS: só você logado consegue ler ou gravar.

## Editar treinos
Na tela de um treino, toque em **Editar**: renomeie, mude séries e reps, reordene, adicione ou remova exercícios e troque a foto escolhendo qualquer máquina do catálogo.

## Rodar localmente
Não precisa de build: `python3 -m http.server 8080` e abra http://localhost:8080.

## Arquivos
- `data.js`: treinos padrão
- `catalog.js`: máquinas do catálogo Cimerian (as fotos são carregadas de assets.cimerianofficial.com e ficam em cache)
- `app.js`: interface e lógica
- `stats.js`: cálculos e gráficos da aba Dados
- `sync.js`: sincronização com Supabase
- `sw.js`: modo offline
