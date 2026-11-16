import React, { useState } from 'react';

/**
 * Human-friendly clinical purpose titles for AI tool executions.
 * Normalizes developer tool names into clear, intuitive operational purposes.
 */
export const TOOL_PURPOSE_TITLES: Record<string, string> = {
  // Clinical & Pharmacy
  get_stock_and_alerts: 'ตรวจสอบสต็อกและการแจ้งเตือน (Check Stocks & Alerts)',
  get_stock_levels: 'ตรวจสอบยอดคงคลังเวชภัณฑ์ (Check Current Stock Levels)',
  get_forecast_trends: 'วิเคราะห์แนวโน้มการใช้ยาและแบบจำลองพยากรณ์ (Analyze Demand & Forecast Trends)',
  get_ranked_lender_ladder: 'จัดลำดับโรงพยาบาลที่สามารถยืมยาได้ (Rank Lender Hospitals)',
  calculate_borrow_ladder: 'จัดลำดับโรงพยาบาลที่สามารถยืมยาได้ (Rank Lender Hospitals)',
  draft_lender_communication: 'ร่างข้อความประสานขอยืมยากับโรงพยาบาล (Draft Borrow Request Message)',
  interpret_lender_response: 'ประมวลผลคำตอบรับ/ปฏิเสธจากโรงพยาบาล (Interpret Lender Response)',
  get_near_expiry_pool_status: 'ตรวจสอบสถานะยาใกล้หมดอายุและคลังกลาง (Check Near-Expiry Pool Status)',
  get_near_expiry_items: 'ตรวจสอบรายการยาใกล้หมดอายุ (Check Near-Expiry Items)',
  get_demand_candidates: 'ตรวจสอบความต้องการใช้ยาจริงก่อนหมดอายุ (Check Demand Candidates)',
  submit_pharmacist_proposal: 'ร่างใบเสนอความเห็นขอยืมยาระหว่างโรงพยาบาล (Create Borrow Proposal)',
  submit_borrow_request_proposal: 'ร่างใบเสนอความเห็นขอยืมยาระหว่างโรงพยาบาล (Create Borrow Proposal)',
  submit_allocation_proposal: 'ร่างแผนจัดสรรยาคลังกลางระดับเขต (Create Central Allocation Plan)',

  // Emergency & Disaster
  get_antidote_locator: 'ค้นหาพิกัดและสำรองยาต้านพิษเร่งด่วน (Locate Emergency Antidotes)',
  get_incident_kit_recommendations: 'ประเมินชุดยาและเวชภัณฑ์รับมือสาธารณภัย (Assess Emergency Kit Needs)',
  draft_emergency_incident: 'ร่างประกาศสถานการณ์ฉุกเฉินและรายงานเบื้องต้น (Draft Incident Declaration)',
  track_urgent_dispatch_eta: 'ติดตามเวลาและสถานะการจัดส่งเวชภัณฑ์ฉุกเฉิน (Track Urgent Dispatch ETA)',
  submit_er_action_proposal: 'ร่างคำสั่งระดมทรัพยากรและเวชภัณฑ์ฉุกเฉิน (Create Emergency Response Order)',
  get_active_incidents: 'ตรวจสอบเหตุการณ์สาธารณภัยและภาวะฉุกเฉิน (Check Active Incidents)',

  // Warehouse & Cold-chain
  get_fefo_pick_list: 'จัดลำดับรายการเบิกยาตามหลัก FEFO (Generate FEFO Pick List)',
  check_cold_chain_compliance: 'ตรวจสอบมาตรฐานห่วงโซ่ความเย็น (Check Cold Chain Compliance)',
  check_transport_feasibility: 'ประเมินเส้นทางและต้นทุนขนส่งห่วงโซ่ความเย็น (Check Transport Feasibility)',
  get_kit_packing_checklist: 'ตรวจสอบรายการจัดชุดเวชภัณฑ์ฉุกเฉิน (Check Kit Packing List)',
  verify_batch_barcode: 'ตรวจสอบบาร์โค้ดเวชภัณฑ์ GS1-128 (Verify Batch Barcode)',
  verifyBatchBarcodeTool: 'ตรวจสอบบาร์โค้ดเวชภัณฑ์ GS1-128 (Verify Batch Barcode)',
  submit_warehouse_confirmation_proposal: 'สร้างเอกสารยืนยันการรับเข้า/เบิกจ่ายคลัง (Create Warehouse Confirmation)',

  // Transport & Logistics
  get_assigned_trip_manifest: 'ตรวจสอบใบกำกับการเดินทางขนส่ง (Check Trip Manifest)',
  report_traffic_delay_voice: 'บันทึกรายงานการจราจรและความล่าช้า (Report Traffic Delay)',
  log_transit_temperature_alert: 'บันทึกแจ้งเตือนอุณหภูมิระหว่างขนส่ง (Log In-Transit Temperature Alert)',
  find_emergency_cold_storage_refuge: 'ค้นหาจุดสำรองคลังเย็นฉุกเฉินระหว่างทาง (Find Cold Storage Refuge)',
  submit_driver_status_proposal: 'สร้างรายงานสถานะการขนส่งและจัดส่งสำเร็จ (Submit Transport Status Report)',

  // Procurement & Finance
  get_reorder_recommendation_list: 'ประเมินรายการยาที่ถึงจุดสั่งซื้อใหม่ (Check Reorder Recommendations)',
  get_vendor_contract_terms: 'ตรวจสอบเงื่อนไขสัญญาจัดซื้อกับผู้จำหน่าย (Check Vendor Contract Terms)',
  analyze_borrow_vs_purchase_cost: 'วิเคราะห์เปรียบเทียบต้นทุนยืมยาเทียบกับการจัดซื้อ (Analyze Borrow vs Purchase Cost)',
  draft_rfq_purchase_order: 'ร่างใบขอราคาและใบสั่งซื้อเวชภัณฑ์ (Draft Purchase Order / RFQ)',
  submit_procurement_proposal: 'สร้างใบขออนุมัติการจัดซื้อเวชภัณฑ์ (Create Procurement Proposal)',

  // Regional Governance & Analytics
  get_hospital_kpi_dashboard: 'ตรวจสอบตัวชี้วัดประสิทธิภาพโรงพยาบาล (Check Hospital KPI Dashboard)',
  get_waiver_impact_analysis: 'วิเคราะห์ผลกระทบการขอยกเว้นการคืนยา (Analyze Loan Waiver Impact)',
  audit_hospital_anomalies: 'ตรวจสอบความผิดปกติและข้อสังเกตของโรงพยาบาล (Audit Hospital Anomalies)',
  submit_hospital_admin_proposal: 'สร้างข้อเสนอการบริหารระดับโรงพยาบาล (Create Hospital Admin Proposal)',
  get_regional_stock_heatmap: 'ตรวจสอบแผนที่ความหนาแน่นสต็อกระดับเขต (Check Regional Stock Heatmap)',
  get_regional_surge_signals: 'ตรวจจับสัญญาณความต้องการยาพุ่งสูงในเขต (Detect Regional Surge Signals)',
  simulate_pool_allocation: 'จำลองแผนจัดสรรยาคลังกลางระดับเขต (Simulate Pool Allocation Plan)',
  get_regional_directives: 'ตรวจสอบข้อสั่งการและนโยบายระดับเขต (Check Regional Directives)',
  submit_region_admin_proposal: 'สร้างคำสั่งจัดสรรยาคลังกลางระดับเขต (Create Regional Allocation Plan)',

  // Data & Master Catalog
  get_unmapped_catalog_items: 'ตรวจสอบรายการยาที่ยังไม่เชื่อมโยงรหัสกลาง (Check Unmapped Catalog Items)',
  get_mapping_suggestions: 'ประเมินรหัสยามาตรฐานที่แนะนำ (Suggest Standard Drug Mappings)',
  audit_ved_classifications: 'ตรวจสอบการจัดกลุ่มความสำคัญยา VED (Audit VED Classifications)',
  submit_data_admin_proposal: 'สร้างคำขอปรับปรุงฐานข้อมูลเวชภัณฑ์ (Create Master Data Proposal)',

  // Auditing & Compliance
  inspect_agent_run_provenance: 'ตรวจสอบที่มาและขั้นตอนการทำงานของ AI (Inspect AI Run Provenance)',
  inspect_narcotics_chain_of_custody: 'ตรวจสอบสายการครอบครองวัตถุเสพติด (Inspect Controlled Drugs Custody)',
  verify_tamper_evidence: 'ตรวจสอบหลักฐานการดัดแปลงข้อมูล (Verify Anti-Tamper Evidence)',
  submit_auditor_finding_proposal: 'สร้างรายงานข้อตรวจพบของผู้ตรวจสอบ (Create Audit Finding Report)',
  verify_audit_chain_integrity: 'ตรวจสอบความสมบูรณ์ของบันทึกธุรกรรม (Verify Audit Trail Integrity)',

  // System Administration & Health
  get_llm_health_metrics: 'ตรวจสอบสถานะและประสิทธิภาพระบบ AI (Check AI Health & Latency)',
  test_llm_connectivity: 'ทดสอบการเชื่อมต่อโมเดล AI (Test AI Model Connectivity)',
  get_system_configuration_status: 'ตรวจสอบการตั้งค่าระบบ (Check System Configuration)',
  submit_system_admin_proposal: 'สร้างข้อเสนอปรับแต่งการตั้งค่าระบบ (Create System Config Proposal)',

  // Interactive & Reference
  ask_operator: 'ขอข้อมูลเพิ่มเติมจากผู้ใช้งาน (Request Clarification)',
  web_search: 'สืบค้นแนวทางเวชปฏิบัติและเอกสารวิชาการ (Search Medical Guidelines)',
  web_fetch: 'เรียกดูเอกสารอ้างอิงทางการแพทย์ (Fetch Medical Reference)',
  ping_system: 'ทดสอบการทำงานของระบบ (Ping System Health)',
  submit_sample_action_proposal: 'สร้างร่างข้อเสนอตัวอย่าง (Create Sample Proposal)',
};

