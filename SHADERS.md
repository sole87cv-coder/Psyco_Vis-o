# Ecos e composição Canvas 2D (o motor de sonar)

O Psyco_Visão desenha como um morcego escuta: um **emissor virtual** na base da tela (centro, 97% da altura) dispara **pulsos** radiais que se expandem pelo campo e voltam como **ecos**. Tudo é Canvas 2D — não há GLSL nem WebGL — e a câmera/microfone continuam 100% locais.

## Vocabulário

| termo | o que é |
|---|---|
| **pulso** | anel luminoso emitido pelo emissor; nasce denso e rápido e vai perdendo energia ao expandir |
| **eco** | anel secundário criado quando um pulso toca uma borda de movimento do vídeo; é mais fraco e mais lento que o pulso que o gerou |
| **decaimento** (fósforo) | o rastro que cada anel deixa ao se dissolver; quanto maior, mais tempo a lembrança dura na tela |
| **banda** | faixa de frequência do som que modula a forma de um pulso: graves (60–250 Hz), médios, agudos (2–8 kHz) e o próprio eco |
| **campo** | buffer onde o sonar desenha; fica em resolução menor que a tela (aspecto limitado a 0,4–2,6) |
| **ponto cego** | área ao redor do emissor que fica sempre escura — o morcego não "vê" o próprio grito |
| **pipoca** | ponto curto âmbar que representa os agudos (2–8 kHz); vive de 0,22 a 0,5 s |

## O ciclo de cada quadro

1. **Análise** (`js/motion.js`): a câmera é reduzida a 160×120; diferença temporal e gradiente geram os mapas `motion` e `edge`.
2. **Pulsos avançam** (`js/renderers.js`, `step`): raio cresce com velocidade proporcional ao envelope RMS; o diâmetro que deforma as bordas segue a energia do áudio.
3. **Energia** (`renderEnergy`): cada anel é desenhado por cordas horizontais; o raio local encurta onde há borda de movimento (`edgeDeform`), criando franjas e gagueira.
4. **Reflexão**: quando um pulso cruza uma borda detectada, nasce um **eco** (`spawnRing` com banda `echo`).
5. **Vídeo sob o sonar** (`buildMask` + `renderUnderlay`): a máscara do movimento tinge a imagem de verde; o vídeo é multiplicado por esse verde e recortado pela máscara.
6. **Acumulação** (`accumulate`): dois buffers alternam (ping-pong); o quadro novo entra com o **decaimento** do preset (0,905–0,962 por quadro, em `PRESET_PROFILES`).
7. **Composição** (`compose`): vídeo ao fundo na presença escolhida, sonar somado em modo `lighter` com respiração, e o ponto cego recortado por gradiente radial.

## Como o som vira forma (`js/audio.js`)

- `fftSize = 512`, suavização feita em JS (não no `AnalyserNode`).
- 8 bandas por `BAND_EDGES` (60 → 14 000 Hz), agrupadas em graves, médios e agudos.
- **graves** → anéis largos, lentos e verdes (banda `bass`);
- **médios** → anéis médios e contidos (banda `mid`);
- **agudos** → pontos âmbar curtos, a "pipoca" (banda `treble`);
- silêncio não fica vazio: o emissor solta uma respiração lenta em graves (`breathRate`/`breathDepth` do preset).
- `sens` escala o quanto o sonho escuta; `gate` define o volume mínimo para acordar.

## Modos de imagem (`MODE_PROFILES` em `js/config.js`)

| Modo | Identidade | Ajustes do sonar (ringGain / ringWidth / edgeDeform / edgeGain / dotGain / reflectionGain / videoGain) |
|---|---|---|
| **Silhueta** | Anéis cheios e vídeo presente | 1 / 1.25 / 1 / 1.15 / 0.55 / 0.75 / 1 |
| **Contorno** | Anéis finos, bordas gritantes | 0.92 / 0.6 / 1.5 / 1.5 / 0.75 / 0.9 / 0.8 |
| **Ambos** | Equilíbrio (padrão) | 1 / 1 / 1.2 / 1.3 / 0.7 / 0.85 / 1 |
| **Só ecos de luz** | Sem imagem: só o sonar | 1.12 / 1.3 / 0.55 / 0.75 / 0.5 / 0.35 / 0 |

## Presets (`PRESET_PROFILES`)

Os 4 botões mudam a personalidade do sonar de uma vez (valores de sliders em `js/presets.js`):

| Preset | decaimento | velocidade | âmbar | respiração (ritmo/profundidade) | pipoca |
|---|---|---|---|---|---|
| **Atento** (`bat`) | 0,905 | 1,3 | 0,16 | 1,0 / 0,4 | 1 |
| **Profundo** (`deep`) | 0,948 | 0,9 | 0,06 | 0,7 / 0,6 | 0,7 |
| **Brilhante** (`delirium`) | 0,928 | 1,5 | 0,42 | 1,25 / 0,35 | 1,35 |
| **Calmo** (`breath`) | 0,962 | 0,72 | 0,03 | 0,55 / 0,75 | 0,55 |

## Vídeo sob o sonar (`VIDEO_LEVELS`)

`oculto` 0 · `sutil` 0,12 · `visivel` 0,35. A presença final ainda é modulada por `vivid` e limitada a 0,6 — **nunca há rosto legível**: a imagem entra como massa verde sob a máscara de movimento (toque duplo na tela alterna os níveis).

## Paleta

Verde-fósforo (168, 224, 184) e âmbar (216, 168, 80), nada mais. O âmbar cresce nas bandas agudas e no `amberMix` do preset.

## Desempenho

- Análise fixa em 160×120; campo do sonar com teto de pixels (128 000 celular / 320 000 computador, lado maior ≤ 720/1200).
- Render em `min(dpr, 1.5)` no celular e `min(dpr, 2.0)` no computador; escala adaptativa 0,85× se quadros passarem de 16 ms e volta a 1× quando estabilizar (limites em `PERF`).
- Ping-pong de 2 canvas, sem `ImageData` novo por quadro; laços tipados, sem closures nem `Math.pow` no laço de pixels.
- Aba escondida: RAF parado, áudio suspenso, câmera desligada; tudo retoma ao voltar.
- `prefers-reduced-motion`: sem deriva, pulsos mais lentos/fracos, menos reflexos e respiração curta (fatores em `js/shaders.js`).

## Como evoluir

Leitura de pixels em `js/motion.js`; medição sonora em `js/audio.js`; desenho do sonar e composição em `js/renderers.js`; personalidade em `js/config.js` (modos/presets) e `js/shaders.js`; interação em `js/ui.js`/`js/app.js`.

Comece pelos números "de fora": `RING_FADE` (quanto cada pulso desvanece), a amplitude em `renderEnergy` (hoje `.6·√fade`) e o piso de borda (`0.68 + edge·…`). Evite `getImageData` extra por quadro, reutilize buffers e mantenha a captura local. Documente identidade, entrada, controles e custo esperado aqui.
