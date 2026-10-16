# O som revela a imagem — os 4 modos de sonho

No Psyco_Visão, o desenho **não existe no silêncio**. A câmera olha, o microfone escuta, e é o som que "acende" a imagem: o envelope sonoro multiplica a máscara de bordas/movimento, e o que apareceu vira **fósforo** — um rastro que se dissolve devagar (decaimento de 0,85 a 0,98 por quadro, conforme o modo). Sem som, a tela fica preta com uma **respiração** mínima (menos de 3% de brilho) para nunca parecer morta.

Tudo é Canvas 2D puro (nada de WebGL) e câmera/microfone 100% locais.

## Vocabulário

| termo | o que é |
|---|---|
| **envelope** | volume geral do som (RMS suavizado em JS); é ele que multiplica toda revelação |
| **máscara** | mapa do que a câmera viu de "estrutura" (bordas + movimento), a 160×120; é ela que o som revela |
| **campo** | buffer onde o sonho desenha; fica em resolução menor que a tela (teto de pixels em `FIELD_PIXELS`) |
| **fósforo / decaimento** | rastro que cada forma deixa ao se dissolver; por modo vai de 0,80 (Só contorno) a 0,98 (Eco de luz) |
| **núcleo** | o traço fino (1–2 px) de cada forma; vem acompanhado de um **halo** progressivamente borrado |
| **ponto cego** | área ao redor do emissor que fica sempre escura no modo Eco de luz |
| **vaga-lumes** | pontos curtos de luz que marcam os agudos (2–8 kHz) no Eco de luz |
| **respiração** | brilho de repouso no silêncio (<3%); ritmo e profundidade vêm do preset |

## O ciclo de cada quadro (`js/app.js` → `js/renderers.js`)

1. **Análise** (`js/motion.js`): a câmera vira 160×120; diferença temporal (`motion`) e gradiente (`edge`) alimentam um campo único `structure` com suavização exponencial (α 0,15–0,25).
2. **Escuta** (`js/audio.js`): `fftSize 512`, 8 bandas; o envelope RMS é suavizado em JS (subida rápida, descida pelo controle "Suavidade"). Sem microfone, um **envelope sintético** lento assume.
3. **Máscara** (`buildReveal`): o campo é comparado com um limiar por nível de vídeo; o resultado vira uma imagem RGBA na cor `palette.fill` do modo.
4. **Forma do modo** (ver tabela abaixo): cada modo desenha sua assinatura no campo (`renderEchoEnergy`, `renderSilhouette` + `renderContourThin`, `renderInfrared`).
5. **Acumulação** (`accumulate`): dois buffers alternam (ping-pong); o quadro novo entra multiplicado pelo **decaimento** do modo+preset.
6. **Composição** (`compose`): respiração ao fundo, vídeo tratado (por nível) por baixo, fósforo somado, ponto cego recortado.

**Filtro de coerência:** nada é desenhado onde não há borda, movimento ou som — o silêncio nunca vira granulado de tela cheia.

## Os 4 modos (`MODE_PROFILES` em `js/config.js`)

| Modo | Assinatura visual | Decaimento | Paleta | Ponto cego | Ajustes que ligam |
|---|---|---|---|---|---|
| **Eco de luz** (padrão) | Emissor na base dispara pulsos radiais (velocidade ∝ RMS); as bordas do vídeo deformam os anéis e geram ecos persistentes; vaga-lumes nos agudos | 0,94–0,98 | âmbar + branco quente | sim | `echo`, `reflectionGain .85`, `edgeDeform 1`, `dotGain 1` |
| **Silhueta** | Sem anéis: o som "corta" a silhueta em movimento, verde chapado, sem contorno; silêncio = preto total | 0,85–0,92 | verde escuro chapado | não | `fillAlpha .85`, `ringGain 0` |
| **Silhueta e contorno** | A mesma silhueta, translúcida (α .55), com contorno fino âmbar e fumaça subindo (traçadores de ruído coerente deslocados pelos agudos) | 0,90–0,96 | verde + âmbar + creme | não | `fillAlpha .55`, `contourAlpha .9`, `smoke 1` |
| **Só contorno** | Sem preenchimento: bordas a la Sobel com limiar adaptativo por bloco 8×8; cor vai de vermelho → âmbar → branco quente conforme a intensidade local; tremulação fina nos agudos | 0,80–0,88 | vermelho→âmbar→branco quente | não | `contourAlpha 1`, `jitter 2.4`, `ramp` |

