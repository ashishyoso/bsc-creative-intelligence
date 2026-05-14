'use client';
import { useEffect, useRef, useState } from 'react';

type Message = { role: 'user' | 'assistant'; content: string };
type ChartSpec = { type: 'bar'; title?: string; data: Array<{ label: string; value: number }> };

const STORAGE_KEY = 'bsc-ama-history';

function extractChart(text: string): { body: string; chart: ChartSpec | null } {
  const m = text.match(/```chart\s*\n([\s\S]*?)```/);
  if (!m) return { body: text, chart: null };
  try {
    const spec = JSON.parse(m[1]) as ChartSpec;
    if (spec.type === 'bar' && Array.isArray(spec.data)) {
      return { body: text.replace(m[0], '').trim(), chart: spec };
    }
  } catch {}
  return { body: text, chart: null };
}

function confidenceFrom(text: string): 'high' | 'medium' | 'low' | 'none' | null {
  const m = text.match(/Confidence:\s*\**(high|medium|low|none)\**/i);
  return m ? (m[1].toLowerCase() as 'high' | 'medium' | 'low' | 'none') : null;
}

function stripConfidence(text: string): string {
  // Drop the entire Confidence line (and any trailing context) wherever it appears.
  return text.replace(/^[ \t]*Confidence:.*$/gim, '').replace(/\n{3,}/g, '\n\n').trim();
}

function BarChart({ spec }: { spec: ChartSpec }) {
  const max = Math.max(...spec.data.map((d) => d.value), 0.0001);
  return (
    <div className="ama-chart">
      {spec.title && <div className="ama-chart-title">{spec.title}</div>}
      <div className="ama-chart-bars">
        {spec.data.map((d, i) => (
          <div key={i} className="ama-bar-row">
            <div className="ama-bar-label" title={d.label}>{d.label}</div>
            <div className="ama-bar-track">
              <div className="ama-bar-fill" style={{ width: `${(d.value / max) * 100}%` }} />
            </div>
            <div className="ama-bar-value">{Number.isInteger(d.value) ? d.value : d.value.toFixed(2)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderInline(line: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\[[0-9a-f]{8,}\])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) parts.push(line.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) {
      parts.push(<strong key={i++}>{tok.slice(2, -2)}</strong>);
    } else {
      const id = tok.slice(1, -1);
      parts.push(<a key={i++} href={`/asset/${id}`} className="ama-cite">{id.slice(0, 8)}</a>);
    }
    last = m.index + tok.length;
  }
  if (last < line.length) parts.push(line.slice(last));
  return parts;
}

function renderMarkdownLite(text: string): React.ReactNode {
  const lines = text.split('\n');
  const out: React.ReactNode[] = [];
  let listBuf: string[] = [];
  const flushList = () => {
    if (listBuf.length) {
      out.push(
        <ul key={`ul-${out.length}`}>
          {listBuf.map((it, i) => <li key={i}>{renderInline(it)}</li>)}
        </ul>
      );
      listBuf = [];
    }
  };
  for (const line of lines) {
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) { listBuf.push(bullet[1]); continue; }
    flushList();
    if (!line.trim()) { out.push(<div key={`sp-${out.length}`} style={{ height: 6 }} />); continue; }
    out.push(<div key={out.length}>{renderInline(line)}</div>);
  }
  flushList();
  return out;
}

const SUGGESTIONS = [
  'Top 5 hook archetypes by ROAS for FBT',
  'Which SKUs have the highest hook rates?',
  'Show me UGC ads with ROAS above 4',
  'What attributes consistently hurt ROAS?',
];

export default function AskAnything() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setMessages(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30))); } catch {}
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setInput('');
    setError(null);
    const next: Message[] = [...messages, { role: 'user', content }];
    setMessages(next);
    setBusy(true);
    try {
      const r = await fetch('/ama-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
      setMessages([...next, { role: 'assistant', content: data.text }]);
    } catch (e: unknown) {
      setError((e as Error).message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    setMessages([]);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }

  return (
    <>
      <button
        className={`ama-fab ${open ? 'ama-fab-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label="Ask me anything"
      >
        {open ? '✕' : 'Ask'}
      </button>

      <div className={`ama-drawer ${open ? 'ama-drawer-open' : ''}`} aria-hidden={!open}>
        <div className="ama-header">
          <div>
            <div className="ama-title">Ask me anything</div>
            <div className="ama-sub">Grounded in your library data</div>
          </div>
          <div className="ama-header-actions">
            {messages.length > 0 && (
              <button className="ama-icon-btn" onClick={clear} title="Clear chat">⟲</button>
            )}
            <button className="ama-icon-btn" onClick={() => setOpen(false)} title="Close">✕</button>
          </div>
        </div>

        <div className="ama-scroll" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="ama-welcome">
              <div className="ama-welcome-title">What do you want to know?</div>
              <div className="ama-suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="ama-suggestion" onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => {
            if (m.role === 'user') {
              return (
                <div key={i} className="ama-msg ama-msg-user">
                  <div className="ama-bubble">{m.content}</div>
                </div>
              );
            }
            const { body, chart } = extractChart(m.content);
            const conf = confidenceFrom(body);
            const clean = stripConfidence(body);
            return (
              <div key={i} className="ama-msg ama-msg-asst">
                <div className="ama-bubble">
                  <div className="ama-md">{renderMarkdownLite(clean)}</div>
                  {chart && <BarChart spec={chart} />}
                  {conf && <div className={`ama-conf ama-conf-${conf}`}>Confidence: {conf}</div>}
                </div>
              </div>
            );
          })}
          {busy && (
            <div className="ama-msg ama-msg-asst">
              <div className="ama-bubble ama-thinking">
                <span className="ama-dot" />
                <span className="ama-dot" />
                <span className="ama-dot" />
              </div>
            </div>
          )}
          {error && <div className="ama-error">Error: {error}</div>}
        </div>

        <form
          className="ama-input"
          onSubmit={(e) => { e.preventDefault(); send(); }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about creatives, performance, patterns…"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={busy}
          />
          <button type="submit" disabled={busy || !input.trim()}>Send</button>
        </form>
      </div>
    </>
  );
}
