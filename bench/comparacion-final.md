# Benchmark: baseline-swiftshader → final-swiftshader

- A: bench/results-2026-11-26-19-42-baseline-swiftshader.json (2026-11-26T19:42:52.221Z)
- B: bench/results-2026-11-27-01-02-final-swiftshader.json (2026-11-27T01:02:29.157Z)

## desktop

| Métrica | Antes | Después |
|---|---:|---:|
| Primer cuadro con la máquina | 5978 ms | 6396 ms |
| Transferido hasta ver la máquina | 1.10 MB | 1.46 MB |
| Programas de shader compilados durante las acciones | 23 | 1 |
| Tiempo de compilación de shaders (total) | 2566 ms | 8 ms |
| Tiempo de subida de texturas (total) | 368 ms | 18 ms |
| Draw calls (último cuadro) | 626 | 482 |
| Triángulos (último cuadro) | 4.811.344 | 1.377.542 |

| Acción | compile ms (A→B) | texturas ms (A→B) | programas (A→B) | tarea más larga ms (A→B) | cuadro máx ms (A→B) |
|---|---:|---:|---:|---:|---:|
| paso 1 (Modelo) | 0 → 0 | 0 → 0 | 0 → 0 | 737 → 428 | 733.3 → 416.7 |
| opción 1 del paso 1 | 83 → 0 | 3 → 3 | -2 → 0 | 841 → 415 | 916.6 → 416.6 |
| opción 2 del paso 1 | 105 → 0 | 3 → 2 | 0 → 0 | 1059 → 518 | 1133.3 → 533.4 |
| opción 3 del paso 1 | 145 → 0 | 3 → 3 | 4 → 0 | 936 → 549 | 999.9 → 549.9 |
| paso 2 (Surcos) | 0 → 0 | 0 → 0 | 0 → 0 | 708 → 545 | 716.7 → 550.1 |
| opción 1 del paso 2 | 91 → 0 | 3 → 0 | 0 → 0 | 776 → 479 | 850 → 483.2 |
| opción 2 del paso 2 | 68 → 0 | 5 → 0 | 0 → 0 | 706 → 552 | 783.3 → 566.6 |
| opción 3 del paso 2 | 97 → 0 | 3 → 0 | 0 → 0 | 712 → 593 | 799.9 → 600 |
| paso 3 (Transporte) | 0 → 0 | 0 → 0 | 0 → 0 | 512 → 558 | 516.7 → 550 |
| opción 1 del paso 3 | 62 → 0 | 3 → 0 | 0 → 0 | 722 → 611 | 849.9 → 616.6 |
| opción 2 del paso 3 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 512 | 16.8 → 516.7 |
| opción 3 del paso 3 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 524 | 16.8 → 533.3 |
| paso 4 (Tolvas) | 0 → 0 | 0 → 0 | 0 → 0 | 604 → 520 | 600 → 533.2 |
| opción 1 del paso 4 | 2 → 0 | 3 → 0 | -1 → 0 | 700 → 590 | 799.9 → 600 |
| opción 2 del paso 4 | 3 → 0 | 3 → 0 | 0 → 0 | 742 → 579 | 783.3 → 583.3 |
| opción 3 del paso 4 | 3 → 0 | 3 → 0 | 0 → 0 | 717 → 595 | 800 → 600 |
| paso 5 (Tren de siembra) | 0 → 0 | 0 → 0 | 0 → 0 | 616 → 532 | 616.7 → 533.3 |
| opción 1 del paso 5 | 2 → 0 | 3 → 0 | 0 → 0 | 625 → 548 | 683.4 → 600 |
| opción 2 del paso 5 | 3 → 0 | 3 → 0 | 0 → 0 | 683 → 606 | 766.7 → 583.3 |
| opción 3 del paso 5 | 3 → 0 | 3 → 0 | 0 → 0 | 758 → 609 | 849.9 → 600 |
| paso 6 (Tecnología) | 0 → 0 | 0 → 0 | 0 → 0 | 800 → 667 | 799.9 → 666.7 |
| opción 1 del paso 6 | 3 → 0 | 3 → 0 | 0 → 0 | 837 → 664 | 900 → 666.5 |
| opción 2 del paso 6 | 3 → 0 | 3 → 0 | 0 → 0 | 735 → 590 | 816.6 → 583.3 |
| opción 3 del paso 6 | 3 → 0 | 3 → 0 | 0 → 0 | 699 → 586 | 766.5 → 583.2 |
| paso 7 (Personalizar) | 3 → 0 | 0 → 0 | 1 → 0 | 620 → 470 | 616.6 → 466.6 |
| opción 1 del paso 7 | 3 → 0 | 3 → 3 | 0 → 0 | 600 → 450 | 599.9 → 450 |
| opción 2 del paso 7 | 4 → 0 | 3 → 3 | 0 → 0 | 634 → 541 | 633.4 → 533.2 |
| opción 3 del paso 7 | 3 → 0 | 3 → 3 | 0 → 0 | 563 → 480 | 566.7 → 483.3 |
| Estudio → Campo (siembra) | 1646 → 0 | 108 → 0 | 18 → 0 | 626 → 716 | 850 → 733.4 |
| Campo → Ruta (plegado + andar) | 232 → 5 | 204 → 0 | 0 → 1 | 1430 → 688 | 1433.3 → 700 |
| Ruta → Estudio | 0 → 2 | 0 → 0 | 0 → 0 | 1039 → 776 | 1050 → 783.3 |
| Ver sembrando | 0 → 0 | 0 → 0 | 0 → 0 | 1043 → 776 | 1033.3 → 783.3 |
| Detener | 0 → 0 | 0 → 0 | 0 → 0 | 957 → 609 | 966.7 → 616.7 |

