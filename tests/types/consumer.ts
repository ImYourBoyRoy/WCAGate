import {
  EXIT_CODES,
  runAccessibility,
  type AdapterRunner,
  type ToolkitConfig
} from '@imyourboyroy/wcagate';
import { getBuiltinAdapters } from '@imyourboyroy/wcagate/adapters';
import { renderJsonReport } from '@imyourboyroy/wcagate/reporters';

const customAdapter: AdapterRunner = async (_config, context) => ({
  surfaceCount: 1,
  findings: [{
    ruleId: 'custom/example',
    title: 'Example',
    outcome: 'passed',
    severity: 'advisory',
    target: { adapter: context.adapterName }
  }]
});

const config: ToolkitConfig = {
  schemaVersion: 1,
  project: { name: 'typed-consumer', root: '.' },
  adapters: [{ type: 'module', module: './adapter.mjs' }],
  reporters: [{ type: 'json', file: 'run.json' }]
};

const run = await runAccessibility(config, {
  quiet: true,
  adapters: { module: customAdapter }
});

renderJsonReport(run);
getBuiltinAdapters();
const passCode: 0 = EXIT_CODES.PASS;
void passCode;
