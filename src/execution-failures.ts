export type ExecutionStage =
  'registration' | 'resolution' | 'preflight' | 'prepareLaunch' | 'launch' | 'finalize';

// Records errors in observation order; later cleanup failures never replace the primary stage.
export class ExecutionFailures {
  private readonly errors: unknown[] = [];
  private primaryStage: ExecutionStage = 'registration';

  get stage(): ExecutionStage {
    return this.primaryStage;
  }
  get hasFailures(): boolean {
    return 0 < this.errors.length;
  }

  record(error: unknown, stage: ExecutionStage): void {
    if (!this.hasFailures) {
      this.primaryStage = stage;
    }
    this.errors.push(error);
  }

  throwIfAny(): void {
    if (this.hasFailures) {
      throw new AggregateError(this.errors, `Arch execution failed during ${this.primaryStage}`, {
        cause: this.errors[0],
      });
    }
  }
}
