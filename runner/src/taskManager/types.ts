export interface TaskSnapshot {
  id: number;
  timestamp: Date;
  providerGenerationIDs: Map<string, number>;
}
