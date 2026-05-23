import { Sim } from "./widgets/Sim";
import type { SimData } from "./lib/schemas";

// H1 standalone Sim verification — wired into the orchestrator later.
// 30-year mortgage payment: monthly = p * r/1200 / (1 - (1 + r/1200)^(-360))
const demoSim: SimData = {
  vars: [
    { n: "p", v0: 200000, min: 50000, max: 1_000_000, step: 1000, unit: "$" },
    { n: "rate", v0: 5, min: 1, max: 12, step: 0.1, unit: "%", slider: true },
  ],
  rels: [
    {
      lhs: "monthly",
      expr: "p * rate / 1200 / (1 - (1 + rate/1200)^(-12*30))",
    },
    { lhs: "totalInterest", expr: "monthly * 360 - p" },
  ],
  chart: { x: "rate", y: "monthly", scale: "lin" },
};

export default function App() {
  return (
    <div className="stage">
      <header className="stage-header">
        <h1>Living Stage</h1>
        <span className="stage-tag">sim verify · drag the rate slider</span>
      </header>
      <main id="scene">
        <Sim title="Mortgage payment (30y fixed)" data={demoSim} />
      </main>
      <div id="fallback-banner" hidden>
        Live stream interrupted — replaying rehearsed capture with the same architecture.
      </div>
      <footer className="transcript" aria-live="polite">
        <span className="transcript-cursor">▍</span>
      </footer>
    </div>
  );
}
