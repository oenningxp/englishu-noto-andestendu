# Englishu Noto Andestêndu

Site para praticar conversação com correção de gramática e pronúncia, com dois professores de IA:

- **Sam 🇺🇸:** inglês americano.
- **Nii 🇯🇵:** japonês desde o zero. Mostra furigana e romaji, aceita digitar em romaji, e o treino de repetir compara pela leitura.

Cada professor tem conversa, nível e conversas salvas separados.

Tudo roda na conta gratuita da Cloudflare, a mesma do Gothic:

- **Worker `englishu-noto-andestendu`:** o site e a API.
- **D1 `gothic-db`:** o mesmo banco do Gothic. O login usa as contas do Gothic, e o Papo só grava nas tabelas que começam com `papo_`.
- **KV `IMAGES`:** o mesmo do Gothic, usado só para mostrar a foto de perfil.
- **Workers AI:** é a parte que conversa com você, ouve a sua fala e dá voz ao Sam. Todos os modelos ficam dentro da cota grátis de 10.000 "neurons" por dia, e a cota volta às 21h (horário de Brasília).
  - A conversa usa o modelo da variável `MODEL` no `wrangler.jsonc`.
  - O Whisper transcreve o áudio da sua fala.
  - O MeloTTS é a voz do Sam.

Endereço: `https://englishu-noto-andestendu.SEU-SUBDOMINIO.workers.dev`.

## Contas

- Entra quem tem conta no Gothic, com o mesmo usuário, a mesma senha e o mesmo código do autenticador.
- Não existe cadastro próprio. Quem quiser usar precisa de uma conta no Gothic, ou seja, de um convite.
- O login deste site é separado do login do Gothic. Sair de um não desconecta o outro.
- Os amigos têm um limite de falas por dia, definido em `DAILY_LIMIT`. O dono, definido em `ADMIN_USERNAME`, não tem limite.

## Publicação automática

O código fica no GitHub, no repositório `oenningxp/englishu-noto-andestendu`. Cada envio na branch `main` publica o site sozinho.

## Testes

```
npm test          # confere a sintaxe e testa o tutor
npm run test:full # também testa o servidor com um banco de mentira (Node 22 ou mais novo)
```
