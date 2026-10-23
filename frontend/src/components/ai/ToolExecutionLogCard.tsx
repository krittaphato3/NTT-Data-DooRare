import React, { useState } from 'react';

export interface ToolLogEntry {
  id: string;
  name: string;
  args?: Record<string, unknown>;
  status: 'running' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
  startTime: number;
  durationMs?: number;
}

interface ToolExecutionLogCardProps {
  tool: ToolLogEntry;
}

export const ToolExecutionLogCard: React.FC<ToolExecutionLogCardProps> = ({ tool }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const formatJson = (val: unknown): string => {
    try {
      if (typeof val === 'string') {
        return val;
      }
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val);
    }
  };

  // Extract a brief argument summary for the collapsed preview
  const getArgsSummary = (): string => {
    if (!tool.args || Object.keys(tool.args).length === 0) return '';
    const entries = Object.entries(tool.args);
    return entries
      .slice(0, 2)
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? '{...}' : JSON.stringify(v)}`)
      .join(', ');
  };

  const argsSummary = getArgsSummary();

  return (
    <div className={`doorare-tool-log-card ${tool.status}`}>
      {/* Header bar - Clickable to toggle expand */}
      <div
        className="doorare-tool-log-header"
        onClick={() => setIsExpanded((prev) => !prev)}
        title="คลิกเพื่อดูพารามิเตอร์และผลลัพธ์ของ Tool"
      >
        <div className="doorare-tool-log-title-wrap">
          <span className="doorare-tool-icon">🛠️</span>
          <span className="doorare-tool-name">{tool.name}</span>
          {!isExpanded && argsSummary && (
            <span className="doorare-tool-args-preview">({argsSummary})</span>
          )}
        </div>

        <div className="doorare-tool-log-status-wrap">
          {tool.status === 'running' && (
            <span className="doorare-tool-badge running">
              <span className="doorare-tool-spinner-inline" />
              กำลังรัน Tool...
            </span>
          )}
          {tool.status === 'completed' && (
            <span className="doorare-tool-badge completed">
              ✓ สำเร็จ {tool.durationMs ? `${tool.durationMs}ms` : ''}
            </span>
          )}
          {tool.status === 'failed' && (
            <span className="doorare-tool-badge failed">✕ ข้อผิดพลาด</span>
          )}

          <span className="doorare-tool-chevron">{isExpanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="doorare-tool-log-body">
          {/* Input Parameters Section */}
          <div className="doorare-tool-section">
            <div className="doorare-tool-section-label">📥 Input Parameters (Arguments):</div>
            <pre className="doorare-tool-code-preview">
              <code>
                {tool.args && Object.keys(tool.args).length > 0
                  ? formatJson(tool.args)
                  : '(ไม่มีพารามิเตอร์)'}
              </code>
            </pre>
          </div>

          {/* Output / Observation Section */}
          <div className="doorare-tool-section">
            <div className="doorare-tool-section-label">
              📤 Output / Observation (ผลลัพธ์จากระบบ):
            </div>
            {tool.status === 'running' ? (
              <div className="doorare-tool-running-placeholder">
                <span className="doorare-tool-spinner-inline" /> กำลังประมวลผลคำขอ...
              </div>
            ) : tool.error ? (
              <pre className="doorare-tool-code-preview error">
                <code>{tool.error}</code>
              </pre>
            ) : (
              <pre className="doorare-tool-code-preview success">
                <code>
                  {tool.result !== undefined ? formatJson(tool.result) : '(ดำเนินการสำเร็จ)'}
                </code>
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
