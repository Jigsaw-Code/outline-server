// Makes an CustomEvent that bubbles up beyond the shadow root.
export function makePublicEvent(name: string, detail?: {}) {
  const params = {
    bubbles: true,
    composed: true,
    detail,
  };
  return new CustomEvent(name, params);
}
