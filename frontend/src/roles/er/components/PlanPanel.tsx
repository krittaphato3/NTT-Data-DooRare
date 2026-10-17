import { useState } from 'react';
import type { IncidentAccess } from '../data/access';
import { PRESET_KITS } from '../data/incident';
import type { Scenario } from '../data/scenario';
import { AgentAssessmentCard } from './AgentAssessmentCard';
import { ExtraDrugsTable } from './ExtraDrugsTable';
import { PlanScopeNote } from './PlanScopeNote';
import { PresetKitTable } from './PresetKitTable';
import { RequirementSummaryCard } from './RequirementSummaryCard';

interface PlanPanelProps {
  scenario: Scenario;
  setScenario: (s: Scenario) => void;
  access: IncidentAccess;
}

/** UI-12 supply plan. Owns the plan edit state (kits, answers to the Agent, draft v3 / approval). */
export function PlanPanel({ scenario, setScenario, access }: PlanPanelProps) {
  const [kits, setKits] = useState(PRESET_KITS);
  const [burnKitOption, setBurnKitOption] = useState<'none' | 'add'>('none');
  const [prcOption, setPrcOption] = useState<'4' | '6'>('4');
  // ER edits to plan v2 make a draft v3 that ER must approve before extra urgent borrows go out.
  const [planDirty, setPlanDirty] = useState(false);
  const [planApproved, setPlanApproved] = useState(false);

  const editPlan = () => {
    setPlanDirty(true);
    setPlanApproved(false);
  };

  const updateAssembleQty = (index: number, delta: number) => {
    editPlan();
    setKits((prev) =>
      prev.map((k, i) => {
        if (i !== index) return k;
        const nextAssemble = Math.max(0, Math.min(k.maxAssemble, k.assembleFromParts + delta));
        const needed = Math.max(0, k.estimated - k.readyInStock - nextAssemble);
        return {
          ...k,
          assembleFromParts: nextAssemble,
          borrowFullKit: needed,
        };
      })
    );
  };

  const answerBurnKit = (option: 'none' | 'add') => {
    setBurnKitOption(option);
    editPlan();
    if (option === 'add') setScenario('s5'); // preview S5 (no recipe)
  };

  const answerPrc = (option: '4' | '6') => {
    setPrcOption(option);
    editPlan();
  };

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      {/* Left column: preset kits + extra drugs */}
      <div style={{ flex: '1 1 640px', minWidth: 320, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <PresetKitTable kits={kits} access={access} onAssembleChange={updateAssembleQty} />
        <ExtraDrugsTable />
        <PlanScopeNote />
      </div>

      {/* Right column: Agent assessment + requirement summary */}
      <div style={{ flex: '1 1 320px', minWidth: 280, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <AgentAssessmentCard
          scenario={scenario}
          burnKitOption={burnKitOption}
          prcOption={prcOption}
          access={access}
          onBurnKit={answerBurnKit}
          onPrc={answerPrc}
        />
        <RequirementSummaryCard
          planDirty={planDirty}
          planApproved={planApproved}
          access={access}
          onApprove={() => setPlanApproved(true)}
        />
      </div>
    </div>
  );
}
