const Log = process.env.DEBUG?.includes("@berlysia/eslint-plugin")
  ? console
  : { log: () => {}, error: () => {}, warn: () => {}, info: () => {} };

export default Log;