Cada modo tem também `bandBass/bandMid/bandTreble` (peso das frequências) e `videoTint` (cor do vídeo tratado).

## Níveis de vídeo (`VIDEO_LEVELS` + `videoGain*`)

| Nível | O que aparece da câmera | Ganho |
|---|---|---|
| **OCULTO** (0%) | nada — só o fósforo do som | — |
| **SUTIL** (~12%, padrão) | apenas as **bordas** (máscara só de `edge`), quase invisível | `videoGainSutil .33` |
| **VISÍVEL** (~35%) | vídeo tratado na região do movimento/estrutura | `videoGainVisivel 1` |

O vídeo entra sempre **dessaturado** (escala de cinza) e multiplicado pela cor `videoTint` — nunca há rosto legível nem cor fiel. A presença final é multiplicada pelo envelope: sem som, o vídeo também apaga.

## Frequências → formas (`js/audio.js`)

- `fftSize = 512`, 8 bandas por `BAND_EDGES` (60 → 14 000 Hz), com suavização extra em JS.
- **graves (60–250 Hz)** → manchas largas e difusas (halo do baixo, pincel grosso);
- **médios (250–2 kHz)** → o corpo da silhueta e a força dos anéis;
- **agudos (2–8 kHz)** → bordas acesas, vaga-lumes e a tremulação fina do contorno.
- Sem microfone (negado/ausente): envelope sintético lento + aviso discreto na interface; o sonho continua respirando.

## Definição × atmosfera

- Cada forma tem **núcleo definido** (traço de 1–2 px) + **halo progressivamente borrado** (desenhado em resolução menor e ampliado com suavização).
- Movimento lê como vivo: a deformação por borda (`edgeDeform`), os ecos e a fumaça dão deriva constante; posições passam por suavização exponencial (α 0,15–0,25).
- Paletas restritas: 2–3 cores por modo.

## Desempenho (`PERF` em `js/config.js`)

- Análise fixa em 160×120; campo do sonho com teto de pixels (128 000 celular / 320 000 computador).
- Render em `min(dpr, 1.5)` no celular e `min(dpr, 2.0)` no computador.
- Orçamento medido em **tempo de trabalho** (não intervalo de vsync): acima de 16 ms por 1 s → escala ×0,85; abaixo de 10 ms por 3 s → volta a crescer. O relatório do diagnóstico mostra "Quadro médio".
- Ping-pong de 2 canvas; **zero `ImageData` novo por quadro** (buffers fixos, laços em arrays tipados, sem closures no laço de pixels).
- Aba escondida: RAF parado + áudio suspenso; retoma ao voltar.
- `prefers-reduced-motion`: sem fumaça, sem tremulação, decaimento curto — a revelação por som permanece.
- Fallbacks: sem `OffscreenCanvas` usa canvas normal; sem `AudioContext`, envelope sintético; sem câmera, o modo Eco de luz pulsa só com o som.

## Como evoluir

Números "de fora" para brincar: o **decaimento** de cada modo (`decayMin/decayMax/decayBase`), a **paleta** (`palette.fill/core/warm/veil/flash/ramp`), o **limiar** de revelação em `buildReveal` (`sutil .34` / demais `.14`), a **fumaça** (`spawnSmoke`/`updateAndDrawSmoke`) e a **tremulação** (`jitter`). Meça sempre o "Quadro médio" no diagnóstico antes e depois. Evite `getImageData` extra por quadro, reutilize buffers e mantenha a captura local. Documente identidade, entrada, controles e custo esperado aqui.
