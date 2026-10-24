import { warehouseTools } from './warehouse.tools.js';
import { driverTools } from './driver.tools.js';
import { procurementTools } from './procurement.tools.js';

export * from './warehouse.tools.js';
export * from './driver.tools.js';
export * from './procurement.tools.js';
export * from './logistics.utils.js';

/**
 * Person 4: Logistics & Operations Tools (15 tools)
 * - 5 Warehouse Officer tools
 * - 5 Driver tools
 * - 5 Procurement Officer tools
 */
export const logisticsTools = [
  ...warehouseTools,
  ...driverTools,
  ...procurementTools,
] as const;
