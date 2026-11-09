// Sort TCP scan results by reachability without changing the original response.
// A refused TCP connection is CLOSED, not OPEN; a timeout is inconclusive.
const STATUS_PRIORITY = Object.freeze({
  OPEN: 0,
  CLOSED: 1,
  TIMEOUT: 2,
  ERROR: 3,
});

export function sortPortResults(results) {
  if (!Array.isArray(results)) return [];
  return [...results].sort((left, right) => {
    const first = STATUS_PRIORITY[left?.status] ?? 4;
    const second = STATUS_PRIORITY[right?.status] ?? 4;
    if (first !== second) return first - second;
    return (Number(left?.port) || 0) - (Number(right?.port) || 0);
  });
}
