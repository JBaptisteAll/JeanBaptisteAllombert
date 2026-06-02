/* eslint-disable */
/* global React, ReactDOM */

const { useState, useEffect } = React;

function PipelineApp() {
  const [data, setData] = useState(null);
  const [lang, setLang] = useState(navigator.language?.startsWith('en') ? 'en' : 'fr');

  useEffect(() => {
    fetch('data/pipeline.json')
      .then(r => r.json())
      .then(setData)
      .catch(e => console.error('pipeline data load failed', e));
  }, []);

  // Init mermaid for project diagrams
  useEffect(() => {
    if (window.mermaid) {
      window.mermaid.initialize({
        startOnLoad: false,
        theme: 'neutral',
        fontFamily: 'JetBrains Mono, monospace',
        themeVariables: {
          primaryColor: '#d94a3d',
          primaryTextColor: '#0d0d0d',
          lineColor: '#d94a3d',
          fontSize: '12px',
        },
      });
    }
  }, []);

  if (!data) {
    return (
      <div className="pipeline-loading">
        <span className="pl-dot"/>
        <span>booting pipeline…</span>
      </div>
    );
  }

  return (
    <>
      <PipelinePortfolio
        data={data}
        lang={lang}
        setLang={setLang}
      />
      <ChatBot />
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<PipelineApp/>);
