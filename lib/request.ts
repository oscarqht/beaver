export async function readJsonBody<T>(request: Request): Promise<T> {
  const text = await request.text();
  if (!text.trim()) {
    return {} as T;
  }
  return JSON.parse(text) as T;
}
