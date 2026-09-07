/** Links prefill a draft; visiting a public page never sends an agent message. */
export function assistantLink(prompt: string) {
  return `/chat?draft=${encodeURIComponent(prompt)}`;
}
