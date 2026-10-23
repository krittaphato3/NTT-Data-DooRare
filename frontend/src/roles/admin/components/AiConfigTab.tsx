import { useEffect, useState } from 'react';
import { Icon } from '../../../components/common/icons';
import {
  getAiConfig,
  killSwitch,
  testAiConnection,
  updateAiConfig,
  type ApiAiConfig,
  type ApiAiProviderType,
} from '../../../services/adminApi';

interface AiConfigTabProps {
  onShowToast: (msg: string) => void;
}

const PROVIDERS: { id: ApiAiProviderType; name: string; desc: string; icon: any }[] = [
  {
    id: 'MOCK',
    name: 'Mock Simulation (Offline)',
    desc: 'จำลองการประมวลผลภายในระบบ ไม่คิดค่า Token เหมาะสำหรับการทดสอบ Local',
    icon: 'box',
  },
  {
    id: 'OPENAI',
    name: 'OpenAI (Direct API)',
    desc: 'เชื่อมต่อตรงไปยัง OpenAI API (GPT-4o, GPT-4o-mini) ด้วย API Key',
    icon: 'spark',
  },
  {
    id: 'ANTHROPIC',
    name: 'Anthropic (Claude Direct)',
    desc: 'เชื่อมต่อตรงไปยัง Anthropic Messages API (Claude 3.5 Sonnet / Haiku)',
    icon: 'sparkle',
  },
  {
    id: 'AWS_BEDROCK',
    name: 'Amazon Bedrock (AWS Cloud)',
    desc: 'ประมวลผลผ่าน AWS Bedrock Runtime (IAM Execution Role หรือ AWS Access Keys)',
    icon: 'layers',
  },
  {
    id: 'AZURE_OPENAI',
    name: 'Azure OpenAI Service',
    desc: 'เชื่อมต่อผ่าน Microsoft Azure Enterprise Endpoint และ Custom Deployment',
    icon: 'shield',
  },
  {
    id: 'CUSTOM',
    name: 'Custom API Endpoint (OpenAI-Compatible)',
    desc: 'เชื่อมต่อผ่าน Custom Base URL เช่น vLLM, Ollama, OpenRouter, LiteLLM หรือ Private Gateway',
    icon: 'gear',
  },
];

