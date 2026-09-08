import React from 'react';
import { TopStatusCards } from './builder/TopStatusCards';
import { PromptComposer } from './builder/PromptComposer';
import { AgentPermissions } from './builder/AgentPermissions';
import { AgentActivity } from './builder/AgentActivity';
import { WorkspaceTabs } from './builder/WorkspaceTabs';
import { CrashRecoveryBanner } from './builder/CrashRecoveryBanner';
import { EditPermissionModal } from '@/components/common/EditPermissionModal';
import { AgentEnableModal } from '@/components/common/AgentEnableModal';
import './BuilderPage.css';

export const BuilderPage: React.FC = () => {
  return (
    <div className="builder-page">
      {/* 0. Crash / Interrupted Session Recovery Banner */}
      <CrashRecoveryBanner />

      {/* 1. Top Status Cards */}
      <TopStatusCards />

      {/* 2. Middle Row: Composer + Permissions on Left, Activity on Right */}
      <div className="builder-middle-row">
        <div className="builder-left-col">
          <PromptComposer />
          <AgentPermissions />
        </div>
        <div className="builder-right-col">
          <AgentActivity />
        </div>
      </div>

      {/* 3. Bottom Workspace Tabs */}
      <div className="builder-bottom-row">
        <WorkspaceTabs />
      </div>

      {/* 4. Permission Confirmation Modals */}
      <EditPermissionModal />
      <AgentEnableModal />
    </div>
  );
};
