/**
 * Authoritative session-only Edit Authorization Service.
 *
 * State lives strictly in Main process memory and is NEVER persisted across restarts
 * or project switches.
 */
export class EditAuthorizationService {
  private authorizedProjectId: string | null = null;

  /**
   * Authorizes Edit mode for a specific, verified registered project.
   */
  public enableForProject(projectId: string, projectExists: boolean): boolean {
    if (!projectExists || typeof projectId !== 'string' || !projectId.trim()) {
      this.authorizedProjectId = null;
      return false;
    }
    this.authorizedProjectId = projectId;
    return true;
  }

  /**
   * Revokes Edit authorization immediately.
   */
  public disable(): void {
    this.authorizedProjectId = null;
  }

  /**
   * Checks whether Edit permission is actively authorized for the given project.
   */
  public isAuthorized(projectId: string): boolean {
    if (!this.authorizedProjectId || typeof projectId !== 'string' || !projectId.trim()) {
      return false;
    }
    return this.authorizedProjectId === projectId;
  }

  /**
   * Returns current authorization state snapshot.
   */
  public getState(): { authorized: boolean; authorizedProjectId: string | null } {
    return {
      authorized: this.authorizedProjectId !== null,
      authorizedProjectId: this.authorizedProjectId,
    };
  }
}
