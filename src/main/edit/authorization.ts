import { PermissionLevel, SessionAuthorizationState } from '../../shared/types';

/**
 * Authoritative session-only Session Authorization Service.
 *
 * State lives strictly in Main process memory and is NEVER persisted across restarts
 * or project switches.
 *
 * Permissions:
 *   READ:  Safe read-only inspection (default).
 *   EDIT:  Text/code mutations, automatic checkpoint, diff, rollback.
 *   AGENT: Everything in EDIT + requesting supervised project process executions.
 *   YOLO:  Permanently LOCKED in v0.6.0.
 */
export class SessionAuthorizationService {
  private authorizedProjectId: string | null = null;
  private permissionLevel: PermissionLevel = 'READ';

  /**
   * Authorizes Edit mode for a specific, verified registered project.
   */
  public enableEditForProject(projectId: string, projectExists: boolean): boolean {
    if (!projectExists || typeof projectId !== 'string' || !projectId.trim()) {
      this.disableAll();
      return false;
    }
    this.authorizedProjectId = projectId.trim();
    this.permissionLevel = 'EDIT';
    return true;
  }

  /**
   * Authorizes Agent mode for a specific, verified registered project.
   */
  public enableAgentForProject(projectId: string, projectExists: boolean): boolean {
    if (!projectExists || typeof projectId !== 'string' || !projectId.trim()) {
      this.disableAll();
      return false;
    }
    this.authorizedProjectId = projectId.trim();
    this.permissionLevel = 'AGENT';
    return true;
  }

  public enableEdit(projectId: string): { authorized: boolean; authorizedProjectId: string | null; level: PermissionLevel } {
    const ok = this.enableEditForProject(projectId, true);
    return {
      authorized: ok,
      authorizedProjectId: this.authorizedProjectId,
      level: this.permissionLevel,
    };
  }

  public enableAgent(projectId: string): { authorized: boolean; authorizedProjectId: string | null; permissionLevel: PermissionLevel } {
    const ok = this.enableAgentForProject(projectId, true);
    return {
      authorized: ok,
      authorizedProjectId: this.authorizedProjectId,
      permissionLevel: this.permissionLevel,
    };
  }

  public getLevel(projectId?: string): PermissionLevel {
    if (projectId && this.authorizedProjectId !== projectId) {
      return 'READ';
    }
    return this.permissionLevel;
  }

  /**
   * Rejects any attempt to enable YOLO mode (permanently locked in v0.6.0).
   */
  public enableYolo(): never {
    throw new Error('YOLO mode is locked in Model Forge v0.6.0.');
  }

  /**
   * Revokes all authorizations immediately, resetting session to READ.
   */
  public disableAll(): void {
    this.authorizedProjectId = null;
    this.permissionLevel = 'READ';
  }

  /**
   * Checks whether Edit permission is actively authorized for the given project.
   * Both EDIT and AGENT permission levels have Edit access.
   */
  public isEditAuthorized(projectId: string): boolean {
    if (!this.authorizedProjectId || typeof projectId !== 'string' || !projectId.trim()) {
      return false;
    }
    return (
      this.authorizedProjectId === projectId &&
      (this.permissionLevel === 'EDIT' || this.permissionLevel === 'AGENT')
    );
  }

  /**
   * Checks whether Agent permission is actively authorized for the given project.
   * Only AGENT level is authorized to request supervised processes.
   */
  public isAgentAuthorized(projectId: string): boolean {
    if (!this.authorizedProjectId || typeof projectId !== 'string' || !projectId.trim()) {
      return false;
    }
    return this.authorizedProjectId === projectId && this.permissionLevel === 'AGENT';
  }

  public canExecuteProcesses(projectId: string): boolean {
    return this.isAgentAuthorized(projectId);
  }

  /**
   * Returns current session authorization state.
   */
  public getSessionState(): SessionAuthorizationState {
    return {
      permissionLevel: this.permissionLevel,
      authorizedProjectId: this.authorizedProjectId,
    };
  }

  // --- Backwards Compatibility with Pass 5 EditAuthorizationService API ---

  public enableForProject(projectId: string, projectExists: boolean): boolean {
    return this.enableEditForProject(projectId, projectExists);
  }

  public disable(): void {
    this.disableAll();
  }

  public isAuthorized(projectId: string): boolean {
    return this.isEditAuthorized(projectId);
  }

  public getState(): { authorized: boolean; authorizedProjectId: string | null } {
    return {
      authorized: this.authorizedProjectId !== null && this.permissionLevel !== 'READ',
      authorizedProjectId: this.authorizedProjectId,
    };
  }
}

/**
 * Backwards compatibility alias for Pass 5 imports.
 */
export const EditAuthorizationService = SessionAuthorizationService;
export type EditAuthorizationService = SessionAuthorizationService;
