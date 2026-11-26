/** Corre todas las pruebas de punta a punta. Uso: node tests/e2e/run.cjs [flujo] [capturas] [rendimiento] [espera] [ruta] */
const suites = { flujo: './flujo.cjs', capturas: './capturas.cjs', rendimiento: './rendimiento.cjs', espera: './espera.cjs', ruta: './ruta.cjs' };
(async () => {
  const wanted = process.argv.slice(2).filter((a) => suites[a]);
  const list = wanted.length ? wanted : Object.keys(suites);
  let failed = 0;
  for (const name of list) {
    console.log(`\n▶ ${name}`);
    const report = await require(suites[name]).run();
    failed += report.failed;
  }
  console.log(failed ? `\n${failed} verificaciones fallaron` : '\nTodo en orden');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
