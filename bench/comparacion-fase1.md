# Benchmark: baseline-swiftshader → fase1-swiftshader

- A: bench/results-2026-11-26-19-42-baseline-swiftshader.json (2026-11-26T19:42:52.221Z)
- B: bench/results-2026-11-26-20-48-fase1-swiftshader.json (2026-11-26T20:48:12.484Z)

## desktop

| Métrica | Antes | Después |
|---|---:|---:|
| Primer cuadro con la máquina | 5978 ms | 5046 ms |
| Transferido hasta ver la máquina | 1.10 MB | 1.14 MB |
| Programas de shader compilados durante las acciones | 23 | 1 |
| Tiempo de compilación de shaders (total) | 2566 ms | 116 ms |
| Tiempo de subida de texturas (total) | 368 ms | 22 ms |
| Draw calls (último cuadro) | 626 | 412 |
| Triángulos (último cuadro) | 4.811.344 | 4.865.710 |

| Acción | compile ms (A→B) | texturas ms (A→B) | programas (A→B) | tarea más larga ms (A→B) | cuadro máx ms (A→B) |
|---|---:|---:|---:|---:|---:|
| paso 1 (Modelo) | 0 → 0 | 0 → 0 | 0 → 0 | 737 → 817 | 733.3 → 816.7 |
| opción 1 del paso 1 | 83 → 0 | 3 → 3 | -2 → 0 | 841 → 881 | 916.6 → 883.3 |
| opción 2 del paso 1 | 105 → 0 | 3 → 3 | 0 → 0 | 1059 → 789 | 1133.3 → 783.3 |
| opción 3 del paso 1 | 145 → 0 | 3 → 4 | 4 → 0 | 936 → 1038 | 999.9 → 1033.4 |
| paso 2 (Surcos) | 0 → 0 | 0 → 0 | 0 → 0 | 708 → 989 | 716.7 → 1000 |
| opción 1 del paso 2 | 91 → 0 | 3 → 0 | 0 → 0 | 776 → 939 | 850 → 933.3 |
| opción 2 del paso 2 | 68 → 0 | 5 → 0 | 0 → 0 | 706 → 955 | 783.3 → 966.6 |
| opción 3 del paso 2 | 97 → 0 | 3 → 0 | 0 → 0 | 712 → 973 | 799.9 → 966.6 |
| paso 3 (Transporte) | 0 → 0 | 0 → 0 | 0 → 0 | 512 → 928 | 516.7 → 966.6 |
| opción 1 del paso 3 | 62 → 0 | 3 → 0 | 0 → 0 | 722 → 834 | 849.9 → 850 |
| opción 2 del paso 3 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 904 | 16.8 → 900 |
| opción 3 del paso 3 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 16.8 → 16.8 |
| paso 4 (Tolvas) | 0 → 0 | 0 → 0 | 0 → 0 | 604 → 960 | 600 → 949.9 |
| opción 1 del paso 4 | 2 → 0 | 3 → 0 | -1 → 0 | 700 → 1048 | 799.9 → 1066.7 |
| opción 2 del paso 4 | 3 → 0 | 3 → 0 | 0 → 0 | 742 → 1058 | 783.3 → 1066.6 |
| opción 3 del paso 4 | 3 → 0 | 3 → 0 | 0 → 0 | 717 → 1275 | 800 → 1283.2 |
| paso 5 (Tren de siembra) | 0 → 0 | 0 → 0 | 0 → 0 | 616 → 1039 | 616.7 → 1033.3 |
| opción 1 del paso 5 | 2 → 0 | 3 → 0 | 0 → 0 | 625 → 1026 | 683.4 → 1016.7 |
| opción 2 del paso 5 | 3 → 0 | 3 → 0 | 0 → 0 | 683 → 1051 | 766.7 → 1066.6 |
| opción 3 del paso 5 | 3 → 0 | 3 → 0 | 0 → 0 | 758 → 1028 | 849.9 → 1033.2 |
| paso 6 (Tecnología) | 0 → 0 | 0 → 0 | 0 → 0 | 800 → 1131 | 799.9 → 1133.3 |
| opción 1 del paso 6 | 3 → 0 | 3 → 0 | 0 → 0 | 837 → 1106 | 900 → 1099.9 |
| opción 2 del paso 6 | 3 → 0 | 3 → 0 | 0 → 0 | 735 → 1007 | 816.6 → 1033.2 |
| opción 3 del paso 6 | 3 → 0 | 3 → 0 | 0 → 0 | 699 → 983 | 766.5 → 1016.7 |
| paso 7 (Personalizar) | 3 → 0 | 0 → 0 | 1 → 0 | 620 → 1061 | 616.6 → 1066.6 |
| opción 1 del paso 7 | 3 → 0 | 3 → 3 | 0 → 0 | 600 → 808 | 599.9 → 800 |
| opción 2 del paso 7 | 4 → 0 | 3 → 3 | 0 → 0 | 634 → 844 | 633.4 → 850 |
| opción 3 del paso 7 | 3 → 0 | 3 → 3 | 0 → 0 | 563 → 792 | 566.7 → 783.3 |
| Estudio → Campo (siembra) | 1646 → 116 | 108 → 4 | 18 → 1 | 626 → 1650 | 850 → 1666.6 |
| Campo → Ruta (plegado + andar) | 232 → 0 | 204 → 0 | 0 → 0 | 1430 → 1105 | 1433.3 → 1116.7 |
| Ruta → Estudio | 0 → 0 | 0 → 0 | 0 → 0 | 1039 → 1174 | 1050 → 1166.7 |
| Ver sembrando | 0 → 0 | 0 → 0 | 0 → 0 | 1043 → 1172 | 1033.3 → 1166.6 |
| Detener | 0 → 0 | 0 → 0 | 0 → 0 | 957 → 1143 | 966.7 → 1149.9 |

