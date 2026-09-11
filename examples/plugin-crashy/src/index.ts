// omega.crashy — deliberately crashy fixture plugin (Ω3).
// crashy.please@1: kills THIS compartment — process.exit(1) means the worker
// dies with exit code 1, the µhost marks the compartment degraded and bumps
// stats.crashes. That crash signal is exactly what vivim.run's health loop
// watches for crash-loop quarantine. crashy.ping@1 is a well-behaved echo so
// the fixture is observable before it is killed.
import { definePlugin, startPlugin } from "@vivim/omega-shim";

startPlugin(
  definePlugin({
    ops: {
      "crashy.please@1": () => {
        process.exit(1); // no reply: the pending deliver resolves DEGRADED via failInflight
      },
      "crashy.ping@1": (payload) => ({ pong: true, payload: payload ?? null, at: Date.now() }),
    },
  }),
);
