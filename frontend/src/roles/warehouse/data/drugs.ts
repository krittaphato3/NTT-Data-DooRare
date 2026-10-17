/**
 * Drug master + code mapping for hospital A (รพ.สมุทรปราการ), read-only for the warehouse officer.
 * Generated from db/mock/csv (hospital_drug + drug_mapping + drug_master + mapping_candidate + tmt_reference):
 * TMT ids / names are real, everything else (prices, units, confidences) is mock data. The warehouse
 * can only look: verifying a mapping, editing a drug or importing the HIS list belongs to the pharmacist.
 */

export type MappingStatus = 'VERIFIED' | 'SUGGESTED' | 'LOW_CONFIDENCE' | 'UNMATCHED' | 'REJECTED';
export type ItemType = 'DRUG' | 'SUPPLY' | 'BLOOD';

export interface MappingCandidate {
  tmt: string;
  name: string;
  score: number;
  parts: Record<string, number>;
}

export interface DrugRow {
  localCode: string;
  localName: string;
  unit: string;
  price: number;
  ved: 'V' | 'E' | 'D';
  abc: string;
  tmtId: string;
  gpId: string;
  /** Canonical drug_master row; null while the local item is not yet matched. */
  master: null | {
    type: ItemType;
    name: string;
    strength: string;
    form: string;
    baseUnit: string;
    cold: boolean;
    blood: boolean;
    highAlert: boolean;
    emergency: 'CRITICAL' | 'SUPPORTIVE';
    internalCode: string;
  };
  mapping: null | {
    status: MappingStatus;
    method: 'TMT' | 'CENTRAL_LIST';
    confidence: number | null;
    factor: number;
    packUnit: string;
    basePerPack: number | null;
    manufacturer: string;
    suggestedBy: string;
    verifiedAt: string;
  };
  candidates: MappingCandidate[];
}

export const MAPPING_META: Record<MappingStatus, { label: string; tone: string }> = {
  VERIFIED: { label: 'ยืนยันแล้ว', tone: 't-green' },
  SUGGESTED: { label: 'รอยืนยัน', tone: 't-amber' },
  LOW_CONFIDENCE: { label: 'มั่นใจต่ำ', tone: 't-orange' },
  UNMATCHED: { label: 'ยังไม่จับคู่', tone: 't-grey' },
  REJECTED: { label: 'ปฏิเสธ', tone: 't-red' },
};

export const TYPE_META: Record<ItemType, { label: string; tone: string }> = {
  DRUG: { label: 'ยา · TMT', tone: 't-blue' },
  SUPPLY: { label: 'เวชภัณฑ์ · รายการกลาง', tone: 't-teal' },
  BLOOD: { label: 'เลือด · รายการกลาง', tone: 't-red' },
};

