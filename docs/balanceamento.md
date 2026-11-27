# Balanceamento

Os valores oficiais ficam na tabela `game_config` do banco (chaves `economia` e `negocios`).
Este arquivo é o espelho legível. Mudou um número lá? Atualize aqui no mesmo PR.

Todos os tempos e produções abaixo são para **velocidade 1×**. A velocidade do mundo multiplica a
produção e divide o tempo das obras.

## Economia (`economia`)

| Parâmetro                       | Valor                                    |
| ------------------------------- | ---------------------------------------- |
| Recursos iniciais               | 500 Cash · 500 Material · 300 Influência |
| Produção mínima (sem o negócio) | 10/h de cada                             |
| Armazém mínimo (sem Doca)       | 1.000 de cada                            |
| Fila de obras                   | 5 itens, em sequência                    |
| Pontos                          | 10 por nível de negócio                  |

## Fórmulas

- **Custo** do nível N = custo base × fator_custo^(N−1), arredondado.
- **Tempo** do nível N = tempo base × fator_tempo^(N−1) × (1 − redução da Torre) ÷ velocidade.
- **Produção** no nível N = base × fator^(N−1) por hora (× velocidade).
- **Armazém** com Doca nível N = 1.000 × 1,25^N.
- **Torre de rádio** nível N: obras (1 − 0,95^(N−1)) mais rápidas.

## Negócios (`negocios`)

| Negócio        | Inicial | Máx | Custo base (C/M/I) | Fator custo | Tempo base | Fator tempo | Efeito                                      |
| -------------- | ------- | --- | ------------------ | ----------- | ---------- | ----------- | ------------------------------------------- |
| Torre de rádio | 1       | 20  | 90 / 80 / 70       | 1,26        | 60 s       | 1,18        | −5% tempo de obra por nível                 |
| Boate          | 1       | 25  | 50 / 60 / 40       | 1,26        | 40 s       | 1,18        | Cash: 60/h × 1,17^(N−1)                     |
| Oficina        | 1       | 25  | 65 / 50 / 40       | 1,26        | 40 s       | 1,18        | Material: 60/h × 1,17^(N−1)                 |
| Escritório     | 1       | 25  | 75 / 65 / 30       | 1,26        | 45 s       | 1,18        | Influência: 50/h × 1,17^(N−1)               |
| Doca           | 1       | 25  | 60 / 50 / 40       | 1,26        | 45 s       | 1,18        | Armazém 1.000 × 1,25^N                      |
| Garagem        | 0       | 20  | 200 / 170 / 90     | 1,26        | 90 s       | 1,20        | Recrutar crew (fase futura). Requer Torre 3 |

## Referências rápidas (velocidade 1×)

|                    | Nível 2 | Nível 10 | Nível 20 |
| ------------------ | ------- | -------- | -------- |
| Boate: custo total | 189     | ~1.200   | ~12.000  |
| Boate: tempo       | 47 s    | ~3 min   | ~15 min  |
| Boate: produção    | 70/h    | ~245/h   | ~1.180/h |
| Doca: armazém      | 1.563   | ~9.300   | ~86.700  |
