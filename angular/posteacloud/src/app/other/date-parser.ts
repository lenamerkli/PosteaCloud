/**
 * The backend formats dates as `%Y-%m-%d_%H-%M-%S` (e.g. `2024-01-02_15-04-05`).
 * This helper converts such a string into a native `Date`.
 */
export function parseBackendDate(value: string): Date {
  const [datePart, timePart] = value.split('_');
  const time = (timePart ?? '00-00-00').replace(/-/g, ':');
  return new Date(`${datePart}T${time}`);
}