// App shell — thin wrapper around Stage.
// The demoSim block from H1 has been replaced; all orchestration,
// ASR wiring, and widget rendering now live in Stage.tsx.

import { Stage } from "./Stage";

export default function App() {
  return <Stage />;
}
