export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}
export const unauthorized = () => new ApiError(401, "UNAUTHENTICATED", "Please sign in to continue.");
export const forbidden = (msg = "You do not have permission to do that.") => new ApiError(403, "FORBIDDEN", msg);
export const notFound = (msg = "Not found.") => new ApiError(404, "NOT_FOUND", msg);
export const badRequest = (msg: string, extra?: Record<string, unknown>) => new ApiError(400, "BAD_REQUEST", msg, extra);
export const conflict = (msg: string) => new ApiError(409, "CONFLICT", msg);
export const tooMany = (retryAfter: number) => new ApiError(429, "RATE_LIMITED", "Too many requests. Please slow down and try again shortly.", { retryAfter });