## mobile (CPU 4x)

| Métrica | Antes | Después |
|---|---:|---:|
| Primer cuadro con la máquina | 7297 ms | 6266 ms |
| Transferido hasta ver la máquina | 1.10 MB | 1.14 MB |
| Programas de shader compilados durante las acciones | 4 | 1 |
| Tiempo de compilación de shaders (total) | 790 ms | 124 ms |
| Tiempo de subida de texturas (total) | 1108 ms | 110 ms |
| Draw calls (último cuadro) | 446 | 450 |
| Triángulos (último cuadro) | 4.693.280 | 5.041.514 |

| Acción | compile ms (A→B) | texturas ms (A→B) | programas (A→B) | tarea más larga ms (A→B) | cuadro máx ms (A→B) |
|---|---:|---:|---:|---:|---:|
| paso 1 (Modelo) | 0 → 0 | 0 → 0 | 0 → 0 | 714 → 770 | 716.6 → 783.3 |
| opción 1 del paso 1 | 75 → 0 | 13 → 14 | -2 → 0 | 961 → 791 | 1249.9 → 816.5 |
| opción 2 del paso 1 | 175 → 0 | 14 → 17 | 1 → 0 | 1104 → 832 | 1433.2 → 833.3 |
| opción 3 del paso 1 | 98 → 0 | 13 → 14 | 0 → 0 | 1020 → 878 | 1316.6 → 883.3 |
| paso 2 (Surcos) | 0 → 0 | 0 → 0 | 0 → 0 | 633 → 1168 | 666.6 → 1166.7 |
| opción 1 del paso 2 | 70 → 0 | 22 → 0 | 0 → 0 | 852 → 891 | 1116.7 → 900 |
| opción 2 del paso 2 | 62 → 0 | 9 → 0 | 0 → 0 | 689 → 986 | 1066.5 → 983.3 |
| opción 3 del paso 2 | 104 → 0 | 12 → 0 | 0 → 0 | 688 → 936 | 950 → 883.3 |
| paso 3 (Transporte) | 0 → 0 | 0 → 0 | 0 → 0 | 547 → 874 | 533.3 → 883.3 |
| opción 1 del paso 3 | 52 → 0 | 14 → 0 | 0 → 0 | 578 → 882 | 866.6 → 899.9 |
| opción 2 del paso 3 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 895 | 16.8 → 900 |
| opción 3 del paso 3 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 731 | 16.8 → 866.6 |
| paso 4 (Tolvas) | 0 → 0 | 0 → 0 | 0 → 0 | 632 → 915 | 633.3 → 916.7 |
| opción 1 del paso 4 | 6 → 0 | 13 → 0 | -1 → 0 | 748 → 1033 | 1233.2 → 999.9 |
| opción 2 del paso 4 | 4 → 0 | 20 → 0 | 0 → 0 | 728 → 945 | 1116.6 → 966.6 |
| opción 3 del paso 4 | 2 → 0 | 13 → 0 | 0 → 0 | 648 → 953 | 950 → 966.7 |
| paso 5 (Tren de siembra) | 0 → 0 | 0 → 0 | 0 → 0 | 561 → 979 | 583.3 → 983.4 |
| opción 1 del paso 5 | 4 → 0 | 13 → 0 | 0 → 0 | 659 → 844 | 949.9 → 849.9 |
| opción 2 del paso 5 | 3 → 0 | 13 → 0 | 0 → 0 | 773 → 870 | 950 → 883.3 |
| opción 3 del paso 5 | 5 → 0 | 14 → 0 | 0 → 0 | 746 → 896 | 1016.6 → 900 |
| paso 6 (Tecnología) | 0 → 0 | 0 → 0 | 0 → 0 | 644 → 936 | 649.9 → 933.3 |
| opción 1 del paso 6 | 2 → 0 | 12 → 0 | 0 → 0 | 712 → 941 | 916.6 → 949.9 |
| opción 2 del paso 6 | 5 → 0 | 12 → 0 | 0 → 0 | 648 → 950 | 883.2 → 966.6 |
| opción 3 del paso 6 | 4 → 0 | 15 → 0 | 0 → 0 | 718 → 1051 | 983.3 → 1066.6 |
| paso 7 (Personalizar) | 6 → 0 | 0 → 0 | 1 → 0 | 518 → 861 | 566.7 → 866.6 |
| opción 1 del paso 7 | 6 → 0 | 13 → 14 | 0 → 0 | 609 → 818 | 633.2 → 833.3 |
| opción 2 del paso 7 | 3 → 0 | 14 → 12 | 0 → 0 | 549 → 745 | 550.1 → 766.6 |
| opción 3 del paso 7 | 4 → 0 | 14 → 19 | 0 → 0 | 568 → 788 | 566.7 → 816.6 |
| Estudio → Campo (siembra) | 0 → 124 | 0 → 20 | 0 → 1 | 1453 → 1564 | 2116.6 → 1633.4 |
| Campo → Ruta (plegado + andar) | 83 → 0 | 845 → 0 | 2 → 0 | 3348 → 1062 | 3366.5 → 1066.7 |
| Ruta → Estudio | 16 → 0 | 4 → 0 | 0 → 0 | 813 → 1123 | 816.6 → 1116.6 |
| Ver sembrando | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 1100 | 33.3 → 1100 |
| Detener | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 1248 | 16.8 → 1266.6 |

