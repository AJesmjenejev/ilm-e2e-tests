const STEP  = '  ▶';
const OK    = '  ✓';
const INFO  = '  ℹ';

export const log = {
  step: (msg: string) => console.log(`${STEP} ${msg}`),
  ok:   (msg: string) => console.log(`${OK} ${msg}`),
  info: (msg: string) => console.log(`${INFO} ${msg}`),
};