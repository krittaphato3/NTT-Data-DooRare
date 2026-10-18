/** Error carrying an HTTP status and a machine code; `errorHandler` turns it into a Problem JSON body. */
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
