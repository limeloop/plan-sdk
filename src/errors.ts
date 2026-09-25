// Typed errors, one per `code` in the api's error shape (api/src/http/error.rs).
// Match by `instanceof`, not by reading `.code` yourself.

export interface ApiErrorBody {
  code: string;
  message: string;
  /** Present only on `conflict`: reload with this version. */
  current_version?: number;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
  }
}

/** No valid sign-in token. Sign in again. */
export class UnauthenticatedError extends ApiError {
  constructor(status: number, body: ApiErrorBody) {
    super(status, body);
    this.name = 'UnauthenticatedError';
  }
}

/** Missing or wrong `x-publishable-key`. A setup problem, not the user's. */
export class InvalidPublishableKeyError extends ApiError {
  constructor(status: number, body: ApiErrorBody) {
    super(status, body);
    this.name = 'InvalidPublishableKeyError';
  }
}

/** Signed in, but not linked to an active person with access. */
export class NoAccessError extends ApiError {
  constructor(status: number, body: ApiErrorBody) {
    super(status, body);
    this.name = 'NoAccessError';
  }
}

/** Signed in, but this role may not do that. */
export class ForbiddenError extends ApiError {
  constructor(status: number, body: ApiErrorBody) {
    super(status, body);
    this.name = 'ForbiddenError';
  }
}

/** The request itself is malformed: bad JSON, a wrong type, an unknown field. */
export class InvalidError extends ApiError {
  constructor(status: number, body: ApiErrorBody) {
    super(status, body);
    this.name = 'InvalidError';
  }
}

/** Not there, or not visible to you: the two are never told apart. */
export class NotFoundError extends ApiError {
  constructor(status: number, body: ApiErrorBody) {
    super(status, body);
    this.name = 'NotFoundError';
  }
}

/**
 * Someone else saved first. Show "{name} changed this while you were
 * editing", with `currentVersion` and a reload button. Never retry
 * automatically.
 */
export class ConflictError extends ApiError {
  readonly currentVersion: number;

  constructor(status: number, body: ApiErrorBody) {
    super(status, body);
    this.name = 'ConflictError';
    this.currentVersion = body.current_version ?? 0;
  }
}

/** A rule was violated (e.g. "Simon is already on Team 2 that day"). Show the message as-is. */
export class ConstraintError extends ApiError {
  constructor(status: number, body: ApiErrorBody) {
    super(status, body);
    this.name = 'ConstraintError';
  }
}

/** Sign-in isn't configured on this server, or it can't reach Rauthy's keys right now. */
export class UnavailableError extends ApiError {
  constructor(status: number, body: ApiErrorBody) {
    super(status, body);
    this.name = 'UnavailableError';
  }
}

/** Something went wrong on the server; nothing the caller did was invalid. */
export class InternalError extends ApiError {
  constructor(status: number, body: ApiErrorBody) {
    super(status, body);
    this.name = 'InternalError';
  }
}

/** The request never reached the server: offline, DNS, CORS, a dropped connection. */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super('Could not reach the api.', { cause });
    this.name = 'NetworkError';
  }
}

const BY_CODE: Record<string, new (status: number, body: ApiErrorBody) => ApiError> = {
  unauthenticated: UnauthenticatedError,
  invalid_publishable_key: InvalidPublishableKeyError,
  no_access: NoAccessError,
  forbidden: ForbiddenError,
  invalid: InvalidError,
  not_found: NotFoundError,
  conflict: ConflictError,
  constraint: ConstraintError,
  unavailable: UnavailableError,
  internal: InternalError,
};

/** Build the typed error for a non-2xx response, from its parsed JSON body. */
export function errorFromResponse(status: number, json: unknown): ApiError {
  const body =
    json && typeof json === 'object' && 'error' in json
      ? (json as { error: unknown }).error
      : null;
  if (!body || typeof body !== 'object' || typeof (body as ApiErrorBody).code !== 'string') {
    return new ApiError(status, {
      code: 'unknown',
      message: `Unexpected error response (${status}).`,
    });
  }
  const b = body as ApiErrorBody;
  const ErrorClass = BY_CODE[b.code] ?? ApiError;
  return new ErrorClass(status, b);
}
