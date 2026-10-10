<<<<<<< HEAD
# Psyco_Visão

Experiência web responsiva da obra **“um dispositivo para ver através do sono”**. A página prioriza celular, preserva a imagem em vídeo e inicia em **SUTIL**. Câmera e análise opcional de áudio rodam localmente no navegador.

## Executar e publicar manualmente

Use um servidor local em `localhost` (por exemplo, Live Server) ou publique os arquivos estáticos manualmente no Vercel. O endereço publicado deve usar HTTPS para permitir câmera e microfone. Não há etapa de build: `index.html` é a entrada. Esta documentação não realiza publicação.

Ao abrir a página, o navegador solicita acesso à câmera; a captura só inicia após a permissão. O microfone é opcional e pode ser ligado em Ajustes. Os controles e o nível de vídeo são guardados no armazenamento local deste navegador. A câmera não é enviada a outro aparelho pelo site; para exibir o celular numa TV, use o espelhamento de tela do próprio sistema.

## Testar no laptop e no celular

**Laptop:** dê duplo clique em `Testar-Psyco_Visão.bat`. O script local usa Python 3 sem instalar bibliotecas, escolhe uma porta livre, inicia o servidor em `127.0.0.1` e abre o navegador. Permita a câmera quando solicitado. Deixe a janela do servidor aberta durante o teste; feche-a ou pressione `Ctrl+C` para parar. Se o Windows não encontrar Python, abra a pasta no VS Code e use **Go Live**.

Na aba **Sistema**, toque em **Verificar este aparelho** para ver formato da tela, ligação segura, Canvas, câmera, microfone, toque, movimento reduzido e armazenamento. **Tentar câmera** solicita acesso novamente. Os sliders e presets podem ser conferidos na própria interface.

**Celular/tablet com câmera:** `localhost` no laptop aponta para o próprio laptop; um endereço LAN por HTTP pode abrir a página no telefone, mas não é confiável para a câmera em muitos navegadores. Para testar câmera e microfone no aparelho, use um endereço HTTPS. A opção segura sem alterar o site principal é enviar manualmente uma branch de prévia ao GitHub conectado ao Vercel e abrir a Preview URL gerada no celular. Mantenha as alterações fora da branch de produção até terminar os testes. O painel de diagnóstico do mesmo `index.html` mostra se o navegador recebeu um contexto seguro.

## Compatibilidade e limites

Requer navegador moderno com módulos ES, Canvas 2D e `getUserMedia`; câmera e microfone precisam de contexto seguro (HTTPS ou localhost). O modo visual usa Canvas 2D e filtros, sem WebGL/GLSL, MediaPipe ou segmentação de pessoas. O recorte baseado em movimento é uma heurística artística, não identifica pessoas. Em dispositivos modestos, resolução e leitura de movimento diminuem adaptativamente. Permissões, políticas de autoplay e disponibilidade dos dispositivos dependem do navegador e sistema operacional.

## Estrutura

- `index.html`: marcação, conteúdo e controles acessíveis.
- `styles.css`: layout, responsividade, estados e movimento reduzido.
- `app.js`: inicialização, estado de sessão e coordenação do loop visual.
- `config.js`: perfis, níveis de vídeo e qualidade adaptativa.
- `camera.js`: mensagens de erro, restrições e utilidades de dispositivos.
- `audio.js`: cálculo das bandas e nível de sinal a partir dos buffers do navegador.
- `ui.js`: atualização de controles, rótulos e níveis de vídeo.
- `presets.js`: valores e aplicação dos quatro presets.
- `motion.js`: análise de diferença entre quadros e máscara de movimento.
- `shaders.js`: perfis de composição visual por modo e preset.
- `renderers.js`: composição reutilizável de camadas no Canvas.
- `utils.js`: limites numéricos e acesso seguro ao armazenamento local.
- `SHADERS.md`: catálogo visual e guia para evolução de efeitos.

## Presets e extensão

Os presets Atento, Profundo, Brilhante e Calmo selecionam uma combinação existente de modo e controles. Para criar um preset, acrescente seus valores em `PRESET_CONTROL_VALUES` em `presets.js` e exponha um botão correspondente em `index.html`. Para adicionar uma aparência de modo, defina o perfil em `MODE_PROFILES` de `config.js`, implemente sua composição em `app.js`/`renderers.js` e documente os parâmetros em `SHADERS.md`. Mantenha os valores de interface dentro dos limites HTML dos respectivos controles.

## Permissões e solução de problemas

- **Câmera bloqueada:** permita câmera nas permissões do site e recarregue. Se a câmera estiver ocupada, feche o outro aplicativo.
- **Sem câmera disponível:** verifique o seletor do aparelho e reconecte a câmera; a interface mantém seus estados de erro e recuperação.
- **Microfone sem reação:** habilite “Ligar o som”, permita o microfone e confira se outro aplicativo não o está usando. A captura de áudio é opcional.
- **Página aberta por `file://`:** use localhost ou HTTPS, pois arquivos locais não recebem acesso confiável aos dispositivos.
- **Tela pausada em segundo plano:** retorne à página; o navegador pode suspender a captura ou o contexto de áudio e exigir recuperação/permissão.

## Verificação recomendada antes de publicar

Verifique abertura e permissão de câmera em Safari iOS e Chrome Android, rotação retrato/paisagem, controles por toque e teclado, microfone permitido/negado, câmera indisponível, retorno de aba em segundo plano e `prefers-reduced-motion`. Confira também os três níveis de vídeo: **OCULTO**, **SUTIL** (padrão) e **VISÍVEL**. Este roteiro descreve validações manuais; resultados reais dependem de testar nos dispositivos-alvo.

## Preparar o novo projeto Vercel

O projeto é estático: `index.html`, CSS e módulos JavaScript são publicados diretamente, sem etapa de compilação. Ao importar o repositório `sole87cv-coder/Psyco_Vis-o` no painel do Vercel, use:

- Nome do projeto sugerido: `psyco-visao`.
- Framework Preset: **Other**.
- Root Directory: `.` (raiz do repositório).
- Build Command: vazio, sem comando de build.
- Output Directory: `.`.

O arquivo `vercel.json` define **Other**, a saída na raiz e mantém a remoção de `.html` e barra final. A conexão com GitHub, a branch de produção, o domínio e as regras de implantação pertencem ao painel da conta Vercel; esta preparação não cria o projeto nem publica o site.
=======
# Psyco_Vis-o
Interative Art.
>>>>>>> 83aff552a8067f569bd10b984e7c985c1a083b71
