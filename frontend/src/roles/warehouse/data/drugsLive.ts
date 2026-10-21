/** Maps `GET /hospital-drugs` onto the DrugRow the warehouse drug screen renders. */
import type { ApiHospitalDrug } from '../../../services/catalogApi';
import type { DrugRow } from './drugs';

export function hospitalDrugToRow(d: ApiHospitalDrug): DrugRow {
  const m = d.master;
  const map = d.mapping;
  return {
    localCode: d.localCode,
    localName: d.localName,
    unit: d.localUnit,
    price: d.price ?? 0,
    ved: d.ved,
    abc: d.abc ?? '–',
    tmtId: d.tmtId ?? '',
    gpId: d.gpId ?? '',
    master: m
      ? {
          type: m.type,
          name: m.genericName,
          strength: m.strength ?? '',
          form: m.dosageForm ?? '',
          baseUnit: m.baseUnit,
          cold: m.coldChain,
          blood: m.blood,
          highAlert: m.highAlert,
          emergency: m.emergencyClass,
          internalCode: m.internalCode ?? '',
        }
      : null,
    mapping: map
      ? {
          status: map.status === 'DEPRECATED' ? 'REJECTED' : map.confidence !== null && map.confidence < 0.7 && map.status !== 'VERIFIED' ? 'LOW_CONFIDENCE' : map.status,
          method: map.method,
          confidence: map.confidence,
          factor: map.factor,
          packUnit: map.packUnit ?? '',
          basePerPack: map.basePerPack,
          manufacturer: map.manufacturer ?? '',
          suggestedBy: map.suggestedBy,
          verifiedAt: map.verifiedAt ?? '',
        }
      : null,
    candidates: [],
  };
}