/**
 * Converts any unmapped or dynamic tool name from snake_case / camelCase into an intuitive action title.
 */
export function formatToolPurpose(toolName: string): string {
  if (TOOL_PURPOSE_TITLES[toolName]) {
    return TOOL_PURPOSE_TITLES[toolName];
  }

  // Fallback: convert camelCase or snake_case to Title Case words
  const words = toolName
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim()
    .split(/\s+/);

  const capitalized = words
    .map((w, idx) => {
      const lower = w.toLowerCase();
      if (idx === 0) {
        if (lower === 'get') return 'Check';
        if (lower === 'fetch') return 'Lookup';
        if (lower === 'submit') return 'Submit';
        if (lower === 'draft') return 'Draft';
        if (lower === 'verify') return 'Verify';
        if (lower === 'audit') return 'Audit';
        if (lower === 'inspect') return 'Inspect';
      }
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');

  return capitalized;
}

const PARAM_LABELS_TH: Record<string, string> = {
  drugCode: 'รหัสยา',
  drugMasterId: 'รหัสยา',
  drugName: 'ชื่อยา',
  quantityNeeded: 'จำนวนที่ต้องการ',
  quantity: 'จำนวน',
  urgency: 'ความเร่งด่วน',
  hospitalId: 'โรงพยาบาล',
  targetHospitalId: 'โรงพยาบาลปลายทาง',
  lenderHospitalId: 'โรงพยาบาลผู้ให้ยืม',
  incidentId: 'รหัสเหตุการณ์',
  barcode: 'บาร์โค้ด',
  reason: 'เหตุผล',
};

export interface ToolLogEntry {
  id: string;
  name: string;
  args?: Record<string, unknown>;
  status: 'running' | 'completed' | 'failed' | 'needs_input';
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
      .map(([k, v]) => {
        const label = PARAM_LABELS_TH[k] || k;
        let formattedVal = typeof v === 'object' ? '{...}' : String(v);
        if (typeof v === 'string') {
          formattedVal = formattedVal.length > 20 ? `"${formattedVal.slice(0, 18)}..."` : `"${formattedVal}"`;
        }
        return `${label}: ${formattedVal}`;
      })
      .join(', ');
  };

  const argsSummary = getArgsSummary();

  return (
    <div className={`doorare-tool-log-card ${tool.status}`}>
      {/* Header bar - Clickable to toggle expand */}
      <div
        className="doorare-tool-log-header"
        onClick={() => setIsExpanded((prev) => !prev)}
        title="คลิกเพื่อดูรายละเอียดและผลลัพธ์ของคำสั่ง"
      >
        <div className="doorare-tool-log-title-wrap">
          <span className="doorare-tool-icon">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          </span>
          <span className="doorare-tool-name" title={formatToolPurpose(tool.name)}>
            {formatToolPurpose(tool.name)}
          </span>
          {!isExpanded && argsSummary && (
            <span className="doorare-tool-args-preview">({argsSummary})</span>
          )}
        </div>

        <div className="doorare-tool-log-status-wrap">
          {tool.status === 'running' && (
            <span className="doorare-tool-badge running">
              <span className="doorare-tool-spinner-inline" />
              กำลังประมวลผล...
            </span>
          )}
          {tool.status === 'completed' && (
            <span className="doorare-tool-badge completed">
              ✓ สำเร็จ {tool.durationMs ? `${tool.durationMs}ms` : ''}
            </span>
          )}
          {tool.status === 'failed' && (
            <span className="doorare-tool-badge neutral">ไม่สามารถดำเนินการได้</span>
          )}
          {tool.status === 'needs_input' && (
            <span className="doorare-tool-badge needs-input">รอข้อมูล (Pending)</span>
          )}

          <span className="doorare-tool-chevron">{isExpanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="doorare-tool-log-body">
          {/* Input Parameters Section */}
          <div className="doorare-tool-section">
            <div className="doorare-tool-section-label">Input Parameters (Arguments):</div>
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
              Output / Observation (ผลลัพธ์จากระบบ):
            </div>
            {tool.status === 'running' ? (
              <div className="doorare-tool-running-placeholder">
                <span className="doorare-tool-spinner-inline" /> กำลังประมวลผลคำขอ...
              </div>
            ) : tool.status === 'needs_input' ? (
              <div className="doorare-tool-running-placeholder">
                ข้อมูลที่ส่งไปยังระบบยังไม่ครบ — Copilot ถามคำถามด้านล่างแล้ว
              </div>
            ) : tool.status === 'failed' ? (
              <div className="doorare-tool-running-placeholder">
                ระบบยังดำเนินการส่วนนี้ไม่สำเร็จในขณะนี้ — ลองอีกครั้ง หรือแจ้งผู้ดูแลระบบหากยังพบปัญหา
                {tool.error && (
                  <details className="doorare-tool-error-details">
                    <summary>ดูรายละเอียดทางเทคนิค</summary>
                    <pre className="doorare-tool-code-preview">
                      <code>{tool.error}</code>
                    </pre>
                  </details>
                )}
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
