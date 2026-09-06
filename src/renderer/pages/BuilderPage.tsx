import React from 'react';
import { TopStatusCards } from './builder/TopStatusCards';
import { PromptComposer } from './builder/PromptComposer';
import { AgentPermissions } from './builder/AgentPermissions';
import { AgentActivity } from './builder/AgentActivity';
import { WorkspaceTabs } from './builder/WorkspaceTabs';
import './BuilderPage.css';

export const BuilderPage: React.FC = () => {
  return (
    <div className="builder-page">
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
    </div>
  );
};
