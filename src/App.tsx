export default function App() {
  return (
    <div className="stage">
      <header className="stage-header">
        <h1>Living Stage</h1>
        <span className="stage-tag">scaffold ready · waiting for utterance</span>
      </header>
      <main id="scene" />
      <div id="fallback-banner" hidden>
        Live stream interrupted — replaying rehearsed capture with the same architecture.
      </div>
      <footer className="transcript" aria-live="polite">
        <span className="transcript-cursor">▍</span>
      </footer>
    </div>
  );
}
