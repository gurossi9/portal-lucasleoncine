# Publicar de graça no Render (para demonstração)

1. Crie uma conta em https://render.com usando **"Sign in with GitHub"**.
2. Clique em **New → Blueprint** e escolha o repositório do portal.
3. O Render lê o arquivo `render.yaml` e pede a **PAINEL_SENHA**: digite a senha que a equipe vai usar no painel.
4. Clique em **Apply / Deploy**. A primeira publicação leva uns 5 a 10 minutos (instala o LibreOffice para gerar o PDF).
5. Quando aparecer **Live**, o endereço fica no topo da página do serviço, por exemplo
   `https://portal-lucasleoncine.onrender.com`.
   - Formulário: `/`
   - Acompanhar: `/acompanhar.html`
   - Painel do gabinete: `/painel/` (usuário `gabinete` + a senha escolhida)

## Limites do plano gratuito
- O site "dorme" depois de ~15 minutos sem acesso. O primeiro acesso depois disso demora cerca de 1 minuto: abra o site um pouco antes de apresentar.
- Os dados (demandas, fotos e documentos) podem ser apagados quando o serviço reinicia ou é publicado de novo. Serve para demonstrar, não para uso real.
- WhatsApp e e-mail ficam desligados até o gabinete contratar um provedor (ver `server/env.example.txt`).

## Para uso real
Use um plano pago com disco permanente (montado em `/dados`) ou o servidor próprio com `docker-compose.yml` + `Caddyfile`, e um domínio próprio.
