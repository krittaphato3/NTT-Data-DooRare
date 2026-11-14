import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stageTools } from '../src/modules/ai/tools/selector.js';
import type { ToolDefinition } from '../src/modules/ai/providers/types.js';

const tool = (name: string, description: string): ToolDefinition =>
  ({ name, description, parameters: { type: 'object', properties: {} } }) as ToolDefinition;

const PHARMACIST_TOOLS: ToolDefinition[] = [
  tool('get_stock_and_alerts', 'Reads stock levels and active stock alerts for the hospital.'),
  tool('get_forecast_trends', 'Returns the demand forecast trend per drug.'),
  tool('get_reorder_recommendation_list', 'Lists drugs below ROP with recommended order quantities.'),
  tool('get_near_expiry_pool_status', 'Near-expiry pool lots available for lending.'),
  tool('get_ranked_lender_ladder', 'Ranks hospitals that could lend the drug.'),
  tool('get_incident_kit_recommendations', 'Suggests kits for an emergency incident.'),
  tool('get_assigned_trip_manifest', 'Shows the manifest of an assigned delivery trip.'),
  tool('draft_lender_communication', 'Drafts a message to a lender hospital.'),
  tool('analyze_borrow_vs_purchase_cost', 'Compares borrowing a drug against purchasing it.'),
  tool('interpret_lender_response', 'Interprets a lender hospital reply into a borrow decision.'),
  tool('draft_rfq_purchase_order', 'Drafts an RFQ or purchase order for a supplier.'),
  tool('verify_batch_barcode', 'Verifies a batch barcode.'),
  tool('submit_pharmacist_proposal', 'Submits a HITL proposal card for the pharmacist.'),
  tool('submit_er_action_proposal', 'Submits a HITL proposal card for an emergency action.'),
  tool('ask_operator', 'Asks the operator a question with clickable choices.'),
  tool('web_search', 'Searches the public web.'),
];

test('staging: a stock question sends stock tools and drops unrelated ones', () => {
  const result = stageTools(PHARMACIST_TOOLS, { query: 'สต็อกยาตัวไหนใกล้ถึงจุด ROP', pageTitle: 'Stock Alerts' });
  assert.equal(result.staged, true);
  assert.ok(result.names.includes('get_stock_and_alerts'));
  assert.ok(result.names.includes('get_reorder_recommendation_list'));
  assert.ok(!result.names.includes('get_assigned_trip_manifest'));
  assert.ok(!result.names.includes('draft_rfq_purchase_order'));
  assert.ok(result.tools.length < PHARMACIST_TOOLS.length);
});

test('staging: a borrow question leans on lender and borrow tools', () => {
  const result = stageTools(PHARMACIST_TOOLS, { query: 'ขอคำขอยืมยาจากโรงพยาบาลข้างเคียง', pageTitle: 'Borrow Requests' });
  assert.ok(result.names.includes('get_ranked_lender_ladder'));
  assert.ok(result.names.includes('draft_lender_communication'));
  assert.ok(!result.names.includes('get_forecast_trends'));
});

test('staging: a vague message keeps the full list instead of guessing', () => {
  const result = stageTools(PHARMACIST_TOOLS, { query: 'ช่วยหน่อย' });
  assert.equal(result.staged, false);
  assert.equal(result.tools.length, PHARMACIST_TOOLS.length);
});

test('staging: a tool named by the operator is always offered', () => {
  const result = stageTools(PHARMACIST_TOOLS, { query: 'เรียก web_search ให้ดูแนวทางกระทรวง' });
  assert.ok(result.names.includes('web_search'));
});

test('staging: the role\'s own HITL proposal tool is never staged away', () => {
  const result = stageTools(PHARMACIST_TOOLS, {
    query: 'สต็อกยาตัวไหนใกล้ถึงจุด ROP',
    pageTitle: 'Stock Alerts',
    role: 'PHARMACIST',
  });
  assert.ok(result.names.includes('submit_pharmacist_proposal'));
});

test('staging: ask_operator is never staged away', () => {
  const result = stageTools(PHARMACIST_TOOLS, { query: 'สต็อกยาตัวไหนใกล้ถึงจุด ROP', role: 'PHARMACIST' });
  assert.ok(result.names.includes('ask_operator'));
});

test('staging: another role\'s proposal tool is not pinned', () => {
  const result = stageTools(PHARMACIST_TOOLS, { query: 'สต็อกยาตัวไหนใกล้ถึงจุด ROP', role: 'PHARMACIST' });
  assert.ok(!result.names.includes('submit_er_action_proposal'));
});

test('staging: respects the cap', () => {
  const result = stageTools(PHARMACIST_TOOLS, {
    query: 'สต็อก ยืม เหตุฉุกเฉิน ขนส่ง จัดสรร จัดซื้อ audit',
    maxTools: 5,
  });
  assert.equal(result.staged, true);
  assert.equal(result.tools.length, 5);
});

test('staging: AI_TOOL_STAGING=off restores the full list', () => {
  const previous = process.env.AI_TOOL_STAGING;
  process.env.AI_TOOL_STAGING = 'off';
  try {
    const result = stageTools(PHARMACIST_TOOLS, { query: 'สต็อกยาตัวไหนใกล้ถึงจุด ROP' });
    assert.equal(result.staged, false);
    assert.equal(result.tools.length, PHARMACIST_TOOLS.length);
  } finally {
    if (previous === undefined) delete process.env.AI_TOOL_STAGING;
    else process.env.AI_TOOL_STAGING = previous;
  }
});