export function AiConfigTab({ onShowToast }: AiConfigTabProps) {
  const [config, setConfig] = useState<ApiAiConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [selectedProvider, setSelectedProvider] = useState<ApiAiProviderType>('MOCK');
  const [modelPrimary, setModelPrimary] = useState('');
  const [modelFast, setModelFast] = useState('');
  const [monthlyBudget, setMonthlyBudget] = useState(100);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [awsRegion, setAwsRegion] = useState('ap-southeast-1');
  const [awsAccessKey, setAwsAccessKey] = useState('');
  const [awsSecretKey, setAwsSecretKey] = useState('');
  const [azureEndpoint, setAzureEndpoint] = useState('');
  const [azureDeployment, setAzureDeployment] = useState('');
  const [customEndpoint, setCustomEndpoint] = useState('');
  const [customApiPath, setCustomApiPath] = useState('/chat/completions');
  const [isCustomPathInput, setIsCustomPathInput] = useState(false);

  // Modals & Action states
  const [isSaving, setIsSaving] = useState(false);
  const [saveReason, setSaveReason] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);

  // Test connection state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    latencyMs: number;
    message: string;
    modelId: string;
  } | null>(null);

  // Kill switch modal state
  const [isTogglingKillSwitch, setIsTogglingKillSwitch] = useState(false);
  const [killSwitchReason, setKillSwitchReason] = useState('');
  const [showKillSwitchModal, setShowKillSwitchModal] = useState(false);

  const loadConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getAiConfig();
      if (res.ok && res.data) {
        const c = res.data;
        setConfig(c);
        setSelectedProvider(c.provider);
        setModelPrimary(c.modelPrimary);
        setModelFast(c.modelFast);
        setMonthlyBudget(c.monthlyBudgetUsd);
        setApiKey(c.credentials.apiKeyMasked || '');
        setAwsRegion(c.credentials.awsRegion || 'ap-southeast-1');
        setAwsAccessKey(c.credentials.awsAccessKeyIdMasked || '');
        setAzureEndpoint(c.credentials.azureEndpoint || '');
        setAzureDeployment(c.credentials.azureDeploymentName || '');
        setCustomEndpoint(c.credentials.customEndpoint || '');
        setCustomApiPath(c.credentials.customApiPath || '/chat/completions');
        if (
          c.credentials.customApiPath &&
          !['/chat/completions', '/responses', '/v1/chat/completions', '/api/generate'].includes(
            c.credentials.customApiPath,
          )
        ) {
          setIsCustomPathInput(true);
        }
      }
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถโหลดการตั้งค่า AI ได้');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadConfig();
  }, []);

  const handleTestConnection = async () => {
    try {
      setIsTesting(true);
      setTestResult(null);
      const res = await testAiConnection({
        provider: selectedProvider,
        modelId: modelPrimary,
        credentials: {
          apiKey: apiKey && !apiKey.includes('...') ? apiKey : undefined,
          awsRegion,
          awsAccessKeyId: awsAccessKey && !awsAccessKey.includes('...') ? awsAccessKey : undefined,
          awsSecretAccessKey: awsSecretKey ? awsSecretKey : undefined,
          azureEndpoint,
          azureDeploymentName: azureDeployment,
          customEndpoint,
          customApiPath,
        },
      });
      setTestResult(res);
      if (res.success) {
        onShowToast(`เชื่อมต่อสำเร็จ (${res.latencyMs} ms)`);
      } else {
        onShowToast(`เชื่อมต่อล้มเหลว: ${res.message}`);
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        latencyMs: 0,
        message: err.message || 'Error executing connection test',
        modelId: modelPrimary,
      });
      onShowToast(`เกิดข้อผิดพลาด: ${err.message}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!saveReason.trim()) {
      onShowToast('กรุณาระบุเหตุผลในการบันทึกการตั้งค่า');
      return;
    }
    try {
      setIsSaving(true);
      const res = await updateAiConfig({
        provider: selectedProvider,
        modelPrimary,
        modelFast,
        monthlyBudgetUsd: Number(monthlyBudget),
        credentials: {
          apiKey: apiKey && !apiKey.includes('...') ? apiKey : undefined,
          awsRegion,
          awsAccessKeyId: awsAccessKey && !awsAccessKey.includes('...') ? awsAccessKey : undefined,
          awsSecretAccessKey: awsSecretKey ? awsSecretKey : undefined,
          azureEndpoint,
          azureDeploymentName: azureDeployment,
          customEndpoint,
          customApiPath,
        },
        reason: saveReason.trim(),
      });
      if (res.ok) {
        onShowToast('บันทึกการตั้งค่า Central BYOK เรียบร้อยแล้ว');
        setShowSaveModal(false);
        setSaveReason('');
        void loadConfig();
      }
    } catch (err: any) {
      onShowToast(`บันทึกไม่สำเร็จ: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleKillSwitch = async () => {
    if (!killSwitchReason.trim()) {
      onShowToast('กรุณาระบุเหตุผลในการสลับ Kill Switch');
      return;
    }
    try {
      setIsTogglingKillSwitch(true);
      const targetEnabled = !config?.agentEnabled;
      const res = await killSwitch({
        enabled: targetEnabled,
        reason: killSwitchReason.trim(),
      });
      if (res.ok) {
        onShowToast(
          targetEnabled
            ? 'เปิดการทำงานของ AI Agent เรียบร้อยแล้ว'
            : 'ปิดสวิตช์ฉุกเฉิน AI Agent ทั้งระบบ (Kill Switch Active)',
        );
        setShowKillSwitchModal(false);
        setKillSwitchReason('');
        void loadConfig();
      }
    } catch (err: any) {
      onShowToast(`เกิดข้อผิดพลาด: ${err.message}`);
    } finally {
      setIsTogglingKillSwitch(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-card" style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ color: '#64748B', fontSize: 15 }}>กำลังโหลดการตั้งค่า Central AI BYOK...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-card" style={{ padding: 30, borderLeft: '4px solid #EF4444' }}>
        <h3 style={{ color: '#DC2626', margin: '0 0 10px 0' }}>ไม่สามารถเปิดหน้าตั้งค่า AI ได้</h3>
        <p style={{ color: '#64748B' }}>{error}</p>
        <button
          type="button"
          className="admin-btn admin-btn-primary"
          style={{ marginTop: 12 }}
          onClick={() => void loadConfig()}
        >
          ลองใหม่อีกครั้ง
        </button>
      </div>
    );
  }

  const isAgentEnabled = config?.agentEnabled ?? true;

  return (
    <div className="admin-grid" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* 1. Global Kill-Switch Banner */}
      <div
        className="admin-card"
        style={{
          borderLeft: `5px solid ${isAgentEnabled ? '#10B981' : '#EF4444'}`,
          backgroundColor: isAgentEnabled ? '#F0FDF4' : '#FEF2F2',
          padding: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  backgroundColor: isAgentEnabled ? '#10B981' : '#EF4444',
                  display: 'inline-block',
                }}
              />
              <h3 style={{ margin: 0, fontSize: 17, color: isAgentEnabled ? '#065F46' : '#991B1B' }}>
                {isAgentEnabled ? 'AI Agent Status: ทำงานปกติ (Active)' : 'AI Agent Status: หยุดทำงานฉุกเฉิน (Kill Switch Active)'}
              </h3>
            </div>
            <p style={{ margin: '6px 0 0 0', fontSize: 13, color: isAgentEnabled ? '#047857' : '#B91C1C' }}>
              {isAgentEnabled
                ? 'ระบบ AI Agent และ Copilot ให้บริการปกติสำหรับทุกโรงพยาบาลในเครือข่าย'
                : 'คำสั่งประมวลผล Agent ทั้งหมดถูกระงับชั่วคราว ระบบกลับไปใช้แม่แบบ deterministic rule-based'}
            </p>
          </div>
          <button
            type="button"
            className={`admin-btn ${isAgentEnabled ? 'admin-btn-danger' : 'admin-btn-primary'}`}
            onClick={() => setShowKillSwitchModal(true)}
          >
            <Icon name="shield" style={{ width: 16, height: 16 }} />
            <span>{isAgentEnabled ? 'เปิด Kill Switch (หยุดระบบ AI ทั้งหมด)' : 'ยกเลิก Kill Switch (เปิดระบบ AI)'}</span>
          </button>
        </div>
      </div>

      {/* 2. Provider Selection Cards */}
      <div className="admin-card">
        <div style={{ borderBottom: '1px solid #E2E8F0', paddingBottom: 12, marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#1E293B' }}>
            1. เลือกผู้ให้บริการ AI ประจำเครือข่าย (Central LLM Provider)
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#64748B' }}>
            โรงพยาบาลในเครือข่ายไม่ต้องจัดการ API Key — System Admin เป็นผู้ดูแลและกำหนดนโยบายกลาง (Central BYOK)
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {PROVIDERS.map((p) => {
            const isSelected = selectedProvider === p.id;
            return (
              <div
                key={p.id}
                onClick={() => setSelectedProvider(p.id)}
                style={{
                  border: isSelected ? '2px solid #2563EB' : '1px solid #E2E8F0',
                  borderRadius: 8,
                  padding: 16,
                  cursor: 'pointer',
                  backgroundColor: isSelected ? '#EFF6FF' : '#FFFFFF',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                }}
              >
                {isSelected && (
                  <span
                    style={{
                      position: 'absolute',
                      top: 10,
                      right: 10,
                      backgroundColor: '#2563EB',
                      color: '#FFF',
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 12,
                    }}
                  >
                    ใช้งานอยู่ (Active)
                  </span>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <Icon name={p.icon as any} style={{ width: 20, height: 20, color: isSelected ? '#2563EB' : '#64748B' }} />
                  <span style={{ fontWeight: 600, fontSize: 14, color: isSelected ? '#1E40AF' : '#1E293B' }}>
                    {p.name}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: '#64748B', lineHeight: 1.4 }}>{p.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Models & Budget Configuration */}
      <div className="admin-card">
        <div style={{ borderBottom: '1px solid #E2E8F0', paddingBottom: 12, marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#1E293B' }}>
            2. กำหนดโมเดลและงบประมาณความปลอดภัย (Models & Budget Safety)
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
              Primary Complex Reasoning Model (โมเดลวิเคราะห์เชิงลึก / บันไดจัดสรรยา)
            </label>
            <input
              type="text"
              className="admin-input"
              value={modelPrimary}
              onChange={(e) => setModelPrimary(e.target.value)}
              placeholder="e.g. anthropic.claude-3-5-sonnet-20241022-v2:0 หรือ gpt-4o"
              style={{ width: '100%' }}
            />
            <span style={{ fontSize: 11, color: '#64748B' }}>
              ใช้สำหรับ F1 lender scoring, F2 near-expiry pool reallocations
            </span>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
              Fast Emergency Model (โมเดลฉุกเฉินตอบสนองเร็ว &lt; 8 วินาที)
            </label>
            <input
              type="text"
              className="admin-input"
              value={modelFast}
              onChange={(e) => setModelFast(e.target.value)}
              placeholder="e.g. anthropic.claude-3-5-haiku-20241022-v1:0 หรือ gpt-4o-mini"
              style={{ width: '100%' }}
            />
            <span style={{ fontSize: 11, color: '#64748B' }}>
              ใช้สำหรับ F3 ค้นหายาต้านพิษฉุกเฉิน (Antidotes) และ Incident Triage
            </span>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
              เพดานงบประมาณรายเดือน (Monthly Safety Budget - USD)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="number"
                className="admin-input"
                min={0}
                value={monthlyBudget}
                onChange={(e) => setMonthlyBudget(Number(e.target.value))}
                style={{ width: 140 }}
              />
              <span style={{ fontSize: 13, color: '#64748B' }}>USD / เดือน</span>
            </div>
            <span style={{ fontSize: 11, color: '#64748B' }}>
              เมื่อค่าใช้จ่ายถึงเพดาน ระบบจะแจ้งเตือนและตัดกลับสู่ Safe Templates
            </span>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
              ประมาณการใช้งานสะสมในเดือนนี้
            </label>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1E40AF', marginTop: 4 }}>
              ${config?.estimatedSpendUsd?.toFixed(2) || '0.00'} / ${monthlyBudget} USD
            </div>
            <div style={{ width: '100%', backgroundColor: '#E2E8F0', height: 6, borderRadius: 3, marginTop: 8 }}>
              <div
                style={{
                  width: `${Math.min(100, ((config?.estimatedSpendUsd || 0) / (monthlyBudget || 1)) * 100)}%`,
                  backgroundColor: '#2563EB',
                  height: '100%',
                  borderRadius: 3,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 4. Credentials Vault */}
      {selectedProvider !== 'MOCK' && (
        <div className="admin-card">
          <div style={{ borderBottom: '1px solid #E2E8F0', paddingBottom: 12, marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#1E293B' }}>
              3. ข้อมูลรับรองความปลอดภัย (Secure Credentials)
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#64748B' }}>
              ข้อมูลถูกเข้ารหัสจัดเก็บและกรองการแสดงผล (Masked) ห้ามเผยแพร่สู่เบราว์เซอร์
            </p>
          </div>

          {(selectedProvider === 'OPENAI' || selectedProvider === 'ANTHROPIC') && (
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                {selectedProvider === 'OPENAI' ? 'OpenAI API Key' : 'Anthropic API Key'}
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type={showKey ? 'text' : 'password'}
                  className="admin-input"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={selectedProvider === 'OPENAI' ? 'sk-...' : 'sk-ant-...'}
                  style={{ flex: 1, fontFamily: 'monospace' }}
                />
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? 'ซ่อน' : 'แสดง'}
                </button>
              </div>
            </div>
          )}

          {selectedProvider === 'AWS_BEDROCK' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                  AWS Region
                </label>
                <input
                  type="text"
                  className="admin-input"
                  value={awsRegion}
                  onChange={(e) => setAwsRegion(e.target.value)}
                  placeholder="ap-southeast-1"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                  AWS Access Key ID (ตัวเลือกเสริม หากไม่ได้ใช้ IAM Role)
                </label>
                <input
                  type="text"
                  className="admin-input"
                  value={awsAccessKey}
                  onChange={(e) => setAwsAccessKey(e.target.value)}
                  placeholder="AKIA..."
                  style={{ width: '100%', fontFamily: 'monospace' }}
                />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                  AWS Secret Access Key
                </label>
                <input
                  type="password"
                  className="admin-input"
                  value={awsSecretKey}
                  onChange={(e) => setAwsSecretKey(e.target.value)}
                  placeholder="••••••••••••••••"
                  style={{ width: '100%', fontFamily: 'monospace' }}
                />
              </div>
            </div>
          )}

          {selectedProvider === 'AZURE_OPENAI' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                  Azure OpenAI Endpoint
                </label>
                <input
                  type="text"
                  className="admin-input"
                  value={azureEndpoint}
                  onChange={(e) => setAzureEndpoint(e.target.value)}
                  placeholder="https://your-resource.openai.azure.com"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                  Deployment Name
                </label>
                <input
                  type="text"
                  className="admin-input"
                  value={azureDeployment}
                  onChange={(e) => setAzureDeployment(e.target.value)}
                  placeholder="e.g. gpt-4o-deployment"
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                  Azure API Key
                </label>
                <input
                  type="password"
                  className="admin-input"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Azure Secret Key"
                  style={{ width: '100%', fontFamily: 'monospace' }}
                />
              </div>
            </div>
          )}

          {selectedProvider === 'CUSTOM' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                  Custom API Base Endpoint URL *
                </label>
                <input
                  type="text"
                  className="admin-input"
                  value={customEndpoint}
                  onChange={(e) => setCustomEndpoint(e.target.value)}
                  placeholder="e.g. https://openrouter.ai/api/v1 หรือ http://localhost:11434/v1 หรือ http://your-gpu-server:8000"
                  style={{ width: '100%', fontFamily: 'monospace' }}
                />
                <span style={{ fontSize: 11, color: '#64748B' }}>
                  รองรับ vLLM, Ollama, OpenRouter, LiteLLM, LMStudio หรือ Custom Gateway ภายในองค์กร
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                  API Route Path Type (เลือกรูปแบบ Endpoint Path)
                </label>
                <select
                  className="admin-input"
                  style={{ width: '100%' }}
                  value={isCustomPathInput ? 'custom' : customApiPath}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'custom') {
                      setIsCustomPathInput(true);
                    } else {
                      setIsCustomPathInput(false);
                      setCustomApiPath(val);
                    }
                  }}
                >
                  <option value="/chat/completions">/chat/completions (OpenAI Chat Standard)</option>
                  <option value="/responses">/responses (Direct Response Endpoint)</option>
                  <option value="/v1/chat/completions">/v1/chat/completions (Full V1 Chat)</option>
                  <option value="/api/generate">/api/generate (Ollama / LLM Generate)</option>
                  <option value="custom">✏️ ระบุ Path อื่นๆ เอง (Custom Path...)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                  {isCustomPathInput ? 'ระบุ Custom Path เอง *' : 'Path ที่เลือกใช้งาน'}
                </label>
                <input
                  type="text"
                  className="admin-input"
                  value={customApiPath}
                  onChange={(e) => setCustomApiPath(e.target.value)}
                  placeholder="/chat/completions"
                  disabled={!isCustomPathInput}
                  style={{
                    width: '100%',
                    fontFamily: 'monospace',
                    backgroundColor: isCustomPathInput ? '#FFFFFF' : '#F1F5F9',
                  }}
                />
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <div
                  style={{
                    backgroundColor: '#F8FAFC',
                    border: '1px dashed #CBD5E1',
                    borderRadius: 6,
                    padding: '8px 12px',
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span style={{ fontWeight: 600, color: '#475569' }}>Target Request URL:</span>
                  <code style={{ color: '#2563EB', fontWeight: 600 }}>
                    {customEndpoint
                      ? `${customEndpoint.replace(/\/+$/, '')}/${customApiPath.replace(/^\/+/, '')}`
                      : '(โปรดระบุ Base Endpoint URL ด้านบน)'}
                  </code>
                </div>
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                  API Key / Bearer Authorization Token (ตัวเลือกเสริม หาก Endpoint ต้องใช้ยืนยันตัวตน)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type={showKey ? 'text' : 'password'}
                    className="admin-input"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-... หรือ Custom Token (เว้นว่างได้สำหรับ Local / Unauthenticated endpoints)"
                    style={{ flex: 1, fontFamily: 'monospace' }}
                  />
                  <button
                    type="button"
                    className="admin-btn admin-btn-secondary"
                    onClick={() => setShowKey(!showKey)}
                  >
                    {showKey ? 'ซ่อน' : 'แสดง'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. Live Test & Actions Toolbar */}
      <div
        className="admin-card"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
          backgroundColor: '#F8FAFC',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={handleTestConnection}
            disabled={isTesting}
          >
            <Icon name="activity" style={{ width: 16, height: 16 }} />
            <span>{isTesting ? 'กำลังทดสอบ...' : 'ทดสอบการเชื่อมต่อ (Test Connection)'}</span>
          </button>

          {testResult && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 14px',
                borderRadius: 20,
                fontSize: 13,
                fontWeight: 600,
                backgroundColor: testResult.success ? '#DCFCE7' : '#FEE2E2',
                color: testResult.success ? '#15803D' : '#B91C1C',
              }}
            >
              <span>{testResult.success ? '🟢 เชื่อมต่อสำเร็จ' : '🔴 เชื่อมต่อล้มเหลว'}</span>
              <span>({testResult.latencyMs} ms)</span>
              <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.85 }}>[{testResult.modelId}]</span>
            </div>
          )}
        </div>

        <button
          type="button"
          className="admin-btn admin-btn-primary"
          style={{ padding: '8px 24px', fontSize: 14 }}
          onClick={() => setShowSaveModal(true)}
        >
          <Icon name="check" style={{ width: 16, height: 16 }} />
          <span>บันทึกการตั้งค่า AI BYOK</span>
        </button>
      </div>

      {/* Save Modal */}
      {showSaveModal && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal-card" style={{ maxWidth: 480 }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 17, color: '#1E293B' }}>
              ยืนยันการบันทึกการตั้งค่า Central BYOK
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#64748B' }}>
              การเปลี่ยนแปลงนี้จะมีผลต่อโรงพยาบาลทุกแห่งในเครือข่าย กรุณาระบุเหตุผลเพื่อบันทึกประวัติการตรวจสอบ (Audit Log)
            </p>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
              เหตุผลในการปรับปรุง (Reason) *
            </label>
            <input
              type="text"
              className="admin-input"
              style={{ width: '100%', marginBottom: 20 }}
              value={saveReason}
              onChange={(e) => setSaveReason(e.target.value)}
              placeholder="e.g. ปรับใช้ OpenAI API Key สำหรับโครงการนำร่องเขต 6"
              autoFocus
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                onClick={() => setShowSaveModal(false)}
                disabled={isSaving}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                onClick={handleSaveConfig}
                disabled={isSaving}
              >
                {isSaving ? 'กำลังบันทึก...' : 'ยืนยันและบันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kill Switch Modal */}
      {showKillSwitchModal && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal-card" style={{ maxWidth: 480 }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 17, color: '#991B1B' }}>
              {isAgentEnabled ? 'สลับปิด Kill Switch ฉุกเฉิน' : 'สลับเปิดการทำงานของ AI Agent'}
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#64748B' }}>
              {isAgentEnabled
                ? 'ระบบจะตัดการเรียกประมวลผล AI Agent ทั้งหมดในทันที เหมาะสำหรับกรณีพบเหตุฉุกเฉินหรือค่าใช้จ่ายผิดปกติ'
                : 'เปิดใช้งาน Agent ทั่วระบบอีกครั้ง'}
            </p>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
              เหตุผลการสลับสวิตช์ (Reason) *
            </label>
            <input
              type="text"
              className="admin-input"
              style={{ width: '100%', marginBottom: 20 }}
              value={killSwitchReason}
              onChange={(e) => setKillSwitchReason(e.target.value)}
              placeholder="e.g. ตรวจสอบพบเหตุขัดข้องชั่วคราวจากผู้ให้บริการ"
              autoFocus
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                onClick={() => setShowKillSwitchModal(false)}
                disabled={isTogglingKillSwitch}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className={`admin-btn ${isAgentEnabled ? 'admin-btn-danger' : 'admin-btn-primary'}`}
                onClick={handleToggleKillSwitch}
                disabled={isTogglingKillSwitch}
              >
                {isTogglingKillSwitch ? 'กำลังดำเนินการ...' : 'ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
