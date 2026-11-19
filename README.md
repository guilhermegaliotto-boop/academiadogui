# Treino ABC

Web app (PWA) de academia para iPhone: checklist dos treinos A/B/C com foto de cada máquina (catálogo Cimerian), cronômetro do treino e de cada exercício, registro de peso e repetições por série, e histórico.

## Como usar no iPhone
1. Abra o link do app no **Safari**.
2. Compartilhar → **Adicionar à Tela de Início**. Ele abre em tela cheia, como um app, e funciona offline.

## Como funciona o cronômetro
- **Iniciar treino** começa o relógio geral e o primeiro exercício.
- Cada exercício conta do momento em que começa até você dar o check. Ao marcar, o próximo começa sozinho.
- Para mudar a ordem, abra outro exercício e toque em **Fazer agora**.
- Em cada série você coloca o peso (kg) e as repetições e marca ✓. O peso da última vez já vem preenchido, e o descanso desde a última série aparece no topo.
- Quando todas as séries estão marcadas, o exercício é concluído sozinho.

## Apple Watch (via app Atalhos)
Um web app não acessa o HealthKit, mas a automação do app Atalhos faz a ponte:
1. Atalhos → Automação → **+** → **Treino do Apple Watch** → **Inicia** → tipo **Força Tradicional** → **Executar Imediatamente**.
2. Ação **Abrir URLs**: `https://SEU-LINK/?watch=start` (ou `?watch=start&w=A` para escolher o treino direto).
3. Opcional: outra automação para **Termina** → `https://SEU-LINK/?watch=end` finaliza e salva.

O link da automação abre no Safari. Se você usa o app pela tela inicial, ligue a sincronização com o Supabase para que os dois vejam os mesmos dados.

## Sincronização com Supabase (opcional)
1. No projeto Supabase: SQL Editor → rode `supabase/schema.sql`.
2. No app: Ajustes → cole a Project URL e a anon key → **Criar conta** e depois **Entrar**.
   - Se a confirmação de e-mail estiver ligada (Authentication → Providers → Email), confirme o e-mail ou desligue essa opção.
3. Os dados ficam numa linha por usuário, protegida por RLS.

## Editar treinos
Na tela de um treino, toque em **Editar**: renomeie, mude séries e reps, reordene, adicione ou remova exercícios e troque a foto escolhendo qualquer máquina do catálogo.

## Rodar localmente
Não precisa de build: `python3 -m http.server 8080` e abra http://localhost:8080.

## Arquivos
- `data.js`: treinos padrão
- `catalog.js`: máquinas do catálogo Cimerian (as fotos são carregadas de assets.cimerianofficial.com e ficam em cache)
- `app.js`: interface e lógica
- `sync.js`: sincronização com Supabase
- `sw.js`: modo offline
