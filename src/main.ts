import { createApp } from './http/app';
import { registry } from './core/registry';

const port = Number(process.env.PORT ?? 3000);
createApp().listen(port, () => {
  console.log(`clinical-calc-api listening on http://localhost:${port}  (docs: /docs)`);
  console.log(`calculators: ${registry.list().map((d) => d.code).join(', ')}`);
});
