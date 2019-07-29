class OutlineError extends Error {
  constructor(message: string) {
    super(message);
    // https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-2.html#support-for-newtarget
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidPortNumber extends OutlineError {
  // Since this is the error when a non-numeric value is passed to `port`, it takes type `any`.
  // tslint:disable-next-line: no-any
  constructor(public port: any) {
    super(`Outline needs an integer port number between 1 and 65535.  Instead got ${port}.`);
  }
}

export class PortInUse extends OutlineError {
  constructor(public port: number) {
    super(`Attempted to start an Outline server on port ${port}, which is already in use.`);
  }
}