export const DRUGS: DrugRow[] = [
 {
  "localCode": "A19366",
  "localName": "Paracetamol 500 mg tablet",
  "unit": "เม็ด",
  "price": 0.29,
  "ved": "E",
  "abc": "B",
  "tmtId": "276293",
  "gpId": "747132",
  "master": {
   "type": "DRUG",
   "name": "Paracetamol",
   "strength": "500 mg",
   "form": "tablet",
   "baseUnit": "เม็ด",
   "cold": false,
   "blood": false,
   "highAlert": false,
   "emergency": "SUPPORTIVE",
   "internalCode": ""
  },
  "mapping": {
   "status": "VERIFIED",
   "method": "TMT",
   "confidence": 0.973,
   "factor": 1.0,
   "packUnit": "กล่อง",
   "basePerPack": 1000.0,
   "manufacturer": "องค์การเภสัชกรรม (ตัวอย่าง)",
   "suggestedBy": "AGENT",
   "verifiedAt": "2016-09-21"
  },
  "candidates": []
 },
 {
  "localCode": "A72048",
  "localName": "Paracetamol 120 mg/5 mL syrup",
  "unit": "ขวด",
  "price": 10.1,
  "ved": "E",
  "abc": "C",
  "tmtId": "1131959",
  "gpId": "747533",
  "master": {
   "type": "DRUG",
   "name": "Paracetamol",
   "strength": "120 mg/5 mL",
   "form": "syrup",
   "baseUnit": "ขวด",
   "cold": false,
   "blood": false,
   "highAlert": false,
   "emergency": "SUPPORTIVE",
   "internalCode": ""
  },
  "mapping": {
   "status": "VERIFIED",
   "method": "TMT",
   "confidence": 0.98,
   "factor": 1.0,
   "packUnit": "ลัง",
   "basePerPack": 24.0,
   "manufacturer": "องค์การเภสัชกรรม (ตัวอย่าง)",
   "suggestedBy": "RULES",
   "verifiedAt": "2016-09-25"
  },
  "candidates": []
 },
 {
  "localCode": "A10433",
  "localName": "Amlodipine 5 mg tablet",
  "unit": "เม็ด",
  "price": 0.46,
  "ved": "E",
  "abc": "C",
  "tmtId": "108464",
  "gpId": "210476",
  "master": {
   "type": "DRUG",
   "name": "Amlodipine",
   "strength": "5 mg",
   "form": "tablet",
   "baseUnit": "เม็ด",
   "cold": false,
   "blood": false,
   "highAlert": false,
   "emergency": "SUPPORTIVE",
   "internalCode": ""
  },
  "mapping": {
   "status": "VERIFIED",
   "method": "TMT",
   "confidence": 0.964,
   "factor": 1.0,
   "packUnit": "กล่อง",
   "basePerPack": 2000.0,
   "manufacturer": "องค์การเภสัชกรรม (ตัวอย่าง)",
   "suggestedBy": "RULES",
   "verifiedAt": "2016-09-24"
  },
  "candidates": []
 },
 {
  "localCode": "A22303",
  "localName": "Metformin hydrochloride 500 mg tablet",
  "unit": "เม็ด",
  "price": 0.42,
  "ved": "E",
  "abc": "B",
  "tmtId": "231958",
  "gpId": "231927",
  "master": {
   "type": "DRUG",
   "name": "Metformin hydrochloride",
   "strength": "500 mg",
   "form": "tablet",
   "baseUnit": "เม็ด",
   "cold": false,
   "blood": false,
   "highAlert": false,
   "emergency": "SUPPORTIVE",
   "internalCode": ""
  },
  "mapping": {
   "status": "VERIFIED",
   "method": "TMT",
   "confidence": 0.969,
   "factor": 1.0,
   "packUnit": "กล่อง",
   "basePerPack": 1000.0,
   "manufacturer": "บริษัท ยาไทยเคมี จำกัด (ตัวอย่าง)",
   "suggestedBy": "RULES",
   "verifiedAt": "2016-09-18"
  },
  "candidates": []
 },
 {
  "localCode": "A85059",
  "localName": "Salbutamol 100 mcg/1 dose pressurised inhalation, suspension",
  "unit": "กระบอก",
  "price": 71.82,
  "ved": "V",
  "abc": "C",
  "tmtId": "1033701",
  "gpId": "666141",
  "master": {
   "type": "DRUG",
   "name": "Salbutamol",
   "strength": "100 mcg/1 dose",
   "form": "pressurised inhalation, suspension",
   "baseUnit": "กระบอก",
   "cold": false,
   "blood": false,
   "highAlert": false,
   "emergency": "SUPPORTIVE",
   "internalCode": ""
  },
  "mapping": {
   "status": "VERIFIED",
   "method": "TMT",
   "confidence": 0.956,
   "factor": 1.0,
   "packUnit": "กล่อง",
   "basePerPack": 2.0,
   "manufacturer": "บริษัท ยาไทยเคมี จำกัด (ตัวอย่าง)",
   "suggestedBy": "RULES",
   "verifiedAt": "2016-09-26"
  },
  "candidates": []
 },
 {
  "localCode": "A96965",
  "localName": "Salbutamol 2.5 mg/2.5 mL nebuliser solution",
  "unit": "หลอด",
  "price": 4.16,
  "ved": "V",
  "abc": "C",
  "tmtId": "1280793",
  "gpId": "848856",
  "master": {
   "type": "DRUG",
   "name": "Salbutamol",
   "strength": "2.5 mg/2.5 mL",
   "form": "nebuliser solution",
   "baseUnit": "หลอด",
   "cold": false,
   "blood": false,
   "highAlert": false,
   "emergency": "SUPPORTIVE",
   "internalCode": ""
  },
  "mapping": {
   "status": "VERIFIED",
   "method": "TMT",
   "confidence": 0.975,
   "factor": 1.0,
   "packUnit": "กล่อง",
   "basePerPack": 100.0,
   "manufacturer": "บริษัท เภสัชภัณฑ์ไทย จำกัด (ตัวอย่าง)",
   "suggestedBy": "RULES",
   "verifiedAt": "2016-09-28"
  },
  "candidates": []
 },
 {
  "localCode": "A73387",
  "localName": "Oseltamivir 75 mg capsule, hard",
  "unit": "แคปซูล",
  "price": 26.95,
  "ved": "E",
  "abc": "C",
  "tmtId": "1140548",
  "gpId": "339390",
  "master": {
   "type": "DRUG",
   "name": "Oseltamivir",
   "strength": "75 mg",
   "form": "capsule, hard",
   "baseUnit": "แคปซูล",
   "cold": false,
   "blood": false,
   "highAlert": false,
   "emergency": "SUPPORTIVE",
   "internalCode": ""
  },
  "mapping": {
   "status": "VERIFIED",
   "method": "TMT",
   "confidence": 0.993,
   "factor": 1.0,
   "packUnit": "กล่อง",
   "basePerPack": 100.0,
   "manufacturer": "บริษัท ยาไทยเคมี จำกัด (ตัวอย่าง)",
   "suggestedBy": "RULES",
   "verifiedAt": "2016-09-25"
  },
  "candidates": []
 },
 {
  "localCode": "A10712",
  "localName": "Favipiravir 200 mg film-coated tablet",
  "unit": "BOX",
  "price": 15.12,
  "ved": "E",
  "abc": "A",
  "tmtId": "1198224",
  "gpId": "1140915",
  "master": null,
  "mapping": {
   "status": "SUGGESTED",
   "method": "TMT",
   "confidence": 0.762,
   "factor": 1.0,
   "packUnit": "กล่อง",
   "basePerPack": null,
   "manufacturer": "บริษัท ยาไทยเคมี จำกัด (ตัวอย่าง)",
   "suggestedBy": "RULES",
   "verifiedAt": ""
  },
  "candidates": [
   {
    "tmt": "1140943",
    "name": "AVIGAN (TOYAMA CHEMICAL, JAPAN) (favipiravir 200 mg) film-coated tablet, 1 tablet",
    "score": 0.797,
    "parts": {
     "name": 0.399,
     "strength": 0.159,
     "form": 0.12,
     "unit": 0.0
    }
   },
   {
    "tmt": "1219055",
    "name": "ASMASAL SDU (อินเตอร์ ฟาร์มา) (salbutamol 2.5 mg/2.5 mL) nebuliser solution, 2.5 mL unit dose",
    "score": 0.48,
    "parts": {
     "name": 0.24,
     "strength": 0.096,
     "form": 0.072,
     "unit": 0.072
    }
   }
  ]
 },
 {
  "localCode": "A40428",
  "localName": "Remdesivir 100 mg concentrate for solution for infusion",
  "unit": "vial",
  "price": 2342.21,
  "ved": "V",
  "abc": "B",
  "tmtId": "1242096",
  "gpId": "1242065",
  "master": null,
  "mapping": {
   "status": "SUGGESTED",
   "method": "TMT",
   "confidence": 0.501,
   "factor": 1.0,
   "packUnit": "กล่อง",
   "basePerPack": 3.0,
   "manufacturer": "บริษัท เภสัชภัณฑ์ไทย จำกัด (ตัวอย่าง)",
   "suggestedBy": "RULES",
   "verifiedAt": ""
  },
  "candidates": [
   {
    "tmt": "1242096",
    "name": "REMDESIVIR-EVA PHARMA (EVA PHARMA FOR PHARMACEUTICALS & MEDICAL APPLIANCES, EGYPT) (remdesivir 100 mg) concentrate for solution for infusion, 20 mL vial",
    "score": 0.775,
    "parts": {
     "name": 0.388,
     "strength": 0.155,
     "form": 0.116,
     "unit": 0.116
    }
   },
   {
    "tmt": "276293",
    "name": "CEMOL (ฟาร์มาสันต์แล็บบอราตอรี่ส์) (paracetamol 500 mg) tablet, 1 tablet",
    "score": 0.448,
    "parts": {
     "name": 0.224,
     "strength": 0.09,
     "form": 0.067,
     "unit": 0.067
    }
   }
  ]
 },
 {
  "localCode": "A71794",
  "localName": "Dexamethasone 4 mg/1 mL solution for injection",
  "unit": "amp",
  "price": 4.46,
  "ved": "V",
  "abc": "C",
  "tmtId": "556415",
  "gpId": "555722",
  "master": {
   "type": "DRUG",
   "name": "Dexamethasone",
   "strength": "4 mg/1 mL",
   "form": "solution for injection",
   "baseUnit": "amp",
   "cold": false,
   "blood": false,
   "highAlert": false,
   "emergency": "SUPPORTIVE",
   "internalCode": ""
  },
  "mapping": {
   "status": "VERIFIED",
   "method": "TMT",
   "confidence": 0.946,
   "factor": 1.0,
   "packUnit": "กล่อง",
   "basePerPack": 50.0,
   "manufacturer": "องค์การเภสัชกรรม (ตัวอย่าง)",
   "suggestedBy": "RULES",
   "verifiedAt": "2016-09-26"
  },
  "candidates": []
 },
 {
  "localCode": "A60008",
  "localName": "Ceftriaxone 1 g powder for solution for injection/infusion",
  "unit": "vial",
  "price": 13.1,
  "ved": "V",
  "abc": "B",
  "tmtId": "548592",
  "gpId": "694507",
  "master": {
   "type": "DRUG",
   "name": "Ceftriaxone",
   "strength": "1 g",
   "form": "powder for solution for injection/infusion",
   "baseUnit": "vial",
   "cold": false,
   "blood": false,
   "highAlert": false,
   "emergency": "SUPPORTIVE",
   "internalCode": ""
  },
  "mapping": {
   "status": "VERIFIED",
   "method": "TMT",
   "confidence": 0.937,
   "factor": 1.0,
   "packUnit": "กล่อง",
   "basePerPack": 100.0,
   "manufacturer": "บริษัท เภสัชภัณฑ์ไทย จำกัด (ตัวอย่าง)",
   "suggestedBy": "AGENT",
   "verifiedAt": "2016-09-24"
  },
  "candidates": []
 },
 {
  "localCode": "A17084",
  "localName": "Doxycycline 100 mg capsule, hard",
  "unit": "แคปซูล",
  "price": 0.75,
  "ved": "E",
  "abc": "C",
  "tmtId": "412931",
  "gpId": "226408",
  "master": {
   "type": "DRUG",
   "name": "Doxycycline",
   "strength": "100 mg",
   "form": "capsule, hard",
   "baseUnit": "แคปซูล",
   "cold": false,
   "blood": false,
   "highAlert": false,
   "emergency": "SUPPORTIVE",
   "internalCode": ""
  },
  "mapping": {
   "status": "VERIFIED",
   "method": "TMT",
   "confidence": 0.937,
   "factor": 1.0,
   "packUnit": "กล่อง",
   "basePerPack": 1000.0,
   "manufacturer": "บริษัท ยาไทยเคมี จำกัด (ตัวอย่าง)",
   "suggestedBy": "AGENT",
   "verifiedAt": "2016-09-21"
  },
  "candidates": []
 },
 {
  "localCode": "A34240",
  "localName": "Sodium chloride 900 mg/100 mL (1000 mL) solution for infusion",
  "unit": "ถุง",
  "price": 19.75,
  "ved": "V",
  "abc": "A",
  "tmtId": "801477",
  "gpId": "698197",
  "master": {
   "type": "DRUG",
   "name": "Sodium chloride",
   "strength": "900 mg/100 mL (1000 mL)",
   "form": "solution for infusion",
   "baseUnit": "ถุง",
   "cold": false,
   "blood": false,
   "highAlert": false,
   "emergency": "SUPPORTIVE",
   "internalCode": ""
  },
  "mapping": {
   "status": "VERIFIED",
   "method": "TMT",
   "confidence": 0.94,
   "factor": 1.0,
   "packUnit": "กล่อง",
   "basePerPack": 24.0,
   "manufacturer": "บริษัท เภสัชภัณฑ์ไทย จำกัด (ตัวอย่าง)",
   "suggestedBy": "AGENT",
   "verifiedAt": "2016-09-24"
  },
  "candidates": []
 },
 {
  "localCode": "A87112",
  "localName": "Ringer's lactate 1000 mL solution for infusion",
  "unit": "ถุง",
  "price": 24.31,
  "ved": "V",
  "abc": "A",
  "tmtId": "578083",
  "gpId": "578054",
  "master": {
   "type": "DRUG",
   "name": "Ringer's lactate",
   "strength": "1000 mL",
   "form": "solution for infusion",
   "baseUnit": "ถุง",
   "cold": false,
   "blood": false,
   "highAlert": false,
   "emergency": "SUPPORTIVE",
   "internalCode": ""
  },
  "mapping": {
   "status": "VERIFIED",
   "method": "TMT",
   "confidence": 0.94,
   "factor": 1.0,
   "packUnit": "กล่อง",
   "basePerPack": 24.0,
   "manufacturer": "บริษัท เภสัชภัณฑ์ไทย จำกัด (ตัวอย่าง)",
   "suggestedBy": "RULES",
   "verifiedAt": "2016-09-24"
  },
  "candidates": []
 },
 {
  "localCode": "A44892",
  "localName": "Oral rehydration salts sachet oral powder",
  "unit": "ซอง",
  "price": 2.14,
  "ved": "E",
  "abc": "C",
  "tmtId": "707563",
  "gpId": "707563",
  "master": {
   "type": "DRUG",
   "name": "Oral rehydration salts",
   "strength": "sachet",
   "form": "oral powder",
   "baseUnit": "ซอง",
   "cold": false,
   "blood": false,
   "highAlert": false,
   "emergency": "SUPPORTIVE",
   "internalCode": ""
  },
  "mapping": {
   "status": "VERIFIED",
   "method": "TMT",
   "confidence": 0.975,
   "factor": 1.0,
   "packUnit": "กล่อง",
   "basePerPack": 100.0,
   "manufacturer": "บริษัท เภสัชภัณฑ์ไทย จำกัด (ตัวอย่าง)",
   "suggestedBy": "RULES",
   "verifiedAt": "2016-09-23"
  },
  "candidates": []
 },
 {
  "localCode": "A36192",
  "localName": "Epinephrine (adrenaline) 1 mg/1 mL solution for injection",
  "unit": "amp",
  "price": 7.65,
  "ved": "V",
  "abc": "C",
  "tmtId": "933784",
  "gpId": "810845",
  "master": {
   "type": "DRUG",
   "name": "Epinephrine (adrenaline)",
   "strength": "1 mg/1 mL",
   "form": "solution for injection",
   "baseUnit": "amp",
   "cold": false,
   "blood": false,
   "highAlert": true,
   "emergency": "CRITICAL",
   "internalCode": ""
  },
  "mapping": {
   "status": "VERIFIED",
   "method": "TMT",
   "confidence": 0.954,
   "factor": 1.0,
   "packUnit": "กล่อง",
   "basePerPack": 50.0,
   "manufacturer": "องค์การเภสัชกรรม (ตัวอย่าง)",
   "suggestedBy": "AGENT",
   "verifiedAt": "2016-09-21"
  },
  "candidates": []
 },
 {
  "localCode": "A26706",
  "localName": "Atropine sulfate 600 mcg/1 mL solution for injection",
  "unit": "amp",
  "price": 4.62,
  "ved": "V",
  "abc": "C",
  "tmtId": "811425",
  "gpId": "770061",
  "master": {
   "type": "DRUG",
   "name": "Atropine sulfate",
   "strength": "600 mcg/1 mL",
   "form": "solution for injection",
   "baseUnit": "amp",
   "cold": false,
   "blood": false,
   "highAlert": false,
   "emergency": "CRITICAL",
   "internalCode": ""
  },
  "mapping": {
   "status": "VERIFIED",
   "method": "TMT",
   "confidence": 0.983,
   "factor": 1.0,
   "packUnit": "กล่อง",
   "basePerPack": 200.0,
   "manufacturer": "บริษัท เภสัชภัณฑ์ไทย จำกัด (ตัวอย่าง)",
   "suggestedBy": "RULES",
   "verifiedAt": "2016-09-24"
  },
  "candidates": []
 },
 {
  "localCode": "A26284",
  "localName": "Tranexamic acid 250 mg/5 mL solution for injection",
  "unit": "amp",
  "price": 8.61,
  "ved": "V",
  "abc": "C",
  "tmtId": "675417",
  "gpId": "763354",
  "master": null,
  "mapping": {
   "status": "SUGGESTED",
   "method": "TMT",
   "confidence": 0.629,
   "factor": 1.0,
   "packUnit": "กล่อง",
   "basePerPack": null,
   "manufacturer": "บริษัท ยาไทยเคมี จำกัด (ตัวอย่าง)",
   "suggestedBy": "RULES",
   "verifiedAt": ""
  },
  "candidates": [
   {
    "tmt": "675417",
    "name": "TRANSAMIN (โอลิค) (tranexamic acid 250 mg/5 mL) solution for injection, 5 mL ampoule",
    "score": 0.76,
    "parts": {
     "name": 0.38,
     "strength": 0.152,
     "form": 0.114,
     "unit": 0.114
    }
   },
   {
    "tmt": "316324",
    "name": "DOCYL (ยูนีซัน) (doxycycline 100 mg) capsule, hard, 1 capsule",
    "score": 0.427,
    "parts": {
     "name": 0.213,
     "strength": 0.085,
     "form": 0.064,
     "unit": 0.064
    }
   }
  ]
 },
 {
  "localCode": "A55509",
  "localName": "Morphine sulfate 10 mg/1 mL solution for injection",
  "unit": "amp",
  "price": 14.51,
  "ved": "E",
  "abc": "C",
  "tmtId": "535924",
  "gpId": "535897",
  "master": {
   "type": "DRUG",
   "name": "Morphine sulfate",
   "strength": "10 mg/1 mL",
   "form": "solution for injection",
   "baseUnit": "amp",
   "cold": false,
   "blood": false,
   "highAlert": true,
   "emergency": "CRITICAL",
   "internalCode": ""
  },
  "mapping": {
   "status": "VERIFIED",
   "method": "TMT",
   "confidence": 0.974,
   "factor": 1.0,
   "packUnit": "กล่อง",
   "basePerPack": 100.0,
   "manufacturer": "บริษัท เภสัชภัณฑ์ไทย จำกัด (ตัวอย่าง)",
   "suggestedBy": "RULES",
   "verifiedAt": "2016-09-21"
  },
  "candidates": []
 },
 {
  "localCode": "A11517",
  "localName": "Fentanyl 100 mcg/2 mL solution for injection",
  "unit": "amp",
  "price": 26.68,
  "ved": "V",
  "abc": "C",
  "tmtId": "1121664",
  "gpId": "767330",
  "master": {
   "type": "DRUG",
   "name": "Fentanyl",
   "strength": "100 mcg/2 mL",
   "form": "solution for injection",
   "baseUnit": "amp",
   "cold": false,
   "blood": false,
   "highAlert": true,
   "emergency": "CRITICAL",
   "internalCode": ""
  },
  "mapping": {
   "status": "VERIFIED",
   "method": "TMT",
   "confidence": 0.98,
   "factor": 1.0,
   "packUnit": "กล่อง",
   "basePerPack": 50.0,
   "manufacturer": "องค์การเภสัชกรรม (ตัวอย่าง)",
   "suggestedBy": "RULES",
   "verifiedAt": "2016-09-23"
  },
  "candidates": []
 },
 {
  "localCode": "A79555",
  "localName": "Ketamine 500 mg/10 mL solution for injection",
  "unit": "vial",
  "price": 96.47,
  "ved": "V",
  "abc": "C",
  "tmtId": "1039433",
  "gpId": "533794",
  "master": {
   "type": "DRUG",
   "name": "Ketamine",
   "strength": "500 mg/10 mL",
   "form": "solution for injection",
   "baseUnit": "vial",
   "cold": false,
   "blood": false,
   "highAlert": true,
   "emergency": "CRITICAL",
   "internalCode": ""
  },
  "mapping": {
   "status": "VERIFIED",
   "method": "TMT",
   "confidence": 0.983,
   "factor": 1.0,
   "packUnit": "กล่อง",
   "basePerPack": 10.0,
   "manufacturer": "บริษัท ยาไทยเคมี จำกัด (ตัวอย่าง)",
   "suggestedBy": "RULES",
   "verifiedAt": "2016-09-28"
  },
  "candidates": []
 },
 {
  "localCode": "A74585",
  "localName": "Suxamethonium chloride (succinylcholine) 500 mg/10 mL solution for injection",
  "unit": "amp",
  "price": 96.94,
  "ved": "V",
  "abc": "C",
  "tmtId": "1336885",
  "gpId": "768789",
  "master": {
   "type": "DRUG",
   "name": "Suxamethonium chloride (succinylcholine)",
   "strength": "500 mg/10 mL",
   "form": "solution for injection",
   "baseUnit": "amp",
   "cold": true,
   "blood": false,
   "highAlert": true,
   "emergency": "CRITICAL",
   "internalCode": ""
  },
  "mapping": {
   "status": "VERIFIED",
   "method": "TMT",
   "confidence": 0.939,
   "factor": 1.0,
   "packUnit": "กล่อง",
   "basePerPack": 20.0,
   "manufacturer": "บริษัท ยาไทยเคมี จำกัด (ตัวอย่าง)",
   "suggestedBy": "RULES",
   "verifiedAt": "2016-09-20"
  },
  "candidates": []
 },
 {
  "localCode": "A93363",
  "localName": "Insulin human 100 iu/1 mL solution for injection",
  "unit": "vial",
  "price": 111.72,
  "ved": "V",
  "abc": "B",
  "tmtId": "1144603",
  "gpId": "654828",
  "master": null,
  "mapping": {
   "status": "UNMATCHED",
   "method": "TMT",
   "confidence": null,
   "factor": 1.0,
   "packUnit": "กล่อง",
   "basePerPack": 2.0,
   "manufacturer": "บริษัท ยาไทยเคมี จำกัด (ตัวอย่าง)",
   "suggestedBy": "RULES",
   "verifiedAt": ""
  },
  "candidates": [
   {
    "tmt": "663286",
    "name": "BIOSULIN R (M.J. BIOPHARM, INDIA) (insulin human 100 iu/1 mL) solution for injection, 3 mL cartridge",
    "score": 0.718,
    "parts": {
     "name": 0.359,
     "strength": 0.144,
     "form": 0.108,
     "unit": 0.108
    }
   },
   {
    "tmt": "762293",
    "name": "COBRA ANTIVENIN (สถานเสาวภา สภากาชาดไทย) (cobra antivenin 600 mcg/1 mL) powder and solvent for solution for injection, 10 mL vial",
    "score": 0.581,
    "parts": {
     "name": 0.29,
     "strength": 0.116,
     "form": 0.087,
     "unit": 0.087
    }
   }
  ]
 },
 {
  "localCode": "A62513",
  "localName": "Diphtheria + tetanus toxoids (dT) 2 iu + 20 iu/0.5 mL suspension for injection",
  "unit": "dose",
  "price": 17.23,
  "ved": "E",
  "abc": "C",
  "tmtId": "670632",
  "gpId": "670609",
  "master": {
   "type": "DRUG",
   "name": "Diphtheria + tetanus toxoids (dT)",
   "strength": "2 iu + 20 iu/0.5 mL",
   "form": "suspension for injection",
   "baseUnit": "dose",
   "cold": true,
   "blood": false,
   "highAlert": false,
   "emergency": "SUPPORTIVE",
   "internalCode": ""
  },
  "mapping": {
   "status": "VERIFIED",
   "method": "TMT",
   "confidence": 0.961,
   "factor": 1.0,
   "packUnit": "กล่อง",
   "basePerPack": 5.0,
   "manufacturer": "องค์การเภสัชกรรม (ตัวอย่าง)",
   "suggestedBy": "RULES",
   "verifiedAt": "2016-09-26"
  },
  "candidates": []
 },
 {
  "localCode": "A52195",
  "localName": "Influenza vaccine (quadrivalent) 0.5 mL suspension for injection",
  "unit": "dose",
  "price": 231.27,
  "ved": "E",
  "abc": "A",
  "tmtId": "1130359",
  "gpId": "1130328",
  "master": {
   "type": "DRUG",
   "name": "Influenza vaccine (quadrivalent)",
   "strength": "0.5 mL",
   "form": "suspension for injection",
   "baseUnit": "dose",
   "cold": true,
   "blood": false,
   "highAlert": false,
   "emergency": "SUPPORTIVE",
   "internalCode": ""
  },
  "mapping": {
   "status": "VERIFIED",
   "method": "TMT",
   "confidence": 0.944,
   "factor": 1.0,
   "packUnit": "กล่อง",
   "basePerPack": 10.0,
   "manufacturer": "องค์การเภสัชกรรม (ตัวอย่าง)",
   "suggestedBy": "AGENT",
   "verifiedAt": "2016-09-20"
  },
  "candidates": []
 },
 {
  "localCode": "A75080",
  "localName": "Purified duck embryo rabies vaccine 2.5 iu/1 mL solution for injection",
  "unit": "vial",
  "price": 232.8,
  "ved": "E",
  "abc": "C",
  "tmtId": "749256",
  "gpId": "749225",
  "master": {
   "type": "DRUG",
   "name": "Purified duck embryo rabies vaccine",
   "strength": "2.5 iu/1 mL",
   "form": "solution for injection",
   "baseUnit": "vial",
   "cold": true,
   "blood": false,
   "highAlert": false,
   "emergency": "SUPPORTIVE",
   "internalCode": ""
  },
  "mapping": {
   "status": "VERIFIED",
   "method": "TMT",
   "confidence": 0.934,
   "factor": 1.0,
   "packUnit": "กล่อง",
   "basePerPack": 20.0,
   "manufacturer": "บริษัท เภสัชภัณฑ์ไทย จำกัด (ตัวอย่าง)",
   "suggestedBy": "RULES",
   "verifiedAt": "2016-09-22"
  },
  "candidates": []
 },
 {
  "localCode": "A30834",
  "localName": "Equine rabies immunoglobulin 1000 iu/5 mL solution for injection",
  "unit": "vial",
  "price": 477.69,
  "ved": "E",
  "abc": "C",
  "tmtId": "813587",
  "gpId": "762650",
  "master": {
   "type": "DRUG",
   "name": "Equine rabies immunoglobulin",
   "strength": "1000 iu/5 mL",
   "form": "solution for injection",
   "baseUnit": "vial",
   "cold": true,
   "blood": false,
   "highAlert": false,
   "emergency": "SUPPORTIVE",
   "internalCode": ""
  },
  "mapping": {
   "status": "VERIFIED",
   "method": "TMT",
   "confidence": 0.992,
   "factor": 1.0,
   "packUnit": "กล่อง",
   "basePerPack": 5.0,
   "manufacturer": "บริษัท เภสัชภัณฑ์ไทย จำกัด (ตัวอย่าง)",
   "suggestedBy": "RULES",
   "verifiedAt": "2016-09-20"
  },
  "candidates": []
 },
 {
  "localCode": "A59311",
  "localName": "Cobra antivenin 600 mcg/1 mL powder and solvent for solution for injection",
  "unit": "vial",
  "price": 1824.14,
  "ved": "V",
  "abc": "C",
  "tmtId": "762293",
  "gpId": "762264",
  "master": null,
  "mapping": {
   "status": "SUGGESTED",
   "method": "TMT",
   "confidence": 0.701,
   "factor": 1.0,
   "packUnit": "กล่อง",
   "basePerPack": 10.0,
   "manufacturer": "บริษัท ยาไทยเคมี จำกัด (ตัวอย่าง)",
   "suggestedBy": "AGENT",
   "verifiedAt": ""
  },
  "candidates": [
   {
    "tmt": "762293",
    "name": "COBRA ANTIVENIN (สถานเสาวภา สภากาชาดไทย) (cobra antivenin 600 mcg/1 mL) powder and solvent for solution for injection, 10 mL vial",
    "score": 0.77,
    "parts": {
     "name": 0.385,
     "strength": 0.154,
     "form": 0.115,
     "unit": 0.115
    }
   },
   {
    "tmt": "1033701",
    "name": "RESPIMOL (ที.โอ. เคมีคอลส์ (1979) (ปทุมธานี)) (salbutamol 100 mcg/1 dose) pressurised inhalation, suspension, 200 dose actuation",
    "score": 0.4,
    "parts": {
     "name": 0.2,
     "strength": 0.08,
     "form": 0.06,
     "unit": 0.06
    }
   }
  ]
 },
 {
  "localCode": "A90117",
  "localName": "Pralidoxime 1 g powder for solution for injection/infusion",
  "unit": "vial",
  "price": 423.03,
  "ved": "V",
  "abc": "C",
  "tmtId": "697784",
  "gpId": "697750",
  "master": {
   "type": "DRUG",
   "name": "Pralidoxime",
   "strength": "1 g",
   "form": "powder for solution for injection/infusion",
   "baseUnit": "vial",
   "cold": false,
   "blood": false,
   "highAlert": false,
   "emergency": "CRITICAL",
   "internalCode": ""
  },
  "mapping": {
   "status": "VERIFIED",
   "method": "TMT",
   "confidence": 0.938,
   "factor": 1.0,
   "packUnit": "กล่อง",
   "basePerPack": 10.0,
   "manufacturer": "บริษัท เภสัชภัณฑ์ไทย จำกัด (ตัวอย่าง)",
   "suggestedBy": "RULES",
   "verifiedAt": "2016-09-18"
  },
  "candidates": []
 },
 {
  "localCode": "A56380",
  "localName": "N95 respirator - mask",
  "unit": "ชิ้น",
  "price": 26.1,
  "ved": "E",
  "abc": "B",
  "tmtId": "",
  "gpId": "",
  "master": {
   "type": "SUPPLY",
   "name": "N95 respirator",
   "strength": "-",
   "form": "mask",
   "baseUnit": "ชิ้น",
   "cold": false,
   "blood": false,
   "highAlert": false,
   "emergency": "SUPPORTIVE",
   "internalCode": "SUP-0001"
  },
  "mapping": {
   "status": "VERIFIED",
   "method": "CENTRAL_LIST",
   "confidence": null,
   "factor": 1.0,
   "packUnit": "กล่อง",
   "basePerPack": 20.0,
   "manufacturer": "บริษัท ยาไทยเคมี จำกัด (ตัวอย่าง)",
   "suggestedBy": "CENTRAL_LIST",
   "verifiedAt": "2016-09-23"
  },
  "candidates": []
 },
 {
  "localCode": "A44805",
  "localName": "ชุด PPE - set",
  "unit": "ชุด",
  "price": 154.92,
  "ved": "E",
  "abc": "A",
  "tmtId": "",
  "gpId": "",
  "master": {
   "type": "SUPPLY",
   "name": "ชุด PPE",
   "strength": "-",
   "form": "set",
   "baseUnit": "ชุด",
   "cold": false,
   "blood": false,
   "highAlert": false,
   "emergency": "SUPPORTIVE",
   "internalCode": "SUP-0002"
  },
  "mapping": {
   "status": "VERIFIED",
   "method": "CENTRAL_LIST",
   "confidence": null,
   "factor": 1.0,
   "packUnit": "กล่อง",
   "basePerPack": 10.0,
   "manufacturer": "บริษัท ยาไทยเคมี จำกัด (ตัวอย่าง)",
   "suggestedBy": "CENTRAL_LIST",
   "verifiedAt": "2016-09-20"
  },
  "candidates": []
 },
 {
  "localCode": "A26167",
  "localName": "ชุดตรวจ ATK - test",
  "unit": "test",
  "price": 63.92,
  "ved": "D",
  "abc": "C",
  "tmtId": "",
  "gpId": "",
  "master": {
   "type": "SUPPLY",
   "name": "ชุดตรวจ ATK",
   "strength": "-",
   "form": "test",
   "baseUnit": "test",
   "cold": false,
   "blood": false,
   "highAlert": false,
   "emergency": "SUPPORTIVE",
   "internalCode": "SUP-0003"
  },
  "mapping": {
   "status": "VERIFIED",
   "method": "CENTRAL_LIST",
   "confidence": null,
   "factor": 1.0,
   "packUnit": "กล่อง",
   "basePerPack": 50.0,
   "manufacturer": "บริษัท เภสัชภัณฑ์ไทย จำกัด (ตัวอย่าง)",
   "suggestedBy": "CENTRAL_LIST",
   "verifiedAt": "2016-09-20"
  },
  "candidates": []
 },
 {
  "localCode": "A79220",
  "localName": "ถุงมือไนไตรล์ 100 ชิ้น/กล่อง box",
  "unit": "กล่อง",
  "price": 172.97,
  "ved": "E",
  "abc": "A",
  "tmtId": "",
  "gpId": "",
  "master": {
   "type": "SUPPLY",
   "name": "ถุงมือไนไตรล์",
   "strength": "100 ชิ้น/กล่อง",
   "form": "box",
   "baseUnit": "กล่อง",
   "cold": false,
   "blood": false,
   "highAlert": false,
   "emergency": "SUPPORTIVE",
   "internalCode": "SUP-0004"
  },
  "mapping": {
   "status": "VERIFIED",
   "method": "CENTRAL_LIST",
   "confidence": null,
   "factor": 1.0,
   "packUnit": "กล่อง",
   "basePerPack": 10.0,
   "manufacturer": "บริษัท ยาไทยเคมี จำกัด (ตัวอย่าง)",
   "suggestedBy": "CENTRAL_LIST",
   "verifiedAt": "2016-09-22"
  },
  "candidates": []
 },
 {
  "localCode": "A85038",
  "localName": "IV catheter 18G 18G catheter",
  "unit": "ชิ้น",
  "price": 13.11,
  "ved": "V",
  "abc": "B",
  "tmtId": "",
  "gpId": "",
  "master": {
   "type": "SUPPLY",
   "name": "IV catheter 18G",
   "strength": "18G",
   "form": "catheter",
   "baseUnit": "ชิ้น",
   "cold": false,
   "blood": false,
   "highAlert": false,
   "emergency": "SUPPORTIVE",
   "internalCode": "SUP-0005"
  },
  "mapping": {
   "status": "VERIFIED",
   "method": "CENTRAL_LIST",
   "confidence": null,
   "factor": 1.0,
   "packUnit": "กล่อง",
   "basePerPack": 100.0,
   "manufacturer": "บริษัท เภสัชภัณฑ์ไทย จำกัด (ตัวอย่าง)",
   "suggestedBy": "CENTRAL_LIST",
   "verifiedAt": "2016-09-26"
  },
  "candidates": []
 },
 {
  "localCode": "A22043",
  "localName": "ชุดทำแผล - set",
  "unit": "ชุด",
  "price": 27.03,
  "ved": "E",
  "abc": "A",
  "tmtId": "",
  "gpId": "",
  "master": {
   "type": "SUPPLY",
   "name": "ชุดทำแผล",
   "strength": "-",
   "form": "set",
   "baseUnit": "ชุด",
   "cold": false,
   "blood": false,
   "highAlert": false,
   "emergency": "SUPPORTIVE",
   "internalCode": "SUP-0006"
  },
  "mapping": {
   "status": "VERIFIED",
   "method": "CENTRAL_LIST",
   "confidence": null,
   "factor": 1.0,
   "packUnit": "กล่อง",
   "basePerPack": 100.0,
   "manufacturer": "บริษัท ยาไทยเคมี จำกัด (ตัวอย่าง)",
   "suggestedBy": "CENTRAL_LIST",
   "verifiedAt": "2016-09-22"
  },
  "candidates": []
 },
 {
  "localCode": "A71105",
  "localName": "PRC group O (packed red cells) 1 unit ~300 mL blood component",
  "unit": "ยูนิต",
  "price": 452.02,
  "ved": "V",
  "abc": "A",
  "tmtId": "",
  "gpId": "",
  "master": {
   "type": "BLOOD",
   "name": "PRC group O (packed red cells)",
   "strength": "1 unit ~300 mL",
   "form": "blood component",
   "baseUnit": "ยูนิต",
   "cold": false,
   "blood": true,
   "highAlert": false,
   "emergency": "CRITICAL",
   "internalCode": "BLD-0001"
  },
  "mapping": {
   "status": "VERIFIED",
   "method": "CENTRAL_LIST",
   "confidence": null,
   "factor": 1.0,
   "packUnit": "กล่อง",
   "basePerPack": 2.0,
   "manufacturer": "องค์การเภสัชกรรม (ตัวอย่าง)",
   "suggestedBy": "CENTRAL_LIST",
   "verifiedAt": "2016-09-27"
  },
  "candidates": []
 },
 {
  "localCode": "A37000",
  "localName": "Ethyl alcohol 70 mL/100 mL gel",
  "unit": "ขวด",
  "price": 75.69,
  "ved": "D",
  "abc": "B",
  "tmtId": "816423",
  "gpId": "816410",
  "master": {
   "type": "DRUG",
   "name": "Ethyl alcohol",
   "strength": "70 mL/100 mL",
   "form": "gel",
   "baseUnit": "ขวด",
   "cold": false,
   "blood": false,
   "highAlert": false,
   "emergency": "SUPPORTIVE",
   "internalCode": ""
  },
  "mapping": {
   "status": "VERIFIED",
   "method": "TMT",
   "confidence": 0.94,
   "factor": 1.0,
   "packUnit": "กล่อง",
   "basePerPack": 12.0,
   "manufacturer": "บริษัท ยาไทยเคมี จำกัด (ตัวอย่าง)",
   "suggestedBy": "RULES",
   "verifiedAt": "2016-09-17"
  },
  "candidates": []
 }
];
