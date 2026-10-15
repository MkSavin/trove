/** A failure the user can fix: printed as is, without a stack. */
export class TroveError extends Error {
  override name = "TroveError";
}