## mobile (CPU 4x)

| Métrica | Antes | Después |
|---|---:|---:|
| Primer cuadro con la máquina | 7297 ms | 7590 ms |
| Transferido hasta ver la máquina | 1.10 MB | 1.46 MB |
| Programas de shader compilados durante las acciones | 4 | 1 |
| Tiempo de compilación de shaders (total) | 790 ms | 17 ms |
| Tiempo de subida de texturas (total) | 1108 ms | 84 ms |
| Draw calls (último cuadro) | 446 | 482 |
| Triángulos (último cuadro) | 4.693.280 | 1.425.062 |

| Acción | compile ms (A→B) | texturas ms (A→B) | programas (A→B) | tarea más larga ms (A→B) | cuadro máx ms (A→B) |
|---|---:|---:|---:|---:|---:|
| paso 1 (Modelo) | 0 → 0 | 0 → 0 | 0 → 0 | 714 → 197 | 716.6 → 200 |
| opción 1 del paso 1 | 75 → 0 | 13 → 17 | -2 → 0 | 961 → 220 | 1249.9 → 250 |
| opción 2 del paso 1 | 175 → 0 | 14 → 14 | 1 → 0 | 1104 → 204 | 1433.2 → 200 |
| opción 3 del paso 1 | 98 → 0 | 13 → 14 | 0 → 0 | 1020 → 217 | 1316.6 → 216.7 |
| paso 2 (Surcos) | 0 → 0 | 0 → 0 | 0 → 0 | 633 → 187 | 666.6 → 233.3 |
| opción 1 del paso 2 | 70 → 0 | 22 → 0 | 0 → 0 | 852 → 328 | 1116.7 → 333.3 |
| opción 2 del paso 2 | 62 → 0 | 9 → 0 | 0 → 0 | 689 → 526 | 1066.5 → 533.3 |
| opción 3 del paso 2 | 104 → 0 | 12 → 0 | 0 → 0 | 688 → 374 | 950 → 366.7 |
| paso 3 (Transporte) | 0 → 0 | 0 → 0 | 0 → 0 | 547 → 429 | 533.3 → 433.4 |
| opción 1 del paso 3 | 52 → 0 | 14 → 0 | 0 → 0 | 578 → 433 | 866.6 → 433.2 |
| opción 2 del paso 3 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 451 | 16.8 → 450 |
| opción 3 del paso 3 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 460 | 16.8 → 466.6 |
| paso 4 (Tolvas) | 0 → 0 | 0 → 0 | 0 → 0 | 632 → 373 | 633.3 → 366.7 |
| opción 1 del paso 4 | 6 → 0 | 13 → 0 | -1 → 0 | 748 → 499 | 1233.2 → 500 |
| opción 2 del paso 4 | 4 → 0 | 20 → 0 | 0 → 0 | 728 → 540 | 1116.6 → 549.9 |
| opción 3 del paso 4 | 2 → 0 | 13 → 0 | 0 → 0 | 648 → 606 | 950 → 600 |
| paso 5 (Tren de siembra) | 0 → 0 | 0 → 0 | 0 → 0 | 561 → 564 | 583.3 → 566.6 |
| opción 1 del paso 5 | 4 → 0 | 13 → 0 | 0 → 0 | 659 → 394 | 949.9 → 399.9 |
| opción 2 del paso 5 | 3 → 0 | 13 → 0 | 0 → 0 | 773 → 452 | 950 → 449.9 |
| opción 3 del paso 5 | 5 → 0 | 14 → 0 | 0 → 0 | 746 → 507 | 1016.6 → 516.7 |
| paso 6 (Tecnología) | 0 → 0 | 0 → 0 | 0 → 0 | 644 → 408 | 649.9 → 533.2 |
| opción 1 del paso 6 | 2 → 0 | 12 → 0 | 0 → 0 | 712 → 449 | 916.6 → 450 |
| opción 2 del paso 6 | 5 → 0 | 12 → 0 | 0 → 0 | 648 → 402 | 883.2 → 416.7 |
| opción 3 del paso 6 | 4 → 0 | 15 → 0 | 0 → 0 | 718 → 423 | 983.3 → 433.3 |
| paso 7 (Personalizar) | 6 → 0 | 0 → 0 | 1 → 0 | 518 → 370 | 566.7 → 366.7 |
| opción 1 del paso 7 | 6 → 0 | 13 → 16 | 0 → 0 | 609 → 359 | 633.2 → 366.7 |
| opción 2 del paso 7 | 3 → 0 | 14 → 11 | 0 → 0 | 549 → 343 | 550.1 → 349.9 |
| opción 3 del paso 7 | 4 → 0 | 14 → 12 | 0 → 0 | 568 → 310 | 566.7 → 316.6 |
| Estudio → Campo (siembra) | 0 → 0 | 0 → 0 | 0 → 0 | 1453 → 376 | 2116.6 → 383.3 |
| Campo → Ruta (plegado + andar) | 83 → 5 | 845 → 0 | 2 → 1 | 3348 → 340 | 3366.5 → 350 |
| Ruta → Estudio | 16 → 6 | 4 → 0 | 0 → 0 | 813 → 380 | 816.6 → 383.3 |
| Ver sembrando | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 356 | 33.3 → 350 |
| Detener | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 394 | 16.8 → 416.7 |

