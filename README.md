# WebUruTao

Protótipo web responsivo da obra **“um dispositivo para ver através do sono”**. A experiência prioriza celular e também se ajusta a tablet e laptop.

## Publicar e testar no Vercel

1. No painel do Vercel, escolha **Add New → Project** e importe do GitHub o repositório que contém estes arquivos. Se a pasta local ainda não estiver conectada ao GitHub, crie/associe o repositório antes da importação.
2. Mantenha **Framework Preset: Other**. Não há build command nem pasta de saída: `index.html` é um site estático.
3. Clique em **Deploy** e abra o endereço `https://…vercel.app` no celular. A configuração estática `vercel.json` já está incluída.
4. Ao abrir em HTTPS, o navegador pede permissão de câmera e tenta ativá-la automaticamente. Permita o acesso. O microfone é opcional; se a permissão não for concedida, a câmera ainda funciona. Se o navegador bloquear o início automático, toque em **Adormecer** no painel.

Para teste local, use `localhost` (por exemplo, a extensão Live Server do VS Code). Abrir como `file://` não dá ao navegador acesso à câmera. Toque na tela para abrir os controles; eles recolhem após alguns segundos. Em **Sonho**, escolha silhueta onírica, contorno luminoso, ambos ou ecos abstratos. Os controles de intensidade ficam guardados no navegador.

## Espelhar o vídeo em outro dispositivo

Mantenha a página aberta e a câmera ativa no aparelho transmissor. Conecte os aparelhos à mesma rede Wi-Fi e use o espelhamento de tela do sistema:

- **Android → TV:** abra as Configurações rápidas e toque em **Transmitir**, **Smart View** ou **Espelhamento de tela**; selecione a TV/Chromecast.
- **iPhone/iPad → Apple TV:** abra a Central de Controle, toque em **Espelhamento de Tela** e selecione a Apple TV.
- **Laptop → Chromecast/TV:** no Chrome/Edge, abra o menu e escolha **Transmitir**; transmita a aba do navegador com o WebUruTao.

O botão **Copiar endereço** ajuda a compartilhar o link Vercel. Se abrir esse endereço diretamente na TV, ela mostrará a página, mas pedirá acesso à própria câmera. Para mostrar a imagem do celular, use o espelhamento iniciado no celular. Esta versão não implementa WebRTC entre dispositivos.

## Privacidade e limites

O site não envia imagem ou áudio para um servidor. Câmera e análise de áudio acontecem no navegador local. O microfone é opcional e ativado na aba Sistema em “Reagir ao som”. A cada frame visual, o navegador lê um bloco de 1024 amostras (cerca de 21–23 ms), calcula RMS e pico, lê as bandas de frequência da FFT interna do `AnalyserNode` e calibra o ruído ambiente nos primeiros 3 segundos. Graves aceleram e centralizam os ecos; agudos deixam os anéis mais espessos e nascem alternadamente nas laterais; a frequência dominante colore o pulso; transientes fortes reduzem o intervalo entre ecos. Sons contínuos elevam a respiração e o brilho do fundo. A linha de diagnóstico mostra nível, banda dominante e ecos ativos. O navegador executa sua própria janela espectral (Blackman) e mantém a análise sincronizada por snapshot no frame de render. Esta versão é uma demonstração Canvas 2D: não implementa pipeline nativo 100% GPU, MediaPipe, WebRTC, servidor de sinalização ou os apps MAUI Android/iOS. Os números de FPS/resolução são ilustrativos.

## Arquivos

- `index.html` — interface e demonstração.
- `vercel.json` — configuração de hospedagem estática.
- `README.md` — estas instruções.

O caminho local informado não apresentou metadados `.git` durante a verificação. O Vercel só poderá acompanhar envios automáticos quando esta pasta estiver conectada a um repositório GitHub.

## Diagnóstico do microfone

Na aba **Sistema**, ative **Reagir ao som** e permita o microfone. Na aba **Eco**, ajuste a sensibilidade, o gate de ruído e a suavização RMS. A captura usa `getUserMedia` e um `AnalyserNode` com FFT de 1024 amostras. O painel mostra nível, banda, ecos e leituras por segundo; o Console do navegador registra captura, RMS, pico, bandas e erros de permissão duas vezes por segundo. Se o RMS continuar em zero, confirme a permissão do site, selecione um microfone ativo no sistema e recarregue a página HTTPS.

A demonstração roda toda a análise e desenho no navegador. Não há `AudioRecord`, thread MAUI, GLSL ou uniforms OpenGL neste repositório; os valores de áudio alimentam diretamente o render Canvas em cada frame. O reforço da revelação aumenta a opacidade da imagem durante os ecos, sem implementar uma máscara de segmentação real.
