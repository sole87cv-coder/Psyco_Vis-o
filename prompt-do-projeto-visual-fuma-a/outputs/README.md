# WebUruTao — demonstração web

Uma demonstração artística local do conceito “um dispositivo para ver através do sono”. Abra `index.html` em um navegador moderno. Para permitir câmera e microfone, sirva a pasta por HTTPS ou `localhost` e conceda as permissões solicitadas pelo navegador.

## O que funciona

- Tela escura imersiva com pulso de respiração, ecos circulares e rastro fosforescente.
- Permissão opcional de câmera e microfone. A imagem alimenta revelações abstratas e o áudio é analisado localmente pelo Web Audio API. Nenhum dado é enviado ou armazenado.
- Painel recolhível, quatro abas, controles, persistência local e quatro presets.
- Experiência responsiva para toque e mouse.

## Limites desta entrega

Este é um protótipo de navegador em um único arquivo, não a solução nativa MAUI descrita na especificação. Canvas 2D usa processamento da imagem no navegador, portanto não cumpre o requisito de pipeline 100% GPU/zero CPU por frame. A segmentação é uma aproximação visual, sem MediaPipe; seleção de performance é demonstrativa. Não inclui WebRTC, servidor de sinalização, Android foreground service, suporte iOS/Metal nem testes xUnit. A indicação de privacidade é literal: esta página não possui código de rede e não transmite a câmera ou áudio.

A instalação e validação MAUI também dependem do workload Android/iOS do Visual Studio, indisponível para verificação neste ambiente. Para validar permissões e comportamento de tela apagada, será necessário compilar e testar em dispositivos reais.
