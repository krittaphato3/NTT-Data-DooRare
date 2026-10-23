export * from './pharmacist.tools.js';
export * from './er.tools.js';

import {
  getStockAndAlertsTool,
  getForecastTrendsTool,
  getRankedLenderLadderTool,
  draftLenderCommunicationTool,
  interpretLenderResponseTool,
  getNearExpiryPoolStatusTool,
  submitPharmacistProposalTool,
} from './pharmacist.tools.js';

import {
  getAntidoteLocatorTool,
  getIncidentKitRecommendationsTool,
  draftEmergencyIncidentTool,
  trackUrgentDispatchEtaTool,
  submitErActionProposalTool,
} from './er.tools.js';

/**
 * All 12 clinical and emergency domain tools assigned to Person 3.
 */
export const clinicalTools = [
  // Pharmacist Tools (7)
  getStockAndAlertsTool,
  getForecastTrendsTool,
  getRankedLenderLadderTool,
  draftLenderCommunicationTool,
  interpretLenderResponseTool,
  getNearExpiryPoolStatusTool,
  submitPharmacistProposalTool,

  // ER Staff Tools (5)
  getAntidoteLocatorTool,
  getIncidentKitRecommendationsTool,
  draftEmergencyIncidentTool,
  trackUrgentDispatchEtaTool,
  submitErActionProposalTool,
] as const;
