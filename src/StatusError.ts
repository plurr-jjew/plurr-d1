export class StatusError extends Error {
  statusCode = 400;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'Http Error'; // Optional: Give it a specific name
    this.statusCode = statusCode;
  }
}

