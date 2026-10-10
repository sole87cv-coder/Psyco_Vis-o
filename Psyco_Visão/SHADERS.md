# Shaders simulados e composição Canvas 2D

O Psyco_Visão chama de “shader” a combinação artística de leitura de pixels, filtros Canvas 2D e camadas com modos de composição. Não há programa GLSL nem pipeline WebGL nesta implementação. A captura permanece no navegador local.

## Modos visuais

| Modo | Identidade | Camadas e resposta |
|---|---|---|
| **Silhueta** | Visão noturna mint e fosforescente | Imagem monocromática filtrada, bordas líquidas obtidas por diferenças deslocadas, halo suave e pulsos. Movimento e áudio podem ampliar a revelação. |
| **Contorno** | Desenho linear claro | Bordas de diferença realçadas, contraste alto e pequenos deslocamentos orgânicos. O ajuste de nitidez altera a presença das linhas. |
| **Ambos** | Campo híbrido | Mistura a imagem reduzida com halo e contornos em camadas de tela/luz. |
| **Só ecos de luz** | Malha abstrata respirante | Geometria sintetizada em Canvas, deformada por energia de áudio e atividade de movimento; não depende da imagem reconhecível da câmera. |

## Efeitos e controles

- **Bordas líquidas:** diferença entre a imagem atual e cópias deslocadas em poucos pixels; a composição luminosa desenha contornos. O ajuste “Nitidez da lembrança” controla o limiar de atividade e o contraste da máscara.
- **Halo e brilho:** filtros de desfoque e composição `screen`/`lighter` suavizam as bordas. Intensidade deriva do perfil do modo e da atividade disponível.
- **Rastros:** o buffer de persistência mistura quadros sucessivos com decaimento temporal; o controle de suavidade e presets alteram a duração.
- **Ondas e olho de peixe:** deslocamentos em faixas da imagem revelada; ajustáveis nos controles correspondentes e reativos ao sinal quando a escuta está ligada.
- **Falhas de cor:** cópias coloridas deslocadas compõem aberração cromática estilizada. A intensidade pode responder ao áudio.
- **Malha respirante:** linhas de latitude/meridiano com escala, rotação e ondulação lenta; graves, agudos e atividade influenciam deformação.
- **Grão e vinheta:** camadas decorativas CSS sobre o canvas final, aplicadas à composição geral.
- **Acessibilidade de movimento:** `prefers-reduced-motion` reduz oscilações e deslocamentos; continua mantendo uma imagem estática composta.

## Parâmetros por preset

`presets.js` define valores de interface para Atento (`bat`), Profundo (`deep`), Brilhante (`delirium`) e Calmo (`breath`). `config.js` define perfil de modo (`MODE_PROFILES`) e o perfil visual do preset (`PRESET_PROFILES`), incluindo contraste, saturação, brilho e persistência. Esses valores alimentam a composição existente; não são uma API independente de shader com opacidade configurável por efeito.

O microfone é opcional. Com a escuta desligada, os efeitos mantêm animação de base e não inferem energia sonora. Quando ativo, `audio.js` calcula RMS, pico, bandas aproximadas de graves/médios/agudos e frequência dominante dos dados retornados pelo `AnalyserNode`.

## Camadas e desempenho

A página compõe a câmera/máscara de movimento, efeitos primários, imagem revelada e rastros no Canvas 2D; grão e vinheta são CSS. Buffers auxiliares são usados onde a acumulação temporal ou a leitura de pixels exigem. A resolução da máscara e a frequência de amostragem reduzem-se quando o desempenho cai. O navegador ainda pode limitar câmera, áudio e animações quando a aba fica em segundo plano.

## Como evoluir

Ao adicionar efeito, escolha um módulo conforme sua responsabilidade: análise de pixels em `motion.js`, medição sonora em `audio.js`, composição compartilhada em `renderers.js`, perfil visual em `config.js`/`shaders.js` ou interação em `ui.js`. Evite leituras repetidas de `getImageData` dentro do mesmo quadro; reutilize buffers, respeite a resolução adaptativa e mantenha a captura local. Documente identidade, entrada, controles e custo esperado aqui.
