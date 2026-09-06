import React from 'react';
import { Users, UserPlus, Compass, Code2, Eye, ShieldCheck } from 'lucide-react';
import { useAppStore } from '@/store/AppStoreContext';
import './TeamsPage.css';

export const TeamsPage: React.FC = () => {
  const { addToast } = useAppStore();

  const teamRoles = [
    {
      role: 'Architect',
      icon: Compass,
      desc: 'High-context reasoning model that analyzes the workspace, defines specifications, and breaks tasks into implementation steps.',
      modelHint: 'Target: Large context (e.g. Qwen 32B / Llama 70B)',
    },
    {
      role: 'Coder',
      icon: Code2,
      desc: 'High-speed code synthesis model focused on writing clean, idiomatic TypeScript, functions, and modules.',
      modelHint: 'Target: Fast coder (e.g. Qwen Coder 14B / DeepSeek R1)',
    },
    {
      role: 'Reviewer',
      icon: Eye,
      desc: 'Critical inspection model checking syntax, security vulnerabilities, edge cases, and architectural adherence.',
      modelHint: 'Target: Precision reasoning model',
    },
    {
      role: 'Tester',
      icon: ShieldCheck,
      desc: 'Autonomous test builder that generates comprehensive unit, integration, and regression suites.',
      modelHint: 'Target: Test specialist model',
    },
  ];

  const handleCreateTeam = () => {
    addToast('Multi-model team orchestration engine will be introduced in Pass 4.', 'info');
  };

  return (
    <div className="teams-page">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Teams</h1>
          <p className="page-subtitle">Coordinated multi-model autonomous agent workflows</p>
        </div>
        <button className="btn btn-primary" onClick={handleCreateTeam}>
          <UserPlus size={14} />
          <span>Create your first AI team</span>
        </button>
      </div>

      <div className="teams-hero-banner panel">
        <div className="teams-hero-icon">
          <Users size={32} className="text-secondary" />
        </div>
        <div className="teams-hero-text">
          <h2>Specialized Local Models Working in Harmony</h2>
          <p>
            Rather than relying on one generalist model for everything, Model Forge will allow you to route
            planning, coding, auditing, and test generation to distinct local models running seamlessly on your machine.
          </p>
        </div>
      </div>

      <div className="team-roles-grid">
        {teamRoles.map((r) => {
          const Icon = r.icon;
          return (
            <div key={r.role} className="panel role-card">
              <div className="role-card-header">
                <div className="role-icon-box">
                  <Icon size={18} />
                </div>
                <span className="role-name">{r.role}</span>
              </div>
              <p className="role-desc">{r.desc}</p>
              <div className="role-model-hint font-mono">{r.modelHint}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
