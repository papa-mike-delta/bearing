// Shared Daily close refusal contract for runtime guards and receipt rendering.
// The prefix survives SDK serialization into a stored output-error part.
export const closeRefusalPrefix = "Daily close refused: ";
export class CloseRefusal extends Error {
  constructor(reason: string) {
    super(`${closeRefusalPrefix}${reason}`);
  }
}

